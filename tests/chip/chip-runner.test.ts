// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runChipPeakIntegrationFromLatestScreening } from "@/lib/chip/chip-runner";
import { readLatestChipPeakResults } from "@/lib/chip/chip-store";
import {
  writeScreeningRun,
} from "@/lib/screening/screening-store";
import { TushareApiError } from "@/lib/tushare/client";
import { TUSHARE_ENDPOINTS } from "@/lib/tushare/endpoints";
import { ProviderRequestScheduler } from "@/lib/tushare/request-scheduler";
import { ScheduledTushareClient } from "@/lib/tushare/scheduled-client";
import type {
  TushareClientLike,
  TushareDataTable,
  TushareEndpoint,
} from "@/lib/tushare/types";

const tempRoots: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function useTempStore() {
  const root = mkdtempSync(path.join(tmpdir(), "gpwy-chip-runner-"));
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

function writeScreeningFixture(tsCodes = ["000001.SZ"]) {
  return writeScreeningRun({
    sourceRefreshJobId: 7,
    totalStocks: tsCodes.length,
    matchedCount: tsCodes.length,
    skippedCount: 0,
    now: new Date("2026-06-23T00:00:00.000Z"),
    results: tsCodes.map((tsCode, index) => ({
        tsCode,
        name: `股票${index + 1}`,
        latestTradeDate: "20260211",
        currentPrice: 8.5,
        intervalHigh: 10,
        intervalHighTradeDate: "20260201",
        intervalHighSource: "swing_high",
        currentHighRatio: 0.8 + index / 100,
        drawdownPct: 0.15,
        ma20: 9,
        ma60: 11,
        ma20Slope: -0.1,
      })),
  });
}

describe("chip runner", () => {
  it("queries cyq_chips by screening trade date and persists chip peak", async () => {
    useTempStore();
    const screeningRun = writeScreeningFixture();
    const client = createMockClient(async () =>
      table([
        ["000001.SZ", "20260211", 9.8, 2],
        ["000001.SZ", "20260211", 10.2, 6],
      ]),
    );

    const run = await runChipPeakIntegrationFromLatestScreening({
      client,
      now: new Date("2026-06-23T00:01:00.000Z"),
    });

    expect(client.query).toHaveBeenCalledWith(
      TUSHARE_ENDPOINTS.chipChips,
      {
        ts_code: "000001.SZ",
        trade_date: "20260211",
      },
      { priority: "chip" },
    );
    expect(run.screeningRunId).toBe(screeningRun.id);
    expect(run.status).toBe("succeeded");
    expect(readLatestChipPeakResults()).toMatchObject([
      {
        tsCode: "000001.SZ",
        status: "succeeded",
        tradeDate: "20260211",
        chipPeakPrice: 10.2,
        peakPercent: 6,
        source: "cyq_chips_highest_percent",
        peaks: [
          { rank: 1, tradeDate: "20260211", price: 10.2, percent: 6 },
          { rank: 2, tradeDate: "20260211", price: 9.8, percent: 2 },
        ],
      },
    ]);
  });

  it("persists permission failures as blocked without estimating", async () => {
    useTempStore();
    writeScreeningFixture();
    const client = createMockClient(async () => {
      throw new TushareApiError("cyq_chips", -2002, "没有访问该接口的权限");
    });

    const run = await runChipPeakIntegrationFromLatestScreening({ client });

    expect(run.status).toBe("blocked");
    expect(run.blockedCount).toBe(1);
    expect(readLatestChipPeakResults()).toMatchObject([
      {
        tsCode: "000001.SZ",
        status: "blocked",
        chipPeakPrice: null,
        source: null,
        peaks: [],
        errorCategory: "permission_denied",
      },
    ]);
  });

  it("reports chip progress without letting progress callback failures change results", async () => {
    useTempStore();
    writeScreeningFixture(["000001.SZ", "000002.SZ"]);
    const client = createMockClient(async (_endpoint, params) =>
      table([[params.ts_code, "20260211", 10.2, 6]]),
    );
    const progressEvents: Array<{
      total: number;
      completed: number;
      succeeded: number;
      blocked: number;
      failed: number;
    }> = [];

    const run = await runChipPeakIntegrationFromLatestScreening({
      client,
      onProgress: (progress) => {
        progressEvents.push(progress);

        if (progress.completed === 1) {
          throw new Error("progress sink unavailable");
        }
      },
    });

    expect(run.status).toBe("succeeded");
    expect(progressEvents[0]).toEqual({
      total: 2,
      completed: 0,
      succeeded: 0,
      blocked: 0,
      failed: 0,
    });
    expect(progressEvents.at(-1)).toEqual({
      total: 2,
      completed: 2,
      succeeded: 2,
      blocked: 0,
      failed: 0,
    });
  });

  it("runs candidates concurrently with bounded retries and isolated row failures", async () => {
    vi.useFakeTimers();
    useTempStore();
    const codes = [
      "000001.SZ",
      "000002.SZ",
      "000003.SZ",
      "000004.SZ",
      "000005.SZ",
      "000006.SZ",
    ];
    writeScreeningFixture(codes);
    const attempts = new Map<string, number>();
    let active = 0;
    let peak = 0;
    const rawClient = createMockClient(async (_endpoint, params) => {
      const tsCode = String(params.ts_code);
      attempts.set(tsCode, (attempts.get(tsCode) ?? 0) + 1);

      if (tsCode === "000005.SZ") {
        throw new TushareApiError(
          "cyq_chips",
          -2002,
          "没有访问该接口的权限",
        );
      }
      if (tsCode === "000006.SZ") {
        throw new TypeError("fetch failed");
      }

      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 50));
      active -= 1;
      return table([[tsCode, "20260211", 10.2, 6]]);
    });
    const scheduler = new ProviderRequestScheduler({
      maxConcurrency: 2,
      requestTimeoutMs: 60_000,
      random: () => 0.5,
    });
    const client = new ScheduledTushareClient(rawClient, scheduler);

    const runPromise = runChipPeakIntegrationFromLatestScreening({ client });
    await vi.runAllTimersAsync();
    const run = await runPromise;
    const results = readLatestChipPeakResults();

    expect(peak).toBe(2);
    expect(attempts.get("000005.SZ")).toBe(1);
    expect(attempts.get("000006.SZ")).toBe(3);
    expect(run.status).toBe("partial");
    expect(run.successCount).toBe(4);
    expect(run.blockedCount).toBe(1);
    expect(run.failedCount).toBe(1);
    expect(results.map((result) => result.tsCode)).toEqual(codes);
    expect(results.find((result) => result.tsCode === "000005.SZ")).toMatchObject({
      status: "blocked",
      errorCategory: "permission_denied",
    });
    expect(results.find((result) => result.tsCode === "000006.SZ")).toMatchObject({
      status: "failed",
      errorCategory: "network_or_service",
    });
  });
});
