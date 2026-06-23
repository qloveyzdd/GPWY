// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { writeChipPeakRun } from "@/lib/chip/chip-store";
import type { ChipPeakResultRecord } from "@/lib/chip/chip-types";
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

function chipResult(
  overrides: Partial<ChipPeakResultRecord> = {},
): Omit<ChipPeakResultRecord, "chipPeakRunId"> {
  return {
    screeningRunId: 1,
    tsCode: "000001.SZ",
    status: "succeeded",
    tradeDate: "20260623",
    chipPeakPrice: 36.2,
    peakPercent: 6.5,
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
    expect(snapshot.sourceScreeningRunId).toBe(run.id);
    expect(snapshot.rows).toEqual([]);
  });

  it("joins matching chip peak rows and sorts by current/high ratio ascending", () => {
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
    const chipRun = writeChipPeakRun({
      screeningRunId: run.id,
      status: "succeeded",
      totalCandidates: 2,
      successCount: 2,
      blockedCount: 0,
      failedCount: 0,
      results: [
        chipResult({
          screeningRunId: run.id,
          tsCode: "000001.SZ",
          chipPeakPrice: 68.5,
        }),
        chipResult({
          screeningRunId: run.id,
          tsCode: "000002.SZ",
          chipPeakPrice: 38.5,
        }),
      ],
    });

    const snapshot = readLatestResultsSnapshot();

    expect(snapshot.status).toBe("ready");
    expect(snapshot.sourceScreeningRunId).toBe(run.id);
    expect(snapshot.chipPeakRunId).toBe(chipRun.id);
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
    });
  });

  it("keeps rows visible for blocked, failed, and missing chip peak states", () => {
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
    writeChipPeakRun({
      screeningRunId: run.id,
      status: "partial",
      totalCandidates: 3,
      successCount: 0,
      blockedCount: 1,
      failedCount: 1,
      results: [
        chipResult({
          screeningRunId: run.id,
          tsCode: "000001.SZ",
          status: "blocked",
          tradeDate: null,
          chipPeakPrice: null,
          peakPercent: null,
          source: null,
          errorCategory: "permission_denied",
          errorSummary: "筹码接口权限不足。",
        }),
        chipResult({
          screeningRunId: run.id,
          tsCode: "000002.SZ",
          status: "failed",
          tradeDate: null,
          chipPeakPrice: null,
          peakPercent: null,
          source: null,
          errorCategory: "network_or_service",
          errorSummary: "筹码接口暂时不可用。",
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

  it("does not join chip peak rows from a stale screening run", () => {
    useTempStore();
    const staleRun = writeScreeningRun({
      sourceRefreshJobId: 14,
      totalStocks: 1,
      matchedCount: 1,
      skippedCount: 0,
      results: [screeningResult()],
    });
    writeChipPeakRun({
      screeningRunId: staleRun.id,
      status: "succeeded",
      totalCandidates: 1,
      successCount: 1,
      blockedCount: 0,
      failedCount: 0,
      results: [
        chipResult({
          screeningRunId: staleRun.id,
          tsCode: "000001.SZ",
          chipPeakPrice: 39.9,
        }),
      ],
    });
    const latestRun = writeScreeningRun({
      sourceRefreshJobId: 15,
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
    });
  });
});
