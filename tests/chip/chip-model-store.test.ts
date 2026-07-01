// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isCalculatedChipDistributionComplete,
  planCalculatedChipDistributionWork,
  readCalculatedChipDistribution,
  readCalculatedChipModelStatusesForRun,
  readChipModelSeedSnapshot,
  replaceCalculatedChipDistribution,
  replaceChipModelSeedSnapshot,
  writeCalculatedChipModelRun,
} from "@/lib/chip/chip-model-store";
import { readChipDistributionForDate, replaceChipDistribution } from "@/lib/chip/chip-store";
import {
  CHIP_MODEL_VERSION,
  DEFAULT_CHIP_DECAY_COEFFICIENT,
} from "@/lib/chip/chip-model";
import type { CalculatedChipDistributionWorkTarget } from "@/lib/chip/chip-types";

const tempRoots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function useTempStore() {
  const root = mkdtempSync(path.join(tmpdir(), "gpwy-chip-model-store-"));
  tempRoots.push(root);
  vi.stubEnv("REFRESH_DB_PATH", path.join(root, "refresh.sqlite"));
}

function key(
  overrides: Partial<CalculatedChipDistributionWorkTarget> = {},
): CalculatedChipDistributionWorkTarget {
  return {
    screeningRunId: 5,
    tsCode: "000001.SZ",
    targetKind: "latest",
    targetTradeDate: "20260629",
    seedTradeDate: "20260401",
    decayCoefficient: DEFAULT_CHIP_DECAY_COEFFICIENT,
    modelVersion: CHIP_MODEL_VERSION,
    ...overrides,
  };
}

describe("calculated chip model store", () => {
  it("stores calculated levels and seed snapshots without touching official distribution levels", () => {
    useTempStore();
    replaceChipDistribution({
      tsCode: "000001.SZ",
      tradeDate: "20260629",
      levels: [{ price: 18.2, percent: 6 }],
    });

    replaceChipModelSeedSnapshot({
      ...key(),
      levels: [
        { price: 15, percent: 40 },
        { price: 16, percent: 60 },
      ],
    });
    replaceCalculatedChipDistribution({
      ...key(),
      levels: [
        { price: 12, percent: 35 },
        { price: 15, percent: 65 },
      ],
    });

    expect(readChipModelSeedSnapshot(key())).toEqual([
      { price: 15, percent: 40 },
      { price: 16, percent: 60 },
    ]);
    expect(readCalculatedChipDistribution(key())).toEqual([
      { price: 12, percent: 35 },
      { price: 15, percent: 65 },
    ]);
    expect(readChipDistributionForDate("000001.SZ", "20260629")).toEqual([
      {
        tsCode: "000001.SZ",
        tradeDate: "20260629",
        price: 18.2,
        percent: 6,
      },
    ]);
  });

  it("keeps different decay coefficients isolated by cache key", () => {
    useTempStore();

    replaceCalculatedChipDistribution({
      ...key({ decayCoefficient: 0.5 }),
      levels: [{ price: 12, percent: 100 }],
    });
    replaceCalculatedChipDistribution({
      ...key({ decayCoefficient: 1.5 }),
      levels: [{ price: 18, percent: 100 }],
    });

    expect(readCalculatedChipDistribution(key({ decayCoefficient: 0.5 }))).toEqual([
      { price: 12, percent: 100 },
    ]);
    expect(readCalculatedChipDistribution(key({ decayCoefficient: 1.5 }))).toEqual([
      { price: 18, percent: 100 },
    ]);
  });

  it("writes statuses and plans cached, failed, blocked, missing, and unseen work separately", () => {
    useTempStore();
    replaceCalculatedChipDistribution({
      ...key({ decayCoefficient: 0.5 }),
      levels: [{ price: 12, percent: 100 }],
    });
    const run = writeCalculatedChipModelRun({
      screeningRunId: 5,
      status: "partial",
      totalTargets: 4,
      successCount: 1,
      blockedCount: 1,
      failedCount: 1,
      missingCount: 1,
      skippedCompleteCount: 0,
      statuses: [
        {
          ...key({ decayCoefficient: 0.5 }),
          status: "succeeded",
          unavailableReason: null,
          errorCategory: null,
          errorSummary: null,
        },
        {
          ...key({ decayCoefficient: 0.8 }),
          status: "failed",
          unavailableReason: null,
          errorCategory: "network_or_service",
          errorSummary: "temporary failure",
        },
        {
          ...key({ decayCoefficient: 1.2 }),
          status: "blocked",
          unavailableReason: "missing_turnover_rate",
          errorCategory: null,
          errorSummary: "missing_turnover_rate",
        },
        {
          ...key({
            decayCoefficient: 1.5,
            targetKind: "previous",
            targetTradeDate: null,
            seedTradeDate: null,
          }),
          status: "missing",
          unavailableReason: "missing_trade_data",
          errorCategory: null,
          errorSummary: "previous_trade_date_missing",
        },
      ],
    });

    expect(readCalculatedChipModelStatusesForRun(run.id)).toHaveLength(4);
    expect(isCalculatedChipDistributionComplete(key({ decayCoefficient: 0.5 }))).toBe(
      true,
    );

    const plan = planCalculatedChipDistributionWork([
      key({ decayCoefficient: 0.5 }),
      key({ decayCoefficient: 0.8 }),
      key({ decayCoefficient: 1.2 }),
      key({
        decayCoefficient: 1.5,
        targetKind: "previous",
        targetTradeDate: null,
        seedTradeDate: null,
      }),
      key({ decayCoefficient: 2 }),
    ]);

    expect(plan.skippedCompleteCount).toBe(1);
    expect(plan.failedRetryCount).toBe(1);
    expect(plan.blockedCount).toBe(1);
    expect(plan.missingCount).toBe(1);
    expect(plan.pendingCount).toBe(1);
    expect(plan.items.map((item) => item.decayCoefficient)).toEqual([0.8, 2]);
  });
});
