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

function writeScreeningFixture() {
  return writeScreeningRun({
    sourceRefreshJobId: 7,
    totalStocks: 1,
    matchedCount: 1,
    skippedCount: 0,
    now: new Date("2026-06-23T00:00:00.000Z"),
    results: [
      {
        tsCode: "000001.SZ",
        name: "平安银行",
        latestTradeDate: "20260211",
        currentPrice: 8.5,
        intervalHigh: 10,
        intervalHighTradeDate: "20260201",
        intervalHighSource: "swing_high",
        currentHighRatio: 0.85,
        drawdownPct: 0.15,
        ma20: 9,
        ma60: 11,
        ma20Slope: -0.1,
      },
    ],
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

    expect(client.query).toHaveBeenCalledWith(TUSHARE_ENDPOINTS.chipChips, {
      ts_code: "000001.SZ",
      trade_date: "20260211",
    });
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
});
