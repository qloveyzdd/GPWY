// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  replaceChipDistribution,
  writeChipDistributionRun,
} from "@/lib/chip/chip-store";
import {
  activateMarketCacheGeneration,
  createMarketCacheGeneration,
  upsertMarketAdjustmentFactors,
  upsertMarketDailyQuotes,
  upsertMarketGenerationDate,
} from "@/lib/refresh/market-data-store";
import {
  completeRefreshJob,
  startRefreshJob,
  writeDailyBars,
} from "@/lib/refresh/refresh-store";
import type { DailyBarRecord } from "@/lib/refresh/refresh-types";
import { readLatestChartSnapshot } from "@/lib/results/chart-data";
import { writeScreeningRun } from "@/lib/screening/screening-store";

const tempRoots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function useTempStore() {
  const root = mkdtempSync(path.join(tmpdir(), "gpwy-chart-data-"));
  tempRoots.push(root);
  vi.stubEnv("REFRESH_DB_PATH", path.join(root, "refresh.sqlite"));
}

function makeBars(tsCode: string, count: number, offset = 0): DailyBarRecord[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + offset - index;

    return {
      tsCode,
      tradeDate: `2026${String(index + 1).padStart(4, "0")}`,
      open: close + 0.5,
      high: close + 1,
      low: close - 1,
      close,
      vol: 1000 + index,
    };
  });
}

