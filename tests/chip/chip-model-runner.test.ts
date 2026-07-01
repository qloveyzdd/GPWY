// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readCalculatedChipDistribution,
  readCalculatedChipModelStatusesForRun,
  readChipModelSeedSnapshot,
} from "@/lib/chip/chip-model-store";
import {
  resolveChipModelSeedForTarget,
  runCalculatedChipDistributionIntegrationFromLatestScreening,
} from "@/lib/chip/chip-model-runner";
import {
  CHIP_MODEL_VERSION,
  SUPPORTED_CHIP_DECAY_COEFFICIENTS,
} from "@/lib/chip/chip-model";
import { replaceChipDistribution } from "@/lib/chip/chip-store";
import {
  createMarketCacheGeneration,
  upsertMarketDailyBasics,
  upsertMarketDailyQuotes,
  upsertMarketAdjustmentFactors,
  upsertMarketGenerationDate,
} from "@/lib/refresh/market-data-store";
import { writeScreeningRun } from "@/lib/screening/screening-store";
import { TUSHARE_ENDPOINTS } from "@/lib/tushare/endpoints";
import type {
  TushareClientLike,
  TushareDataTable,
  TushareEndpoint,
} from "@/lib/tushare/types";

const tempRoots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function useTempStore() {
  const root = mkdtempSync(path.join(tmpdir(), "gpwy-chip-model-runner-"));
  tempRoots.push(root);
  vi.stubEnv("REFRESH_DB_PATH", path.join(root, "refresh.sqlite"));
}

function table(items: unknown[][]): TushareDataTable {
  return {
    fields: ["ts_code", "trade_date", "price", "percent"],
    items,
  };
}

function createMockClient(
  handler: (
    endpoint: TushareEndpoint,
    params: Record<string, unknown>,
  ) => Promise<TushareDataTable>,
): TushareClientLike {
  return {
    query: vi.fn((endpoint, params = {}) => handler(endpoint, params)),
  };
}

function modelTradeDates() {
  return [
    "20260401",
    ...Array.from({ length: 59 }, (_, index) =>
      `202605${String(index + 1).padStart(2, "0")}`,
    ),
    "20260629",
  ];
}

function fullModelTradeDates() {
  return [
    "20260331",
    "20260401",
    ...Array.from({ length: 58 }, (_, index) =>
      `202605${String(index + 1).padStart(2, "0")}`,
    ),
    "20260628",
    "20260629",
  ];
}

function createGenerationWithDates(tradeDates = modelTradeDates()) {
  const generation = createMarketCacheGeneration({
    targetTradeDateCount: tradeDates.length,
  });

  for (const tradeDate of tradeDates) {
    upsertMarketGenerationDate(generation.id, {
      tradeDate,
      dailyStatus: "succeeded",
      factorStatus: "succeeded",
    });
  }

  return generation;
}

function writeModelMarketData({
  generationId,
  tsCode,
  tradeDates,
  skipDailyBasicDates = [],
}: {
  generationId: number;
  tsCode: string;
  tradeDates: string[];
  skipDailyBasicDates?: string[];
}) {
  const skipDailyBasic = new Set(skipDailyBasicDates);

  upsertMarketAdjustmentFactors(
    generationId,
    tradeDates.map((tradeDate) => ({
      tsCode,
      tradeDate,
      adjFactor: 1,
    })),
  );
  upsertMarketDailyQuotes(
    generationId,
    tradeDates.map((tradeDate, index) => ({
      tsCode,
      tradeDate,
      open: 10 + index * 0.1,
      high: 11 + index * 0.1,
      low: 9 + index * 0.1,
      close: 10.5 + index * 0.1,
      vol: 1000 + index,
      amount: ((10.5 + index * 0.1) * (1000 + index) * 100) / 1000,
    })),
  );
  upsertMarketDailyBasics(
    generationId,
    tradeDates
      .filter((tradeDate) => !skipDailyBasic.has(tradeDate))
      .map((tradeDate) => ({
        tsCode,
        tradeDate,
        turnoverRate: 5,
        turnoverRateFreeFloat: 4,
      })),
  );
}

