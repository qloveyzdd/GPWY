// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  replaceChipDistribution,
  writeChipDistributionRun,
  writeChipPeakRun,
} from "@/lib/chip/chip-store";
import type { ChipDistributionStatusRecord } from "@/lib/chip/chip-types";
import { readLatestResultsSnapshot } from "@/lib/results/results-snapshot";
import { writeScreeningRun } from "@/lib/screening/screening-store";
import type { ScreeningResultRecord } from "@/lib/screening/screening-types";

const tempRoots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function useTempStore() {
  const root = mkdtempSync(path.join(tmpdir(), "gpwy-results-snapshot-"));
  tempRoots.push(root);
  vi.stubEnv("REFRESH_DB_PATH", path.join(root, "refresh.sqlite"));
}

function screeningResult(
  overrides: Partial<ScreeningResultRecord> = {},
): Omit<ScreeningResultRecord, "screeningRunId"> {
  return {
    tsCode: "000001.SZ",
    name: "平安银行",
    latestTradeDate: "20260623",
    currentPrice: 41,
    intervalHigh: 90,
    intervalHighTradeDate: "20260614",
    intervalHighSource: "swing_high",
    currentHighRatio: 41 / 90,
    drawdownPct: 1 - 41 / 90,
    ma20: 50.5,
    ma60: 70.5,
    ma20Slope: -1,
    ...overrides,
  };
}

function distributionStatus(
  screeningRunId: number,
  overrides: Partial<
    Omit<ChipDistributionStatusRecord, "chipDistributionRunId" | "updatedAt">
  > = {},
): Omit<ChipDistributionStatusRecord, "chipDistributionRunId" | "updatedAt"> {
  return {
    screeningRunId,
    tsCode: "000001.SZ",
    targetKind: "latest",
    tradeDate: "20260623",
    status: "succeeded",
    source: "cyq_chips_highest_percent",
    errorCategory: null,
    errorSummary: null,
    ...overrides,
  };
}

