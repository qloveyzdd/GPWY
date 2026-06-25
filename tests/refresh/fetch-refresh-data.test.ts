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

  it("uses trade_cal, preserves L/P/D stocks, and returns raw quotes and factors separately", async () => {
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
          ["000001.SZ", tradeDate, 10, 11, 9, 10.5, 1200],
        ]);
      }

      if (endpoint.apiName === "adj_factor") {
        const tradeDate = String(params.trade_date);
        const factor = tradeDate === "20260624" ? 2 : 4;
        return table(TUSHARE_ENDPOINTS.adjFactor.fields, [
          ["000001.SZ", tradeDate, factor],
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
      },
      {
        tsCode: "000001.SZ",
        tradeDate: "20260624",
        open: 10,
        high: 11,
        low: 9,
        close: 10.5,
        vol: 1200,
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
    expect(result.dailyQuotes[1]?.high).toBe(11);
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