function writeScreeningFixture({
  generationId,
  tsCode = "002565.SZ",
}: {
  generationId: number;
  tsCode?: string;
}) {
  return writeScreeningRun({
    sourceRefreshJobId: 7,
    sourceMarketGenerationId: generationId,
    totalStocks: 1,
    matchedCount: 1,
    skippedCount: 0,
    results: [
      {
        tsCode,
        name: "顺灏股份",
        latestTradeDate: "20260629",
        currentPrice: 10.5,
        intervalHigh: 12,
        intervalHighTradeDate: "20260601",
        intervalHighSource: "swing_high",
        currentHighRatio: 0.8,
        drawdownPct: 0.2,
        ma20: 10,
        ma60: 11,
        ma20Slope: -0.1,
      },
    ],
  });
}

describe("chip model seed resolver", () => {
  it("uses cached official seed rows, locates the 60-trading-day seed, and stores an adjusted seed snapshot", async () => {
    useTempStore();
    const generation = createGenerationWithDates();
    replaceChipDistribution({
      tsCode: "002565.SZ",
      tradeDate: "20260401",
      levels: [
        { price: 10, percent: 40 },
        { price: 12, percent: 60 },
      ],
    });
    upsertMarketAdjustmentFactors(generation.id, [
      { tsCode: "002565.SZ", tradeDate: "20260401", adjFactor: 2 },
      { tsCode: "002565.SZ", tradeDate: "20260629", adjFactor: 1 },
    ]);
    const client = createMockClient(async () => table([]));

    const result = await resolveChipModelSeedForTarget({
      generationId: generation.id,
      tsCode: "002565.SZ",
      targetTradeDate: "20260629",
      modelVersion: CHIP_MODEL_VERSION,
      client,
    });

    expect(result.status).toBe("succeeded");

    if (result.status !== "succeeded") {
      throw new Error("expected_succeeded_seed");
    }

    expect(result.seedTradeDate).toBe("20260401");
    expect(result.expectedTradeDates).toHaveLength(60);
    expect(result.seedLevels).toEqual([
      { price: 20, percent: 40 },
      { price: 24, percent: 60 },
    ]);
    expect(client.query).not.toHaveBeenCalled();
    expect(
      readChipModelSeedSnapshot({
        tsCode: "002565.SZ",
        targetTradeDate: "20260629",
        seedTradeDate: "20260401",
        modelVersion: CHIP_MODEL_VERSION,
      }),
    ).toEqual(result.seedLevels);
  });

  it("fetches and caches official seed rows when cache is missing", async () => {
    useTempStore();
    const generation = createGenerationWithDates();
    upsertMarketAdjustmentFactors(generation.id, [
      { tsCode: "002565.SZ", tradeDate: "20260401", adjFactor: 1 },
      { tsCode: "002565.SZ", tradeDate: "20260629", adjFactor: 1 },
    ]);
    const client = createMockClient(async () =>
      table([["002565.SZ", "20260401", 10, 100]]),
    );

    const result = await resolveChipModelSeedForTarget({
      generationId: generation.id,
      tsCode: "002565.SZ",
      targetTradeDate: "20260629",
      modelVersion: CHIP_MODEL_VERSION,
      client,
    });

    expect(result.status).toBe("succeeded");
    expect(client.query).toHaveBeenCalledWith(
      TUSHARE_ENDPOINTS.chipChips,
      {
        ts_code: "002565.SZ",
        trade_date: "20260401",
      },
      { priority: "chip" },
    );
  });

  it("returns structured unavailable when seed rows are unavailable", async () => {
    useTempStore();
    const generation = createGenerationWithDates();
    upsertMarketAdjustmentFactors(generation.id, [
      { tsCode: "002565.SZ", tradeDate: "20260401", adjFactor: 1 },
      { tsCode: "002565.SZ", tradeDate: "20260629", adjFactor: 1 },
    ]);
    const client = createMockClient(async () => table([]));

    const result = await resolveChipModelSeedForTarget({
      generationId: generation.id,
      tsCode: "002565.SZ",
      targetTradeDate: "20260629",
      modelVersion: CHIP_MODEL_VERSION,
      client,
    });

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "missing_seed_distribution",
      errorCategory: "empty_data",
    });
  });

  it("returns missing_trade_data when the generation cannot reach 60 days before target", async () => {
    useTempStore();
    const generation = createGenerationWithDates(["20260628", "20260629"]);

    const result = await resolveChipModelSeedForTarget({
      generationId: generation.id,
      tsCode: "002565.SZ",
      targetTradeDate: "20260629",
      modelVersion: CHIP_MODEL_VERSION,
      client: createMockClient(async () => table([])),
    });

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "missing_trade_data",
    });
  });
});

