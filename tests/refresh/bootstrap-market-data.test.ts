// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_BOOTSTRAP_MARKET_DATA_STORE,
  bootstrapMarketData,
} from "@/lib/refresh/bootstrap-market-data";
import {
  readActiveMarketCacheGeneration,
  readMarketCacheGenerationById,
  readMarketDailyBasics,
  readMarketDailyQuotes,
  readMarketGenerationDates,
  readMarketStocks,
} from "@/lib/refresh/market-data-store";
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
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function useTempMarketStore() {
  const root = mkdtempSync(path.join(tmpdir(), "gpwy-bootstrap-"));
  tempRoots.push(root);
  vi.stubEnv("REFRESH_DB_PATH", path.join(root, "refresh.sqlite"));
}

function table(fields: string[], items: unknown[][]): TushareDataTable {
  return { fields, items };
}

function tradeDates(count: number) {
  return Array.from(
    { length: count },
    (_, index) => `2026${String(index + 1).padStart(4, "0")}`,
  ).reverse();
}

function createBootstrapClient({
  dateCount = 60,
  failFactorDate,
}: {
  dateCount?: number;
  failFactorDate?: string;
} = {}): TushareClientLike {
  return {
    query: vi.fn(
      async (
        endpoint: TushareEndpoint,
        params: Record<string, unknown> = {},
      ) => {
        if (endpoint.apiName === "stock_basic") {
          const status = String(params.list_status);
          return table(TUSHARE_ENDPOINTS.stockBasic.fields, [
            [`${status}.SZ`, status, "主板", status],
          ]);
        }

        if (endpoint.apiName === "trade_cal") {
          return table(
            TUSHARE_ENDPOINTS.tradeCalendar.fields,
            tradeDates(dateCount).map((tradeDate) => [tradeDate, 1]),
          );
        }

        if (endpoint.apiName === "daily") {
          const tradeDate = String(params.trade_date);
          return table(TUSHARE_ENDPOINTS.daily.fields, [
            ["L.SZ", tradeDate, 10, 11, 9, 10.5, 1200, 1260],
          ]);
        }

        if (endpoint.apiName === "daily_basic") {
          const tradeDate = String(params.trade_date);
          return table(TUSHARE_ENDPOINTS.dailyBasic.fields, [
            ["L.SZ", tradeDate, 2.3, 1.7],
          ]);
        }

        if (endpoint.apiName === "adj_factor") {
          const tradeDate = String(params.trade_date);
          if (tradeDate === failFactorDate) {
            throw new TushareApiError(
              "adj_factor",
              null,
              "network_or_service",
            );
          }
          return table(TUSHARE_ENDPOINTS.adjFactor.fields, [
            ["L.SZ", tradeDate, 1],
          ]);
        }

        throw new Error(`Unexpected endpoint ${endpoint.apiName}`);
      },
    ),
  };
}

