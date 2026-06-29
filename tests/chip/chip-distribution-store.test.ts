// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isChipDistributionComplete,
  planChipDistributionWork,
  readChipDistributionForDate,
  readChipDistributionStatusesForRun,
  readLatestChipDistributionRun,
  replaceChipDistribution,
  upsertChipDistributionStatus,
  writeChipDistributionRun,
} from "@/lib/chip/chip-store";
import type {
  ChipDistributionStatusRecord,
  ChipDistributionTarget,
} from "@/lib/chip/chip-types";

const tempRoots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function useTempStore() {
  const root = mkdtempSync(path.join(tmpdir(), "gpwy-chip-distribution-"));
  tempRoots.push(root);
  vi.stubEnv("REFRESH_DB_PATH", path.join(root, "refresh.sqlite"));
}

function target(
  overrides: Partial<ChipDistributionTarget> = {},
): ChipDistributionTarget {
  return {
    screeningRunId: 5,
    tsCode: "000001.SZ",
    targetKind: "latest",
    tradeDate: "20260211",
    ...overrides,
  };
}

function status(
  overrides: Partial<
    Omit<ChipDistributionStatusRecord, "chipDistributionRunId" | "updatedAt">
  > = {},
): Omit<ChipDistributionStatusRecord, "chipDistributionRunId" | "updatedAt"> {
  return {
    ...target(),
    status: "succeeded",
    source: "cyq_chips_highest_percent",
    errorCategory: null,
    errorSummary: null,
    ...overrides,
  };
}