describe("calculated chip distribution runner", () => {
  it("precomputes latest and previous distributions for every fixed coefficient", async () => {
    useTempStore();
    const tradeDates = fullModelTradeDates();
    const generation = createGenerationWithDates(tradeDates);
    writeModelMarketData({
      generationId: generation.id,
      tsCode: "002565.SZ",
      tradeDates,
    });
    replaceChipDistribution({
      tsCode: "002565.SZ",
      tradeDate: "20260331",
      levels: [{ price: 15, percent: 100 }],
    });
    replaceChipDistribution({
      tsCode: "002565.SZ",
      tradeDate: "20260401",
      levels: [{ price: 16, percent: 100 }],
    });
    const screeningRun = writeScreeningFixture({ generationId: generation.id });

    const run = await runCalculatedChipDistributionIntegrationFromLatestScreening({
      now: new Date("2026-06-29T16:00:00.000Z"),
    });
    const statuses = readCalculatedChipModelStatusesForRun(run.id);

    expect(run).toMatchObject({
      screeningRunId: screeningRun.id,
      status: "succeeded",
      totalTargets: 14,
      successCount: 14,
      blockedCount: 0,
      failedCount: 0,
      missingCount: 0,
    });
    expect(statuses).toHaveLength(14);
    expect(new Set(statuses.map((status) => status.decayCoefficient))).toEqual(
      new Set(SUPPORTED_CHIP_DECAY_COEFFICIENTS),
    );
    expect(statuses.filter((status) => status.targetKind === "latest")).toHaveLength(
      7,
    );
    expect(
      readCalculatedChipDistribution({
        tsCode: "002565.SZ",
        targetTradeDate: "20260629",
        seedTradeDate: "20260401",
        decayCoefficient: 0.5,
        modelVersion: CHIP_MODEL_VERSION,
      }).length,
    ).toBeGreaterThan(0);
    expect(
      readCalculatedChipDistribution({
        tsCode: "002565.SZ",
        targetTradeDate: "20260629",
        seedTradeDate: "20260401",
        decayCoefficient: 1.5,
        modelVersion: CHIP_MODEL_VERSION,
      }).length,
    ).toBeGreaterThan(0);
  });

  it("keeps previous target succeeded when latest target lacks turnover", async () => {
    useTempStore();
    const tradeDates = fullModelTradeDates();
    const generation = createGenerationWithDates(tradeDates);
    writeModelMarketData({
      generationId: generation.id,
      tsCode: "002565.SZ",
      tradeDates,
      skipDailyBasicDates: ["20260629"],
    });
    replaceChipDistribution({
      tsCode: "002565.SZ",
      tradeDate: "20260331",
      levels: [{ price: 15, percent: 100 }],
    });
    replaceChipDistribution({
      tsCode: "002565.SZ",
      tradeDate: "20260401",
      levels: [{ price: 16, percent: 100 }],
    });
    writeScreeningFixture({ generationId: generation.id });

    const run = await runCalculatedChipDistributionIntegrationFromLatestScreening();
    const statuses = readCalculatedChipModelStatusesForRun(run.id);

    expect(statuses.filter((status) => status.targetKind === "previous")).toHaveLength(
      7,
    );
    expect(
      statuses
        .filter((status) => status.targetKind === "previous")
        .every((status) => status.status === "succeeded"),
    ).toBe(true);
    expect(
      statuses
        .filter((status) => status.targetKind === "latest")
        .every(
          (status) =>
            status.status === "blocked" &&
            status.unavailableReason === "missing_turnover_rate",
        ),
    ).toBe(true);
    expect(run).toMatchObject({
      status: "partial",
      successCount: 7,
      blockedCount: 7,
    });
  });
});
