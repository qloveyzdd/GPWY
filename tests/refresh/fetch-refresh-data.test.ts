// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_TRADING_DATE_COUNT,
  fetchRefreshData,
} from "@/lib/refresh/fetch-refresh-data";
import { TushareApiError } from "@/lib/tushare/client";
import { TUSHARE_ENDPOINTS } from "@/lib/tushare/endpoints";
import type {
  TushareClientLike,
  TushareDataTable,
  TushareEndpoint,
} from "@/lib/tushare/types";

function table(fields: string[], items: unknown[][]): TushareDataTable {
  return { fields, items };
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

describe("fetchRefreshData", () => {
  it("uses 60 trading dates by default", () => {
    expect(DEFAULT_TRADING_DATE_COUNT).toBe(60);
  });

  it("fetches listed stock basics and skips empty daily dates", async () => {
    const client = createMockClient(async (endpoint, params) => {
      if (endpoint.apiName === "stock_basic") {
        return table(["ts_code", "name", "market", "list_status"], [
          ["000001.SZ", "平安银行", "主板", "L"],
          ["000002.SZ", "万科A", "主板", "L"],
        ]);
      }

      if (endpoint.apiName === "daily") {
        if (params.trade_date === "20260622") {
          return table(
            ["ts_code", "trade_date", "open", "high", "low", "close", "vol"],
            [
              ["000001.SZ", "20260622", 10, 11, 9, 10.5, 1200],
              ["000002.SZ", "20260622", 20, 22, 19, 21, 2300],
            ],
          );
        }

        if (params.trade_date === "20260620") {
          return table(
            ["ts_code", "trade_date", "open", "high", "low", "close", "vol"],
            [["000001.SZ", "20260620", 9, 10, 8.5, 9.5, 1100]],
          );
        }

        return table(
          ["ts_code", "trade_date", "open", "high", "low", "close", "vol"],
          [],
        );
      }

      if (endpoint.apiName === "adj_factor") {
        return table(["ts_code", "trade_date", "adj_factor"], [
          ["000001.SZ", params.trade_date, 1],
          ["000002.SZ", params.trade_date, 1],
        ]);
      }

      throw new Error(`Unexpected endpoint ${endpoint.apiName}`);
    });

    const result = await fetchRefreshData({
      client,
      now: new Date("2026-06-23T12:00:00.000Z"),
      targetTradingDates: 2,
      maxLookbackDays: 5,
    });

    expect(client.query).toHaveBeenNthCalledWith(
      1,
      TUSHARE_ENDPOINTS.stockBasic,
      { list_status: "L" },
    );
    expect(client.query).toHaveBeenCalledWith(TUSHARE_ENDPOINTS.daily, {
      trade_date: "20260623",
    });
    expect(client.query).toHaveBeenCalledWith(TUSHARE_ENDPOINTS.daily, {
      trade_date: "20260622",
    });
    expect(client.query).toHaveBeenCalledWith(TUSHARE_ENDPOINTS.daily, {
      trade_date: "20260620",
    });
    expect(result.tradeDates).toEqual(["20260622", "20260620"]);
    expect(result.stockBasics).toEqual([
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
    expect(result.dailyBars).toContainEqual({
      tsCode: "000001.SZ",
      tradeDate: "20260622",
      open: 10,
      high: 11,
      low: 9,
      close: 10.5,
      vol: 1200,
    });
  });

  it("adjusts historical prices to the latest trading date basis", async () => {
    const client = createMockClient(async (endpoint, params) => {
      if (endpoint.apiName === "stock_basic") {
        return table(["ts_code", "name", "market", "list_status"], [
          ["301608.SZ", "博实结", "创业板", "L"],
        ]);
      }

      if (endpoint.apiName === "daily") {
        const tradeDate = String(params.trade_date);

        if (tradeDate === "20260622") {
          return table(
            ["ts_code", "trade_date", "open", "high", "low", "close", "vol"],
            [["301608.SZ", tradeDate, 54.95, 55, 51.82, 53.43, 1200]],
          );
        }

        if (tradeDate === "20260514") {
          return table(
            ["ts_code", "trade_date", "open", "high", "low", "close", "vol"],
            [["301608.SZ", tradeDate, 101, 106.4, 99, 101, 1000]],
          );
        }

        return table(TUSHARE_ENDPOINTS.daily.fields, []);
      }

      if (endpoint.apiName === "adj_factor") {
        const tradeDate = String(params.trade_date);
        const factor = tradeDate === "20260622" ? 1.5307 : 1.0228;

        return table(TUSHARE_ENDPOINTS.adjFactor.fields, [
          ["301608.SZ", tradeDate, factor],
        ]);
      }

      throw new Error(`Unexpected endpoint ${endpoint.apiName}`);
    });

    const result = await fetchRefreshData({
      client,
      now: new Date("2026-06-22T12:00:00.000Z"),
      targetTradingDates: 2,
      maxLookbackDays: 40,
    });
    const oldBar = result.dailyBars.find(
      (bar) => bar.tradeDate === "20260514",
    );
    const latestBar = result.dailyBars.find(
      (bar) => bar.tradeDate === "20260622",
    );

    expect(oldBar?.high).toBeCloseTo((106.4 * 1.0228) / 1.5307, 8);
    expect(latestBar?.high).toBe(55);
  });

  it("treats empty daily provider errors as skipped dates", async () => {
    const client = createMockClient(async (endpoint, params) => {
      if (endpoint.apiName === "stock_basic") {
        return table(["ts_code", "name", "market", "list_status"], [
          ["000001.SZ", "平安银行", "主板", "L"],
        ]);
      }

      if (endpoint.apiName === "daily") {
        if (params.trade_date === "20260623") {
          throw new TushareApiError("daily", 0, "empty data");
        }

        return table(
          ["ts_code", "trade_date", "open", "high", "low", "close", "vol"],
          [["000001.SZ", "20260622", 10, 11, 9, 10.5, 1200]],
        );
      }

      if (endpoint.apiName === "adj_factor") {
        return table(TUSHARE_ENDPOINTS.adjFactor.fields, [
          ["000001.SZ", params.trade_date, 1],
        ]);
      }

      throw new Error(`Unexpected endpoint ${endpoint.apiName}`);
    });

    const result = await fetchRefreshData({
      client,
      now: new Date("2026-06-23T12:00:00.000Z"),
      targetTradingDates: 1,
      maxLookbackDays: 3,
    });

    expect(result.tradeDates).toEqual(["20260622"]);
    expect(result.dailyBars).toHaveLength(1);
  });

  it("retries transient daily provider failures once by default", async () => {
    let dailyAttempts = 0;
    const client = createMockClient(async (endpoint, params) => {
      if (endpoint.apiName === "stock_basic") {
        return table(["ts_code", "name", "market", "list_status"], [
          ["000001.SZ", "平安银行", "主板", "L"],
        ]);
      }

      if (endpoint.apiName === "daily") {
        dailyAttempts += 1;

        if (dailyAttempts === 1) {
          throw new TypeError("fetch failed");
        }

        return table(
          ["ts_code", "trade_date", "open", "high", "low", "close", "vol"],
          [["000001.SZ", "20260623", 10, 11, 9, 10.5, 1200]],
        );
      }

      if (endpoint.apiName === "adj_factor") {
        return table(TUSHARE_ENDPOINTS.adjFactor.fields, [
          ["000001.SZ", params.trade_date, 1],
        ]);
      }

      throw new Error(`Unexpected endpoint ${endpoint.apiName}`);
    });

    const result = await fetchRefreshData({
      client,
      now: new Date("2026-06-23T12:00:00.000Z"),
      targetTradingDates: 1,
      maxLookbackDays: 1,
      providerRetryDelayMs: 0,
    });

    expect(dailyAttempts).toBe(2);
    expect(result.tradeDates).toEqual(["20260623"]);
  });

  it("does not retry non-transient provider failures", async () => {
    let dailyAttempts = 0;
    const client = createMockClient(async (endpoint) => {
      if (endpoint.apiName === "stock_basic") {
        return table(["ts_code", "name", "market", "list_status"], [
          ["000001.SZ", "平安银行", "主板", "L"],
        ]);
      }

      if (endpoint.apiName === "daily") {
        dailyAttempts += 1;
        throw new TushareApiError("daily", null, "permission_denied");
      }

      throw new Error(`Unexpected endpoint ${endpoint.apiName}`);
    });

    await expect(
      fetchRefreshData({
        client,
        now: new Date("2026-06-23T12:00:00.000Z"),
        targetTradingDates: 1,
        maxLookbackDays: 1,
        providerRetryCount: 2,
        providerRetryDelayMs: 0,
      }),
    ).rejects.toThrow("permission_denied");
    expect(dailyAttempts).toBe(1);
  });

  it("keeps listed stock basics when the provider omits list_status", async () => {
    const client = createMockClient(async (endpoint, params) => {
      if (endpoint.apiName === "stock_basic") {
        return table(["ts_code", "name", "market"], [
          ["000001.SZ", "平安银行", "主板"],
        ]);
      }

      if (endpoint.apiName === "daily") {
        return table(
          ["ts_code", "trade_date", "open", "high", "low", "close", "vol"],
          [["000001.SZ", "20260622", 10, 11, 9, 10.5, 1200]],
        );
      }

      if (endpoint.apiName === "adj_factor") {
        return table(TUSHARE_ENDPOINTS.adjFactor.fields, [
          ["000001.SZ", params.trade_date, 1],
        ]);
      }

      throw new Error(`Unexpected endpoint ${endpoint.apiName}`);
    });

    const result = await fetchRefreshData({
      client,
      now: new Date("2026-06-22T12:00:00.000Z"),
      targetTradingDates: 1,
      maxLookbackDays: 1,
    });

    expect(result.stockBasics).toEqual([
      {
        tsCode: "000001.SZ",
        name: "平安银行",
        market: "主板",
        listStatus: "L",
      },
    ]);
  });
});
