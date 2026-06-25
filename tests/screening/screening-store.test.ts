// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readLatestScreeningSkips,
  readLatestScreeningResults,
  readLatestScreeningRun,
  readScreeningResultsForRun,
  readScreeningRunById,
  writeScreeningRun,
} from "@/lib/screening/screening-store";
import type { ScreeningResultRecord } from "@/lib/screening/screening-types";

const tempRoots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function useTempStore() {
  const root = mkdtempSync(path.join(tmpdir(), "gpwy-screening-store-"));
  tempRoots.push(root);
  vi.stubEnv("REFRESH_DB_PATH", path.join(root, "refresh.sqlite"));
}

function result(overrides: Partial<ScreeningResultRecord> = {}) {
  return {
    screeningRunId: 0,
    tsCode: "000001.SZ",
    name: "平安银行",
    latestTradeDate: "20260623",
    currentPrice: 41,
    intervalHigh: 90,
    intervalHighTradeDate: "20260614",
    intervalHighSource: "swing_high" as const,
    currentHighRatio: 41 / 90,
    drawdownPct: 1 - 41 / 90,
    ma20: 50.5,
    ma60: 70.5,
    ma20Slope: -1,
    ...overrides,
  };
}

describe("screening store", () => {
  it("writes and reads the latest screening run with results", () => {
    useTempStore();

    const run = writeScreeningRun({
      sourceRefreshJobId: 3,
      sourceMarketGenerationId: 9,
      totalStocks: 2,
      matchedCount: 1,
      skippedCount: 1,
      results: [result()],
      skips: [
        {
          tsCode: "000002.SZ",
          reason: "missing_adjustment_factor",
          availableBars: 60,
        },
      ],
      now: new Date("2026-06-23T00:00:00.000Z"),
    });

    expect(readLatestScreeningRun()).toEqual(run);
    expect(readScreeningRunById(run.id)).toEqual(run);
    expect(run.sourceMarketGenerationId).toBe(9);
    expect(readLatestScreeningResults()).toEqual([
      {
        ...result(),
        screeningRunId: run.id,
      },
    ]);
    expect(readLatestScreeningSkips()).toEqual([
      {
        screeningRunId: run.id,
        tsCode: "000002.SZ",
        reason: "missing_adjustment_factor",
        availableBars: 60,
      },
    ]);
  });

  it("reads results from the requested run instead of the current latest run", () => {
    useTempStore();
    const firstRun = writeScreeningRun({
      sourceRefreshJobId: 3,
      totalStocks: 1,
      matchedCount: 1,
      skippedCount: 0,
      results: [result({ tsCode: "000001.SZ" })],
    });
    writeScreeningRun({
      sourceRefreshJobId: 4,
      totalStocks: 1,
      matchedCount: 1,
      skippedCount: 0,
      results: [result({ tsCode: "000002.SZ" })],
    });

    expect(
      readScreeningResultsForRun(firstRun.id).map((row) => row.tsCode),
    ).toEqual(["000001.SZ"]);
  });
});
