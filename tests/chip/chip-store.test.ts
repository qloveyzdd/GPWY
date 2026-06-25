// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readChipPeakResultsForRun,
  readLatestChipPeakResults,
  readLatestChipPeakRun,
  writeChipPeakRun,
} from "@/lib/chip/chip-store";
import type { ChipPeakResultRecord } from "@/lib/chip/chip-types";

const tempRoots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function useTempStore() {
  const root = mkdtempSync(path.join(tmpdir(), "gpwy-chip-store-"));
  tempRoots.push(root);
  vi.stubEnv("REFRESH_DB_PATH", path.join(root, "refresh.sqlite"));
}

function result(
  overrides: Partial<ChipPeakResultRecord> = {},
): Omit<ChipPeakResultRecord, "chipPeakRunId"> {
  return {
    screeningRunId: 5,
    tsCode: "000001.SZ",
    status: "succeeded",
    tradeDate: "20260211",
    chipPeakPrice: 10.2,
    peakPercent: 6,
    source: "cyq_chips_highest_percent",
    peaks: [
      { rank: 1, tradeDate: "20260211", price: 10.2, percent: 6 },
      { rank: 2, tradeDate: "20260211", price: 9.8, percent: 4 },
      { rank: 3, tradeDate: "20260211", price: 10.6, percent: 2 },
    ],
    errorCategory: null,
    errorSummary: null,
    ...overrides,
  };
}

describe("chip store", () => {
  it("writes and reads latest chip peak run and results", () => {
    useTempStore();

    const run = writeChipPeakRun({
      screeningRunId: 5,
      status: "partial",
      totalCandidates: 2,
      successCount: 1,
      blockedCount: 1,
      failedCount: 0,
      results: [
        result(),
        result({
          tsCode: "000002.SZ",
          status: "blocked",
          tradeDate: null,
          chipPeakPrice: null,
          peakPercent: null,
          source: null,
          peaks: [],
          errorCategory: "permission_denied",
          errorSummary: "Tushare 接口权限不足。请检查账户权限或积分是否满足当前接口。",
        }),
      ],
      now: new Date("2026-06-23T00:00:00.000Z"),
    });

    expect(readLatestChipPeakRun()).toEqual(run);
    expect(readLatestChipPeakResults()).toEqual([
      {
        ...result(),
        chipPeakRunId: run.id,
      },
      {
        ...result({
          tsCode: "000002.SZ",
          status: "blocked",
          tradeDate: null,
          chipPeakPrice: null,
          peakPercent: null,
          source: null,
          peaks: [],
          errorCategory: "permission_denied",
          errorSummary: "Tushare 接口权限不足。请检查账户权限或积分是否满足当前接口。",
        }),
        chipPeakRunId: run.id,
      },
    ]);
  });

  it("reads chip results from the requested run instead of the current latest run", () => {
    useTempStore();
    const firstRun = writeChipPeakRun({
      screeningRunId: 5,
      status: "succeeded",
      totalCandidates: 1,
      successCount: 1,
      blockedCount: 0,
      failedCount: 0,
      results: [result({ tsCode: "000001.SZ" })],
    });
    writeChipPeakRun({
      screeningRunId: 6,
      status: "succeeded",
      totalCandidates: 1,
      successCount: 1,
      blockedCount: 0,
      failedCount: 0,
      results: [
        result({
          screeningRunId: 6,
          tsCode: "000002.SZ",
        }),
      ],
    });

    expect(
      readChipPeakResultsForRun(firstRun.id).map((row) => row.tsCode),
    ).toEqual(["000001.SZ"]);
  });
});
