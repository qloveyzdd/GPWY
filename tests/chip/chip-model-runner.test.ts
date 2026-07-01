// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readChipModelSeedSnapshot,
} from "@/lib/chip/chip-model-store";
import {
  resolveChipModelSeedForTarget,
} from "@/lib/chip/chip-model-runner";
import {
  CHIP_MODEL_VERSION,
  DEFAULT_CHIP_DECAY_COEFFICIENT,
} from "@/lib/chip/chip-model";
import { replaceChipDistribution } from "@/lib/chip/chip-store";
import {
  createMarketCacheGeneration,
  upsertMarketAdjustmentFactors,
  upsertMarketGenerationDate,
} from "@/lib/refresh/market-data-store";
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
    ...Array.from({ length: 59 }, (_, index) => `202605${String(index + 1).padStart(2, "0")}`),
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