function writeRefreshWithBars(tsCode: string, bars: DailyBarRecord[]) {
  const refreshJob = startRefreshJob(
    new Date("2026-06-23T00:00:00.000Z"),
  ).job;

  writeDailyBars(refreshJob.id, bars);
  completeRefreshJob(refreshJob.id, {
    totalStocks: 1,
    successCount: 1,
    failedCount: 0,
  });

  return refreshJob;
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

function writeDualChipDistribution(screeningRunId: number) {
  replaceChipDistribution({
    tsCode: "000001.SZ",
    tradeDate: "20260623",
    levels: [
      { price: 36.2, percent: 6.5 },
      { price: 35.8, percent: 4.2 },
      { price: 37.1, percent: 3.1 },
    ],
  });
  replaceChipDistribution({
    tsCode: "000001.SZ",
    tradeDate: "20260622",
    levels: [
      { price: 35.9, percent: 5.5 },
      { price: 36.4, percent: 4.4 },
    ],
  });
  writeChipDistributionRun({
    screeningRunId,
    status: "succeeded",
    totalTargets: 2,
    successCount: 2,
    blockedCount: 0,
    failedCount: 0,
    missingCount: 0,
    statuses: [
      {
        screeningRunId,
        tsCode: "000001.SZ",
        targetKind: "latest",
        tradeDate: "20260623",
        status: "succeeded",
        source: "cyq_chips_highest_percent",
        errorCategory: null,
        errorSummary: null,
      },
      {
        screeningRunId,
        tsCode: "000001.SZ",
        targetKind: "previous",
        tradeDate: "20260622",
        status: "succeeded",
        source: "cyq_chips_highest_percent",
        errorCategory: null,
        errorSummary: null,
      },
    ],
  });
}

function writeBlockedLatestAndSuccessfulPrevious(screeningRunId: number) {
  replaceChipDistribution({
    tsCode: "000001.SZ",
    tradeDate: "20260622",
    levels: [
      { price: 35.9, percent: 5.5 },
      { price: 36.4, percent: 4.4 },
    ],
  });
  writeChipDistributionRun({
    screeningRunId,
    status: "partial",
    totalTargets: 2,
    successCount: 1,
    blockedCount: 1,
    failedCount: 0,
    missingCount: 0,
    statuses: [
      {
        screeningRunId,
        tsCode: "000001.SZ",
        targetKind: "latest",
        tradeDate: "20260623",
        status: "blocked",
        source: null,
        errorCategory: "permission_denied",
        errorSummary:
          "Authorization: Bearer secret TUSHARE_TOKEN=secret C:\\Users\\secret\\token.txt",
      },
      {
        screeningRunId,
        tsCode: "000001.SZ",
        targetKind: "previous",
        tradeDate: "20260622",
        status: "succeeded",
        source: "cyq_chips_highest_percent",
        errorCategory: null,
        errorSummary: null,
      },
    ],
  });
}

describe("chart data snapshot", () => {
  it("returns unavailable when no screening run exists", () => {
    useTempStore();

    const snapshot = readLatestChartSnapshot("000001.SZ");

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.unavailableReason).toBe("no_screening_run");
  });

  it("returns not_found when selected stock is not in latest results", () => {
    useTempStore();
    writeScreeningRun({
      sourceRefreshJobId: 7,
      totalStocks: 1,
      matchedCount: 0,
      skippedCount: 0,
      results: [],
    });

    const snapshot = readLatestChartSnapshot("000001.SZ");

    expect(snapshot.status).toBe("not_found");
    expect(snapshot.unavailableReason).toBe("stock_not_in_latest_results");
  });

  it("returns persisted row values, matching job bars, moving averages, overlays, and dual distributions", () => {
    useTempStore();
    const staleRefreshJob = writeRefreshWithBars(
      "000001.SZ",
      makeBars("000001.SZ", 60, 1000),
    );
    const sourceRefreshJob = writeRefreshWithBars(
      "000001.SZ",
      makeBars("000001.SZ", 65),
    );
    const screeningRun = writeScreeningRun({
      sourceRefreshJobId: sourceRefreshJob.id,
      totalStocks: 1,
      matchedCount: 1,
      skippedCount: 0,
      results: [
        {
          tsCode: "000001.SZ",
          name: "平安银行",
          latestTradeDate: "20260623",
          currentPrice: 41,
          intervalHigh: 90,
          intervalHighTradeDate: "20260214",
          intervalHighSource: "swing_high",
          currentHighRatio: 41 / 90,
          drawdownPct: 1 - 41 / 90,
          ma20: 50.5,
          ma60: 70.5,
          ma20Slope: -1,
        },
      ],
    });
    writeDualChipDistribution(screeningRun.id);

    const snapshot = readLatestChartSnapshot("000001.sz");

    expect(snapshot.status).toBe("ready");
    if (snapshot.status !== "ready") {
      throw new Error("expected ready chart snapshot");
    }
    expect(snapshot.row.tsCode).toBe("000001.SZ");
    expect(snapshot.bars).toHaveLength(60);
    expect(snapshot.bars[0].close).not.toBe(1100);
    expect(snapshot.bars[0].tradeDate).toBe("20260006");
    expect(snapshot.ma20Series).toHaveLength(41);
    expect(snapshot.ma60Series).toHaveLength(1);
    expect(snapshot.overlays).toEqual({
      intervalHighPrice: 90,
      intervalHighTradeDate: "20260214",
      threshold85Price: 76.5,
    });
    expect(snapshot.chipDistributions.latest).toMatchObject({
      targetKind: "latest",
      label: "最新有效交易日",
      tradeDate: "20260623",
      status: "succeeded",
      levels: [
        { price: 35.8, percent: 4.2 },
        { price: 36.2, percent: 6.5 },
        { price: 37.1, percent: 3.1 },
      ],
      maxLevel: { price: 36.2, percent: 6.5 },
      errorCategory: null,
      errorSummary: null,
    });
    expect(snapshot.chipDistributions.previous).toMatchObject({
      targetKind: "previous",
      label: "前一有效交易日",
      tradeDate: "20260622",
      status: "succeeded",
      levels: [
        { price: 35.9, percent: 5.5 },
        { price: 36.4, percent: 4.4 },
      ],
      maxLevel: { price: 35.9, percent: 5.5 },
      errorCategory: null,
      errorSummary: null,
    });
    expect(snapshot.chipDistributions.scale).toEqual({
      priceLevels: [35.8, 35.9, 36.2, 36.4, 37.1],
      maxPercent: 6.5,
    });
    expect(staleRefreshJob.id).not.toBe(sourceRefreshJob.id);
  });

  it("returns ready chart data with missing distribution panels when chip distribution is unavailable", () => {
    useTempStore();
    const sourceRefreshJob = writeRefreshWithBars(
      "000001.SZ",
      makeBars("000001.SZ", 60),
    );
    writeScreeningRun({
      sourceRefreshJobId: sourceRefreshJob.id,
      totalStocks: 1,
      matchedCount: 1,
      skippedCount: 0,
      results: [
        {
          tsCode: "000001.SZ",
          name: "平安银行",
          latestTradeDate: "20260623",
          currentPrice: 41,
          intervalHigh: 90,
          intervalHighTradeDate: "20260214",
          intervalHighSource: "swing_high",
          currentHighRatio: 41 / 90,
          drawdownPct: 1 - 41 / 90,
          ma20: 50.5,
          ma60: 70.5,
          ma20Slope: -1,
        },
      ],
    });

    const snapshot = readLatestChartSnapshot("000001.SZ");

    expect(snapshot.status).toBe("ready");
    if (snapshot.status !== "ready") {
      throw new Error("expected ready chart snapshot");
    }
    expect(snapshot.overlays).toEqual({
      intervalHighPrice: 90,
      intervalHighTradeDate: "20260214",
      threshold85Price: 76.5,
    });
    expect(snapshot.chipDistributions.latest).toMatchObject({
      targetKind: "latest",
      tradeDate: "20260623",
      status: "missing",
      levels: [],
      maxLevel: null,
    });
    expect(snapshot.chipDistributions.previous).toMatchObject({
      targetKind: "previous",
      tradeDate: null,
      status: "missing",
      levels: [],
      maxLevel: null,
      errorSummary: "previous_trade_date_missing",
    });
    expect(snapshot.chipDistributions.scale).toEqual({
      priceLevels: [],
      maxPercent: 0,
    });
  });

  it("keeps previous distribution available when latest distribution is blocked and sanitizes errors", () => {
    useTempStore();
    const sourceRefreshJob = writeRefreshWithBars(
      "000001.SZ",
      makeBars("000001.SZ", 60),
    );
    const screeningRun = writeScreeningRun({
      sourceRefreshJobId: sourceRefreshJob.id,
      totalStocks: 1,
      matchedCount: 1,
      skippedCount: 0,
      results: [
        {
          tsCode: "000001.SZ",
          name: "平安银行",
          latestTradeDate: "20260623",
          currentPrice: 41,
          intervalHigh: 90,
          intervalHighTradeDate: "20260214",
          intervalHighSource: "swing_high",
          currentHighRatio: 41 / 90,
          drawdownPct: 1 - 41 / 90,
          ma20: 50.5,
          ma60: 70.5,
          ma20Slope: -1,
        },
      ],
    });
    writeBlockedLatestAndSuccessfulPrevious(screeningRun.id);

    const snapshot = readLatestChartSnapshot("000001.SZ");

    expect(snapshot.status).toBe("ready");
    if (snapshot.status !== "ready") {
      throw new Error("expected ready chart snapshot");
    }
    expect(snapshot.chipDistributions.latest).toMatchObject({
      targetKind: "latest",
      tradeDate: "20260623",
      status: "blocked",
      levels: [],
      maxLevel: null,
      errorCategory: "permission_denied",
    });
    expect(snapshot.chipDistributions.latest.errorSummary).not.toContain(
      "TUSHARE_TOKEN=secret",
    );
    expect(snapshot.chipDistributions.latest.errorSummary).not.toContain(
      "Authorization",
    );
    expect(snapshot.chipDistributions.latest.errorSummary).not.toContain(
      "C:\\Users",
    );
    expect(snapshot.chipDistributions.previous).toMatchObject({
      targetKind: "previous",
      tradeDate: "20260622",
      status: "succeeded",
      levels: [
        { price: 35.9, percent: 5.5 },
        { price: 36.4, percent: 4.4 },
      ],
      maxLevel: { price: 35.9, percent: 5.5 },
    });
    expect(snapshot.chipDistributions.scale).toEqual({
      priceLevels: [35.9, 36.4],
      maxPercent: 5.5,
    });
  });

  it("reads chart bars from the screening generation instead of legacy bars", () => {
    useTempStore();
    const legacy = writeRefreshWithBars(
      "000001.SZ",
      makeBars("000001.SZ", 60, 1000),
    );
    const generation = createActiveGeneration();
    const normalizedBars = makeBars("000001.SZ", 65);

    upsertMarketDailyQuotes(generation.id, normalizedBars);
    upsertMarketAdjustmentFactors(
      generation.id,
      normalizedBars.map((bar) => ({
        tsCode: bar.tsCode,
        tradeDate: bar.tradeDate,
        adjFactor: 1,
      })),
    );
    writeScreeningRun({
      sourceRefreshJobId: legacy.id,
      sourceMarketGenerationId: generation.id,
      totalStocks: 1,
      matchedCount: 1,
      skippedCount: 0,
      results: [
        {
          tsCode: "000001.SZ",
          name: "平安银行",
          latestTradeDate: "20260065",
          currentPrice: 36,
          intervalHigh: 80,
          intervalHighTradeDate: "20260055",
          intervalHighSource: "swing_high",
          currentHighRatio: 0.45,
          drawdownPct: 0.55,
          ma20: 45,
          ma60: 65,
          ma20Slope: -1,
        },
      ],
    });

    const snapshot = readLatestChartSnapshot("000001.SZ");

    expect(snapshot.status).toBe("ready");
    if (snapshot.status !== "ready") {
      throw new Error("expected ready chart snapshot");
    }
    expect(snapshot.bars[0]?.tradeDate).toBe("20260006");
    expect(snapshot.bars[0]?.close).toBe(95);
  });

  it("does not fall back to legacy bars when normalized factors are missing", () => {
    useTempStore();
    const legacy = writeRefreshWithBars(
      "000001.SZ",
      makeBars("000001.SZ", 60, 1000),
    );
    const generation = createActiveGeneration();
    const normalizedBars = makeBars("000001.SZ", 60);

    upsertMarketDailyQuotes(generation.id, normalizedBars);
    writeScreeningRun({
      sourceRefreshJobId: legacy.id,
      sourceMarketGenerationId: generation.id,
      totalStocks: 1,
      matchedCount: 1,
      skippedCount: 0,
      results: [
        {
          tsCode: "000001.SZ",
          name: "平安银行",
          latestTradeDate: "20260060",
          currentPrice: 41,
          intervalHigh: 90,
          intervalHighTradeDate: "20260051",
          intervalHighSource: "swing_high",
          currentHighRatio: 41 / 90,
          drawdownPct: 1 - 41 / 90,
          ma20: 50.5,
          ma60: 70.5,
          ma20Slope: -1,
        },
      ],
    });

    expect(() => readLatestChartSnapshot("000001.SZ")).toThrow(
      "missing_adjustment_factor",
    );
  });
});