describe("results snapshot", () => {
  it("returns unavailable when no screening run exists", () => {
    useTempStore();

    const snapshot = readLatestResultsSnapshot();

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.cacheSource).toBeNull();
    expect(snapshot.unavailableReason).toBe("no_screening_run");
    expect(snapshot.rows).toEqual([]);
  });

  it("returns empty when latest screening run has no matched rows", () => {
    useTempStore();
    const run = writeScreeningRun({
      sourceRefreshJobId: 11,
      totalStocks: 2,
      matchedCount: 0,
      skippedCount: 0,
      results: [],
      now: new Date("2026-06-23T00:00:00.000Z"),
    });

    const snapshot = readLatestResultsSnapshot();

    expect(snapshot.status).toBe("empty");
    expect(snapshot.cacheSource).toBeNull();
    expect(snapshot.sourceScreeningRunId).toBe(run.id);
    expect(snapshot.rows).toEqual([]);
  });

  it("derives legacy chip peak fields from latest full distributions and sorts rows", () => {
    useTempStore();
    const run = writeScreeningRun({
      sourceRefreshJobId: 12,
      totalStocks: 2,
      matchedCount: 2,
      skippedCount: 0,
      results: [
        screeningResult({
          tsCode: "000001.SZ",
          name: "平安银行",
          currentPrice: 72,
          intervalHigh: 90,
          currentHighRatio: 0.8,
          drawdownPct: 0.2,
        }),
        screeningResult({
          tsCode: "000002.SZ",
          name: "万科A",
          currentPrice: 40,
          intervalHigh: 100,
          currentHighRatio: 0.4,
          drawdownPct: 0.6,
        }),
      ],
    });
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
      tsCode: "000002.SZ",
      tradeDate: "20260623",
      levels: [
        { price: 38.5, percent: 7 },
        { price: 39.2, percent: 3 },
      ],
    });
    const distributionRun = writeChipDistributionRun({
      screeningRunId: run.id,
      status: "succeeded",
      totalTargets: 2,
      successCount: 2,
      blockedCount: 0,
      failedCount: 0,
      missingCount: 0,
      statuses: [
        distributionStatus(run.id, { tsCode: "000001.SZ" }),
        distributionStatus(run.id, { tsCode: "000002.SZ" }),
      ],
    });

    const snapshot = readLatestResultsSnapshot();

    expect(snapshot.status).toBe("ready");
    expect(snapshot.cacheSource).toBe("legacy");
    expect(snapshot.sourceScreeningRunId).toBe(run.id);
    expect(snapshot.chipPeakRunId).toBe(distributionRun.id);
    expect(snapshot.rows.map((row) => row.tsCode)).toEqual([
      "000002.SZ",
      "000001.SZ",
    ]);
    expect(snapshot.rows[0]).toMatchObject({
      tsCode: "000002.SZ",
      name: "万科A",
      currentPrice: 40,
      intervalHigh: 100,
      currentHighRatio: 0.4,
      drawdownPct: 0.6,
      chipPeakState: "available",
      chipPeakPrice: 38.5,
      chipPeaks: [
        { rank: 1, tradeDate: "20260623", price: 38.5, percent: 7 },
        { rank: 2, tradeDate: "20260623", price: 39.2, percent: 3 },
      ],
    });
  });

  it("keeps rows visible for blocked, failed, and missing latest distribution states", () => {
    useTempStore();
    const run = writeScreeningRun({
      sourceRefreshJobId: 13,
      totalStocks: 3,
      matchedCount: 3,
      skippedCount: 0,
      results: [
        screeningResult({ tsCode: "000001.SZ", name: "平安银行" }),
        screeningResult({ tsCode: "000002.SZ", name: "万科A" }),
        screeningResult({ tsCode: "000003.SZ", name: "国农科技" }),
      ],
    });
    writeChipDistributionRun({
      screeningRunId: run.id,
      status: "blocked",
      totalTargets: 3,
      successCount: 0,
      blockedCount: 1,
      failedCount: 1,
      missingCount: 1,
      statuses: [
        distributionStatus(run.id, {
          tsCode: "000001.SZ",
          status: "blocked",
          source: null,
          errorCategory: "permission_denied",
          errorSummary: "筹码接口权限不足。",
        }),
        distributionStatus(run.id, {
          tsCode: "000002.SZ",
          status: "failed",
          source: null,
          errorCategory: "network_or_service",
          errorSummary: "筹码接口暂时不可用。",
        }),
        distributionStatus(run.id, {
          tsCode: "000003.SZ",
          status: "missing",
          tradeDate: null,
          source: null,
          errorCategory: null,
          errorSummary: "previous_trade_date_missing",
        }),
      ],
    });

    const snapshot = readLatestResultsSnapshot();

    expect(snapshot.status).toBe("ready");
    expect(snapshot.rows).toHaveLength(3);
    expect(snapshot.rows.map((row) => [row.tsCode, row.chipPeakState])).toEqual(
      [
        ["000001.SZ", "blocked"],
        ["000002.SZ", "failed"],
        ["000003.SZ", "missing"],
      ],
    );
  });

  it("does not use previous distribution success as latest chip peak", () => {
    useTempStore();
    const run = writeScreeningRun({
      sourceRefreshJobId: 14,
      totalStocks: 1,
      matchedCount: 1,
      skippedCount: 0,
      results: [screeningResult()],
    });
    replaceChipDistribution({
      tsCode: "000001.SZ",
      tradeDate: "20260622",
      levels: [{ price: 35.8, percent: 8 }],
    });
    writeChipDistributionRun({
      screeningRunId: run.id,
      status: "partial",
      totalTargets: 2,
      successCount: 1,
      blockedCount: 0,
      failedCount: 1,
      missingCount: 0,
      statuses: [
        distributionStatus(run.id, {
          targetKind: "latest",
          tradeDate: "20260623",
          status: "failed",
          source: null,
          errorCategory: "network_or_service",
          errorSummary: "latest target failed",
        }),
        distributionStatus(run.id, {
          targetKind: "previous",
          tradeDate: "20260622",
          status: "succeeded",
        }),
      ],
    });

    const snapshot = readLatestResultsSnapshot();

    expect(snapshot.rows[0]).toMatchObject({
      tsCode: "000001.SZ",
      chipPeakState: "failed",
      chipPeakPrice: null,
      chipPeaks: [],
      chipPeakErrorCategory: "network_or_service",
    });
  });

  it("marks ready results normalized only when screening persisted a generation", () => {
    useTempStore();
    writeScreeningRun({
      sourceRefreshJobId: 16,
      sourceMarketGenerationId: 8,
      totalStocks: 1,
      matchedCount: 1,
      skippedCount: 0,
      results: [screeningResult()],
    });

    const snapshot = readLatestResultsSnapshot();
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.status).toBe("ready");
    expect(snapshot.cacheSource).toBe("normalized");
    expect(serialized).not.toContain("sourceMarketGenerationId");
    expect(serialized).not.toContain("chipDistributionRunId");
    expect(serialized).not.toContain("refresh.sqlite");
    expect(serialized).not.toContain("TUSHARE_TOKEN");
  });

  it("does not join stale distribution runs or legacy chip peak rows", () => {
    useTempStore();
    const staleRun = writeScreeningRun({
      sourceRefreshJobId: 17,
      totalStocks: 1,
      matchedCount: 1,
      skippedCount: 0,
      results: [screeningResult()],
    });
    replaceChipDistribution({
      tsCode: "000001.SZ",
      tradeDate: "20260623",
      levels: [{ price: 39.9, percent: 9 }],
    });
    writeChipDistributionRun({
      screeningRunId: staleRun.id,
      status: "succeeded",
      totalTargets: 1,
      successCount: 1,
      blockedCount: 0,
      failedCount: 0,
      missingCount: 0,
      statuses: [distributionStatus(staleRun.id)],
    });
    writeChipPeakRun({
      screeningRunId: staleRun.id,
      status: "succeeded",
      totalCandidates: 1,
      successCount: 1,
      blockedCount: 0,
      failedCount: 0,
      results: [
        {
          screeningRunId: staleRun.id,
          tsCode: "000001.SZ",
          status: "succeeded",
          tradeDate: "20260623",
          chipPeakPrice: 39.9,
          peakPercent: 9,
          source: "cyq_chips_highest_percent",
          peaks: [{ rank: 1, tradeDate: "20260623", price: 39.9, percent: 9 }],
          errorCategory: null,
          errorSummary: null,
        },
      ],
    });
    const latestRun = writeScreeningRun({
      sourceRefreshJobId: 18,
      totalStocks: 1,
      matchedCount: 1,
      skippedCount: 0,
      results: [screeningResult()],
    });

    const snapshot = readLatestResultsSnapshot();

    expect(snapshot.status).toBe("ready");
    expect(snapshot.sourceScreeningRunId).toBe(latestRun.id);
    expect(snapshot.chipPeakRunId).toBeNull();
    expect(snapshot.rows[0]).toMatchObject({
      tsCode: "000001.SZ",
      chipPeakState: "missing",
      chipPeakPrice: null,
      chipPeaks: [],
    });
  });
});
