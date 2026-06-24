// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { writeChipPeakRun } from "@/lib/chip/chip-store";
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

  it("returns persisted row values, matching job bars, moving averages, and overlays", () => {
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
    writeChipPeakRun({
      screeningRunId: screeningRun.id,
      status: "succeeded",
      totalCandidates: 1,
      successCount: 1,
      blockedCount: 0,
      failedCount: 0,
      results: [
        {
          screeningRunId: screeningRun.id,
          tsCode: "000001.SZ",
          status: "succeeded",
          tradeDate: "20260623",
          chipPeakPrice: 36.2,
          peakPercent: 6.5,
          source: "cyq_chips_highest_percent",
          peaks: [
            { rank: 1, tradeDate: "20260623", price: 36.2, percent: 6.5 },
            { rank: 2, tradeDate: "20260623", price: 35.8, percent: 4.2 },
            { rank: 3, tradeDate: "20260623", price: 37.1, percent: 3.1 },
          ],
          errorCategory: null,
          errorSummary: null,
        },
      ],
    });

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
      chipPeaks: [
        { rank: 1, tradeDate: "20260623", price: 36.2, percent: 6.5 },
        { rank: 2, tradeDate: "20260623", price: 35.8, percent: 4.2 },
        { rank: 3, tradeDate: "20260623", price: 37.1, percent: 3.1 },
      ],
      chipPeakState: "available",
    });
    expect(staleRefreshJob.id).not.toBe(sourceRefreshJob.id);
  });

  it("does not draw a fake chip peak overlay when chip peak is unavailable", () => {
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
    expect(snapshot.overlays.chipPeakState).toBe("missing");
    expect(snapshot.overlays.chipPeaks).toEqual([]);
  });
});