describe("chip distribution store", () => {
  it("transactionally replaces one stock-date distribution without stale prices", () => {
    useTempStore();

    replaceChipDistribution({
      tsCode: "000001.SZ",
      tradeDate: "20260211",
      levels: [
        { price: 10.1, percent: 2 },
        { price: 10.2, percent: 4 },
        { price: 10.3, percent: 6 },
      ],
      now: new Date("2026-02-11T00:00:00.000Z"),
    });
    replaceChipDistribution({
      tsCode: "000001.SZ",
      tradeDate: "20260211",
      levels: [{ price: 9.9, percent: 8 }],
      now: new Date("2026-02-11T01:00:00.000Z"),
    });

    const run = writeChipDistributionRun({
      screeningRunId: 5,
      status: "succeeded",
      totalTargets: 1,
      successCount: 1,
      blockedCount: 0,
      failedCount: 0,
      missingCount: 0,
      statuses: [status()],
      now: new Date("2026-02-11T02:00:00.000Z"),
    });

    expect(readChipDistributionForDate("000001.SZ", "20260211")).toEqual([
      {
        tsCode: "000001.SZ",
        tradeDate: "20260211",
        price: 9.9,
        percent: 8,
      },
    ]);
    expect(readLatestChipDistributionRun()).toEqual(run);
    expect(isChipDistributionComplete(target())).toBe(true);
  });

  it("stores latest and previous target statuses independently for the same stock", () => {
    useTempStore();
    replaceChipDistribution({
      tsCode: "000001.SZ",
      tradeDate: "20260210",
      levels: [{ price: 10.2, percent: 6 }],
    });

    const run = writeChipDistributionRun({
      screeningRunId: 5,
      status: "partial",
      totalTargets: 2,
      successCount: 1,
      blockedCount: 0,
      failedCount: 1,
      missingCount: 0,
      statuses: [
        status({
          targetKind: "latest",
          tradeDate: "20260211",
          status: "failed",
          source: null,
          errorCategory: "network_or_service",
          errorSummary: "Tushare 服务暂时不可用",
        }),
        status({
          targetKind: "previous",
          tradeDate: "20260210",
          status: "succeeded",
        }),
      ],
    });

    expect(
      readChipDistributionStatusesForRun(run.id).map((record) => ({
        targetKind: record.targetKind,
        tradeDate: record.tradeDate,
        status: record.status,
      })),
    ).toEqual([
      { targetKind: "latest", tradeDate: "20260211", status: "failed" },
      { targetKind: "previous", tradeDate: "20260210", status: "succeeded" },
    ]);
    expect(
      isChipDistributionComplete(target({ tradeDate: "20260211" })),
    ).toBe(false);
    expect(
      isChipDistributionComplete(
        target({ targetKind: "previous", tradeDate: "20260210" }),
      ),
    ).toBe(true);
  });

  it("does not allow a succeeded status when the target date has no levels", () => {
    useTempStore();

    expect(() =>
      writeChipDistributionRun({
        screeningRunId: 5,
        status: "succeeded",
        totalTargets: 1,
        successCount: 1,
        blockedCount: 0,
        failedCount: 0,
        missingCount: 0,
        statuses: [status()],
      }),
    ).toThrow("succeeded_chip_distribution_requires_levels");
    expect(() =>
      upsertChipDistributionStatus({
        chipDistributionRunId: 99,
        ...status(),
      }),
    ).toThrow("succeeded_chip_distribution_requires_levels");
    expect(isChipDistributionComplete(target())).toBe(false);

    const run = writeChipDistributionRun({
      screeningRunId: 5,
      status: "blocked",
      totalTargets: 1,
      successCount: 0,
      blockedCount: 1,
      failedCount: 0,
      missingCount: 0,
      statuses: [
        status({
          status: "blocked",
          source: null,
          errorCategory: "empty_data",
          errorSummary: "目标交易日没有筹码分布数据",
        }),
      ],
    });
    const publicDto = readChipDistributionStatusesForRun(run.id)[0];

    expect(publicDto).toMatchObject({
      status: "blocked",
      errorCategory: "empty_data",
      errorSummary: "目标交易日没有筹码分布数据",
    });
    expect(Object.keys(publicDto ?? {})).not.toEqual(
      expect.arrayContaining([
        "databasePath",
        "token",
        "headers",
        "providerPayload",
      ]),
    );
  });

  it("plans complete, failed, blocked, missing, and unseen targets separately", () => {
    useTempStore();
    replaceChipDistribution({
      tsCode: "000001.SZ",
      tradeDate: "20260211",
      levels: [{ price: 10.2, percent: 6 }],
    });
    writeChipDistributionRun({
      screeningRunId: 5,
      status: "succeeded",
      totalTargets: 1,
      successCount: 1,
      blockedCount: 0,
      failedCount: 0,
      missingCount: 0,
      statuses: [status({ tradeDate: "20260211", status: "succeeded" })],
    });
    writeChipDistributionRun({
      screeningRunId: 5,
      status: "failed",
      totalTargets: 2,
      successCount: 0,
      blockedCount: 1,
      failedCount: 1,
      missingCount: 0,
      statuses: [
        status({
          targetKind: "previous",
          tradeDate: "20260210",
          status: "failed",
          source: null,
          errorCategory: "rate_limited",
          errorSummary: "请求触发限频",
        }),
        status({
          tsCode: "000002.SZ",
          targetKind: "latest",
          tradeDate: "20260211",
          status: "blocked",
          source: null,
          errorCategory: "permission_denied",
          errorSummary: "Tushare 接口权限不足",
        }),
      ],
    });

    const plan = planChipDistributionWork([
      target({ tradeDate: "20260211" }),
      target({ targetKind: "previous", tradeDate: "20260210" }),
      target({ tsCode: "000002.SZ", tradeDate: "20260211" }),
      target({ targetKind: "previous", tradeDate: null }),
      target({ tsCode: "000003.SZ", tradeDate: "20260211" }),
    ]);

    expect(plan.skippedCompleteCount).toBe(1);
    expect(plan.failedRetryCount).toBe(1);
    expect(plan.blockedCount).toBe(1);
    expect(plan.missingCount).toBe(1);
    expect(plan.pendingCount).toBe(1);
    expect(
      plan.items.map((item) => ({
        tsCode: item.tsCode,
        targetKind: item.targetKind,
        currentStatus: item.currentStatus,
      })),
    ).toEqual([
      {
        tsCode: "000001.SZ",
        targetKind: "previous",
        currentStatus: "failed",
      },
      { tsCode: "000003.SZ", targetKind: "latest", currentStatus: null },
    ]);
  });
});
