// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_TRADING_DATE_COUNT,
  fetchDailyBasicsForDate,
  fetchDailyQuotesForDate,
  fetchMarketStocks,
  fetchRefreshData,
  fetchTargetTradeDates,
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

  it("declares amount and daily_basic turnover fields required by chip model inputs", () => {
    expect(TUSHARE_ENDPOINTS.daily.fields).toContain("amount");
    expect(TUSHARE_ENDPOINTS.dailyBasic).toEqual(
      expect.objectContaining({
        apiName: "daily_basic",
        fields: expect.arrayContaining([
          "ts_code",
          "trade_date",
          "turnover_rate",
          "turnover_rate_f",
        ]),
      }),
    );
  });

  it("uses trade_cal, preserves L/P/D stocks, and returns raw quotes, factors, and daily basics separately", async () => {
    const client = createMockClient(async (endpoint, params) => {
      if (endpoint.apiName === "stock_basic") {
        const status = String(params.list_status);
        return table(["ts_code", "name", "market", "list_status"], [
          [`00000${status === "L" ? 1 : status === "P" ? 2 : 3}.SZ`, status, "主板", status],
        ]);
      }

      if (endpoint.apiName === "trade_cal") {
        return table(["cal_date", "is_open"], [
          ["20260624", 1],
          ["20260626", "1"],
          ["20260625", 0],
        ]);
      }

      if (endpoint.apiName === "daily") {
        const tradeDate = String(params.trade_date);
        return table(TUSHARE_ENDPOINTS.daily.fields, [
          ["000001.SZ", tradeDate, 10, 11, 9, 10.5, 1200, 1260],
        ]);
      }

      if (endpoint.apiName === "adj_factor") {
        const tradeDate = String(params.trade_date);
        const factor = tradeDate === "20260624" ? 2 : 4;
        return table(TUSHARE_ENDPOINTS.adjFactor.fields, [
          ["000001.SZ", tradeDate, factor],
        ]);
      }

      if (endpoint.apiName === "daily_basic") {
        const tradeDate = String(params.trade_date);
        return table(TUSHARE_ENDPOINTS.dailyBasic.fields, [
          ["000001.SZ", tradeDate, 2.3, 1.7],
        ]);
      }

      throw new Error(`Unexpected endpoint ${endpoint.apiName}`);
    });

    const result = await fetchRefreshData({
      client,
      now: new Date("2026-06-26T12:00:00.000Z"),
      targetTradingDates: 2,
      maxLookbackDays: 10,
    });

    expect(client.query).toHaveBeenCalledWith(
      TUSHARE_ENDPOINTS.stockBasic,
      { list_status: "L" },
      { priority: "market" },
    );
    expect(client.query).toHaveBeenCalledWith(
      TUSHARE_ENDPOINTS.stockBasic,
      { list_status: "P" },
      { priority: "market" },
    );
    expect(client.query).toHaveBeenCalledWith(
      TUSHARE_ENDPOINTS.stockBasic,
      { list_status: "D" },
      { priority: "market" },
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.objectContaining({ apiName: "trade_cal" }),
      expect.objectContaining({ is_open: "1" }),
      { priority: "market" },
    );
    expect(
      vi.mocked(client.query).mock.calls.every(
        (call) => call[2]?.priority === "market",
      ),
    ).toBe(true);
    expect(result.tradeDates).toEqual(["20260626", "20260624"]);
    expect(result.stocks.map((stock) => stock.listStatus)).toEqual([
      "L",
      "P",
      "D",
    ]);
    expect(result.dailyQuotes).toEqual([
      {
        tsCode: "000001.SZ",
        tradeDate: "20260626",
        open: 10,
        high: 11,
        low: 9,
        close: 10.5,
        vol: 1200,
        amount: 1260,
      },
      {
        tsCode: "000001.SZ",
        tradeDate: "20260624",
        open: 10,
        high: 11,
        low: 9,
        close: 10.5,
        vol: 1200,
        amount: 1260,
      },
    ]);
    expect(result.adjustmentFactors).toEqual([
      {
        tsCode: "000001.SZ",
        tradeDate: "20260626",
        adjFactor: 4,
      },
      {
        tsCode: "000001.SZ",
        tradeDate: "20260624",
        adjFactor: 2,
      },
    ]);
    expect(result.dailyBasics).toEqual([
      {
        tsCode: "000001.SZ",
        tradeDate: "20260626",
        turnoverRate: 2.3,
        turnoverRateFreeFloat: 1.7,
      },
      {
        tsCode: "000001.SZ",
        tradeDate: "20260624",
        turnoverRate: 2.3,
        turnoverRateFreeFloat: 1.7,
      },
    ]);
    expect(result.dailyQuotes[1]?.high).toBe(11);
  });

  it("fetches daily_basic turnover records for one trade date", async () => {
    const client = createMockClient(async (endpoint, params) => {
      expect(endpoint).toBe(TUSHARE_ENDPOINTS.dailyBasic);
      expect(params).toEqual({ trade_date: "20260626" });
      return table(TUSHARE_ENDPOINTS.dailyBasic.fields, [
        ["000001.SZ", "20260626", 2.3, 1.7],
      ]);
    });

    await expect(
      fetchDailyBasicsForDate({ client, tradeDate: "20260626" }),
    ).resolves.toEqual([
      {
        tsCode: "000001.SZ",
        tradeDate: "20260626",
        turnoverRate: 2.3,
        turnoverRateFreeFloat: 1.7,
      },
    ]);
  });

  it("rejects invalid daily amount and invalid daily_basic turnover values", async () => {
    const dailyClient = createMockClient(async (endpoint) => {
      if (endpoint.apiName === "daily") {
        return table(TUSHARE_ENDPOINTS.daily.fields, [
          ["000001.SZ", "20260626", 10, 11, 9, 10.5, 1200, "bad"],
        ]);
      }

      throw new Error(`Unexpected endpoint ${endpoint.apiName}`);
    });
    const basicClient = createMockClient(async (endpoint) => {
      if (endpoint.apiName === "daily_basic") {
        return table(TUSHARE_ENDPOINTS.dailyBasic.fields, [
          ["000001.SZ", "20260626", "bad", 1.7],
        ]);
      }

      throw new Error(`Unexpected endpoint ${endpoint.apiName}`);
    });

    await expect(
      fetchDailyQuotesForDate({
        client: dailyClient,
        tradeDate: "20260626",
      }),
    ).rejects.toThrow("invalid amount");
    await expect(
      fetchDailyBasicsForDate({
        client: basicClient,
        tradeDate: "20260626",
      }),
    ).rejects.toThrow("invalid turnover_rate");
  });

  it("skips the latest open trading date when daily quotes are not ready yet", async () => {
    const client = createMockClient(async (endpoint, params) => {
      if (endpoint.apiName === "trade_cal") {
        return table(["cal_date", "is_open"], [
          ["20260630", 1],
          ["20260629", 1],
          ["20260626", 1],
        ]);
      }

      if (endpoint.apiName === "daily") {
        if (params.trade_date === "20260630") {
          throw new TushareApiError("daily", 0, "empty data");
        }

        return table(TUSHARE_ENDPOINTS.daily.fields, [
          ["000001.SZ", params.trade_date, 10, 11, 9, 10.5, 1200, 1260],
        ]);
      }

      throw new Error(`Unexpected endpoint ${endpoint.apiName}`);
    });

    await expect(
      fetchTargetTradeDates({
        client,
        now: new Date("2026-06-30T12:00:00.000Z"),
        targetTradingDates: 2,
        maxLookbackDays: 10,
      }),
    ).resolves.toEqual(["20260629", "20260626"]);
    expect(client.query).toHaveBeenCalledWith(
      TUSHARE_ENDPOINTS.daily,
      { trade_date: "20260630" },
      { priority: "market" },
    );
    expect(client.query).toHaveBeenCalledWith(
      TUSHARE_ENDPOINTS.daily,
      { trade_date: "20260629" },
      { priority: "market" },
    );
  });

  it("uses the requested stock status when list_status is omitted", async () => {
    const client = createMockClient(async (endpoint, params) => {
      if (endpoint.apiName === "stock_basic") {
        return table(["ts_code", "name", "market"], [
          [`00000${params.list_status}.SZ`, String(params.list_status), "主板"],
        ]);
      }

      if (endpoint.apiName === "trade_cal") {
        return table(["cal_date", "is_open"], [["20260626", 1]]);
      }

      if (endpoint.apiName === "daily") {
        return table(TUSHARE_ENDPOINTS.daily.fields, [
          ["000001.SZ", "20260626", 10, 11, 9, 10.5, 1200, 1260],
        ]);
      }

      if (endpoint.apiName === "adj_factor") {
        return table(TUSHARE_ENDPOINTS.adjFactor.fields, [
          ["000001.SZ", "20260626", 1],
        ]);
      }

      if (endpoint.apiName === "daily_basic") {
        return table(TUSHARE_ENDPOINTS.dailyBasic.fields, [
          ["000001.SZ", "20260626", 2.3, 1.7],
        ]);
      }

      throw new Error(`Unexpected endpoint ${endpoint.apiName}`);
    });

    const result = await fetchRefreshData({
      client,
      targetTradingDates: 1,
      maxLookbackDays: 2,
    });

    expect(result.stocks.map((stock) => stock.listStatus)).toEqual([
      "L",
      "P",
      "D",
    ]);
  });

  it("keeps bootstrap stock loading when optional stock statuses return empty data", async () => {
    const client = createMockClient(async (endpoint, params) => {
      if (endpoint.apiName === "stock_basic") {
        const status = String(params.list_status);

        if (status === "P") {
          throw new TushareApiError("stock_basic", null, "empty_data");
        }

        return table(["ts_code", "name", "market"], [
          [`00000${status === "L" ? 1 : 3}.SZ`, status, "主板"],
        ]);
      }

      throw new Error(`Unexpected endpoint ${endpoint.apiName}`);
    });

    await expect(fetchMarketStocks({ client })).resolves.toEqual([
      {
        tsCode: "000001.SZ",
        name: "L",
        market: "主板",
        listStatus: "L",
      },
      {
        tsCode: "000003.SZ",
        name: "D",
        market: "主板",
        listStatus: "D",
      },
    ]);
  });

  it("does not add a workflow-local retry around transient failures", async () => {
    let calendarAttempts = 0;
    const client = createMockClient(async (endpoint, params) => {
      if (endpoint.apiName === "stock_basic") {
        return table(TUSHARE_ENDPOINTS.stockBasic.fields, [
          [`${params.list_status}.SZ`, String(params.list_status), "主板", params.list_status],
        ]);
      }

      if (endpoint.apiName === "trade_cal") {
        calendarAttempts += 1;
        if (calendarAttempts === 1) {
          throw new TypeError("fetch failed");
        }
        return table(["cal_date", "is_open"], [["20260626", 1]]);
      }

      if (endpoint.apiName === "daily") {
        return table(TUSHARE_ENDPOINTS.daily.fields, [
          ["000001.SZ", "20260626", 10, 11, 9, 10.5, 1200],
        ]);
      }

      if (endpoint.apiName === "adj_factor") {
        return table(TUSHARE_ENDPOINTS.adjFactor.fields, [
          ["000001.SZ", "20260626", 1],
        ]);
      }

      throw new Error(`Unexpected endpoint ${endpoint.apiName}`);
    });

    await expect(
      fetchRefreshData({
        client,
        targetTradingDates: 1,
        maxLookbackDays: 2,
      }),
    ).rejects.toThrow("fetch failed");

    expect(calendarAttempts).toBe(1);
  });

  it("does not retry non-transient provider failures", async () => {
    const attempts = new Map<string, number>();
    const client = createMockClient(async (endpoint, params) => {
      if (endpoint.apiName === "stock_basic") {
        const status = String(params.list_status);
        attempts.set(status, (attempts.get(status) ?? 0) + 1);
        throw new TushareApiError("stock_basic", null, "permission_denied");
      }

      throw new Error(`Unexpected endpoint ${endpoint.apiName}`);
    });

    await expect(
      fetchRefreshData({
        client,
        targetTradingDates: 1,
      }),
    ).rejects.toThrow("permission_denied");
    expect(attempts).toEqual(
      new Map([
        ["L", 1],
        ["P", 1],
        ["D", 1],
      ]),
    );
  });
});
