// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  activateMarketCacheGeneration,
  createMarketCacheGeneration,
  upsertMarketAdjustmentFactors,
  upsertMarketDailyQuotes,
  upsertMarketGenerationDate,
  upsertMarketStocks,
} from "@/lib/refresh/market-data-store";
import {
  completeRefreshJob,
  startRefreshJob,
  writeDailyBars,
  writeStockBasics,
} from "@/lib/refresh/refresh-store";
import { runDowntrendScreeningFromCache } from "@/lib/screening/screening-runner";
import {
  readLatestScreeningResults,
  readLatestScreeningSkips,
} from "@/lib/screening/screening-store";
import type { DailyBarRecord } from "@/lib/refresh/refresh-types";

const tempRoots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function useTempStore() {
  const root = mkdtempSync(path.join(tmpdir(), "gpwy-screening-runner-"));
  tempRoots.push(root);
  vi.stubEnv("REFRESH_DB_PATH", path.join(root, "refresh.sqlite"));
}

function makeBars(tsCode: string, count: number): DailyBarRecord[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 - index;
    const high = index === 50 ? 90 : close + 1;

    return {
      tsCode,
      tradeDate: `2026${String(index + 1).padStart(4, "0")}`,
      open: close + 0.5,
      high,
      low: close - 1,
      close,
      vol: 1000 + index,
    };
  });
}

function createActiveGeneration() {
  const generation = createMarketCacheGeneration({ targetTradeDateCount: 60 });

  for (let index = 1; index <= 60; index += 1) {
    upsertMarketGenerationDate(generation.id, {
      tradeDate: `2026${String(index).padStart(4, "0")}`,
      dailyStatus: "succeeded",
      factorStatus: "succeeded",
    });
  }

  return activateMarketCacheGeneration(generation.id);
}

describe("screening runner", () => {
  it("persists matched stocks from the latest successful refresh cache", () => {
    useTempStore();
    const refreshJob = startRefreshJob(
      new Date("2026-06-23T00:00:00.000Z"),
    ).job;

    writeStockBasics(refreshJob.id, [
      {
        tsCode: "000001.SZ",
        name: "平安银行",
        market: "主板",
        listStatus: "L",
      },
      {
        tsCode: "000002.SZ",
        name: "万科A",
        market: "主板",
        listStatus: "L",
      },
    ]);
    writeDailyBars(refreshJob.id, [
      ...makeBars("000001.SZ", 60),
      ...makeBars("000002.SZ", 59),
    ]);
    completeRefreshJob(refreshJob.id, {
      totalStocks: 2,
      successCount: 2,
      failedCount: 0,
      finishedAt: new Date("2026-06-23T00:02:00.000Z"),
    });

    const run = runDowntrendScreeningFromCache({
      now: new Date("2026-06-23T00:03:00.000Z"),
    });

    expect(run.sourceRefreshJobId).toBe(refreshJob.id);
    expect(run.totalStocks).toBe(2);
    expect(run.matchedCount).toBe(1);
    expect(run.skippedCount).toBe(1);
    expect(readLatestScreeningResults()).toMatchObject([
      {
        screeningRunId: run.id,
        tsCode: "000001.SZ",
        name: "平安银行",
        currentPrice: 41,
        intervalHigh: 90,
        intervalHighSource: "swing_high",
      },
    ]);
  });

  it("fails clearly when no successful refresh cache exists", () => {
    useTempStore();

    expect(() => runDowntrendScreeningFromCache()).toThrow(
      "no_successful_refresh_cache",
    );
  });

  it("uses the active normalized generation and persists structured skips", () => {
    useTempStore();
    const refreshJob = startRefreshJob().job;
    const generation = createActiveGeneration();
    const matchedBars = makeBars("000001.SZ", 60);
    const missingFactorBars = makeBars("000002.SZ", 60);

    upsertMarketStocks([
      {
        tsCode: "000001.SZ",
        name: "平安银行",
        market: "主板",
        listStatus: "L",
      },
      {
        tsCode: "000002.SZ",
        name: "缺复权因子",
        market: "主板",
        listStatus: "L",
      },
    ]);
    upsertMarketDailyQuotes(generation.id, [
      ...matchedBars,
      ...missingFactorBars,
    ]);
    upsertMarketAdjustmentFactors(
      generation.id,
      matchedBars.map((bar) => ({
        tsCode: bar.tsCode,
        tradeDate: bar.tradeDate,
        adjFactor: 1,
      })),
    );

    const run = runDowntrendScreeningFromCache({
      sourceRefreshJobId: refreshJob.id,
      now: new Date("2026-06-26T00:00:00.000Z"),
    });

    expect(run.sourceRefreshJobId).toBe(refreshJob.id);
    expect(run.sourceMarketGenerationId).toBe(generation.id);
    expect(run.totalStocks).toBe(2);
    expect(run.matchedCount).toBe(1);
    expect(run.skippedCount).toBe(1);
    expect(readLatestScreeningSkips()).toEqual([
      {
        screeningRunId: run.id,
        tsCode: "000002.SZ",
        reason: "missing_adjustment_factor",
        availableBars: 60,
      },
    ]);
  });
});