describe("bootstrapMarketData", () => {
  it("builds and activates exactly 60 paired market dates", async () => {
    useTempMarketStore();
    const client = createBootstrapClient();

    const result = await bootstrapMarketData({
      client,
      now: new Date("2026-06-26T00:00:00.000Z"),
    });
    const active = readActiveMarketCacheGeneration();

    expect(active?.id).toBe(result.generationId);
    expect(result).toMatchObject({
      stockCount: 3,
      tradeDateCount: 60,
      dailyQuoteCount: 60,
      adjustmentFactorCount: 60,
      dailyBasicCount: 60,
    });
    expect(readMarketGenerationDates(result.generationId)).toHaveLength(60);
    expect(
      readMarketGenerationDates(result.generationId).every(
        (date) =>
          date.dailyStatus === "succeeded" &&
          date.factorStatus === "succeeded",
      ),
    ).toBe(true);
    expect(readMarketStocks().map((stock) => stock.listStatus)).toEqual([
      "D",
      "L",
      "P",
    ]);
    expect(readMarketDailyQuotes(result.generationId)[0]?.high).toBe(11);
    expect(readMarketDailyBasics(result.generationId)).toHaveLength(60);
  });

  it("deletes a partial generation after a provider failure and restarts from zero", async () => {
    useTempMarketStore();
    const firstDate = tradeDates(60)[0];

    await expect(
      bootstrapMarketData({
        client: createBootstrapClient({ failFactorDate: firstDate }),
      }),
    ).rejects.toThrow("network_or_service");

    expect(readMarketCacheGenerationById(1)).toBeNull();
    expect(readActiveMarketCacheGeneration()).toBeNull();

    const retry = await bootstrapMarketData({
      client: createBootstrapClient(),
    });

    expect(retry.generationId).toBe(2);
    expect(readMarketGenerationDates(retry.generationId)).toHaveLength(60);
  });

  it("rejects fewer than 60 calendar dates without leaving a generation", async () => {
    useTempMarketStore();

    await expect(
      bootstrapMarketData({
        client: createBootstrapClient({ dateCount: 59 }),
      }),
    ).rejects.toThrow("insufficient_trading_dates");

    expect(readMarketCacheGenerationById(1)).toBeNull();
    expect(readActiveMarketCacheGeneration()).toBeNull();
  });

  it("cleans the generation when a store write fails", async () => {
    useTempMarketStore();
    const store = {
      ...DEFAULT_BOOTSTRAP_MARKET_DATA_STORE,
      upsertDailyQuotes: vi.fn(() => {
        throw new Error("sqlite_write_failed");
      }),
    };

    await expect(
      bootstrapMarketData({
        client: createBootstrapClient(),
        store,
      }),
    ).rejects.toThrow("sqlite_write_failed");

    expect(readMarketCacheGenerationById(1)).toBeNull();
    expect(readActiveMarketCacheGeneration()).toBeNull();
  });

  it("fans out provider work while the shared scheduler caps the true peak", async () => {
    useTempMarketStore();
    const baseClient = createBootstrapClient({ dateCount: 4 });
    let active = 0;
    let peak = 0;
    const rawClient: TushareClientLike = {
      query: vi.fn(async (endpoint, params, options) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        try {
          return await baseClient.query(endpoint, params, options);
        } finally {
          active -= 1;
        }
      }),
    };
    const scheduler = new ProviderRequestScheduler({
      maxConcurrency: 2,
      requestTimeoutMs: 60_000,
    });
    const client = new ScheduledTushareClient(rawClient, scheduler);

    await bootstrapMarketData({ client, targetTradingDates: 4 });

    expect(peak).toBe(2);
    expect(scheduler.getSnapshot().configuredConcurrency).toBe(2);
  });

  it("waits for every date task before deleting a failed generation", async () => {
    useTempMarketStore();
    const failDate = tradeDates(60)[0];
    let activeDateQueries = 0;
    let activeAtDelete = -1;
    const baseClient = createBootstrapClient({ failFactorDate: failDate });
    const client: TushareClientLike = {
      query: vi.fn(async (endpoint, params, options) => {
        const isDateQuery =
          endpoint.apiName === "daily" || endpoint.apiName === "adj_factor";
        if (isDateQuery) {
          activeDateQueries += 1;
        }
        try {
          if (isDateQuery && String(params?.trade_date) !== failDate) {
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
          return await baseClient.query(endpoint, params, options);
        } finally {
          if (isDateQuery) {
            activeDateQueries -= 1;
          }
        }
      }),
    };
    const store = {
      ...DEFAULT_BOOTSTRAP_MARKET_DATA_STORE,
      deleteBuildingGeneration: (generationId: number) => {
        activeAtDelete = activeDateQueries;
        return DEFAULT_BOOTSTRAP_MARKET_DATA_STORE.deleteBuildingGeneration(
          generationId,
        );
      },
    };

    await expect(bootstrapMarketData({ client, store })).rejects.toThrow(
      "network_or_service",
    );

    expect(activeAtDelete).toBe(0);
    expect(readMarketCacheGenerationById(1)).toBeNull();
  });
});
