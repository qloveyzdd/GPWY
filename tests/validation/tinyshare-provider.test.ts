// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { TushareApiError, TushareClient } from "@/lib/tushare/client";
import { TUSHARE_ENDPOINTS } from "@/lib/tushare/endpoints";
import {
  createTushareClient,
  resolveTushareProvider,
} from "@/lib/tushare/provider";
import { TinysharePythonClient } from "@/lib/tushare/tinyshare-client";

describe("Tushare provider selection", () => {
  it("uses REST by default and tinyshare only when explicitly configured", () => {
    expect(resolveTushareProvider({})).toBe("rest");
    expect(resolveTushareProvider({ TUSHARE_PROVIDER: "rest" })).toBe("rest");
    expect(resolveTushareProvider({ TUSHARE_PROVIDER: "tinyshare" })).toBe(
      "tinyshare",
    );

    expect(createTushareClient("test-token", {})).toBeInstanceOf(
      TushareClient,
    );
    expect(
      createTushareClient("test-token", {
        TUSHARE_PROVIDER: "tinyshare",
        PYTHON_BIN: "python",
      }),
    ).toBeInstanceOf(TinysharePythonClient);
  });
});

describe("TinysharePythonClient", () => {
  it("passes the generic Tushare request shape to the Python bridge", async () => {
    const runner = vi.fn(async () => ({
      fields: ["ts_code", "trade_date", "close"],
      items: [["000001.SZ", "20260211", 12.34]],
    }));
    const client = new TinysharePythonClient({
      token: "request-only-token",
      runner,
    });

    const result = await client.query(TUSHARE_ENDPOINTS.daily, {
      ts_code: "000001.SZ",
      start_date: "20260204",
      end_date: "20260211",
    });

    expect(runner).toHaveBeenCalledWith({
      token: "request-only-token",
      api_name: "daily",
      params: {
        ts_code: "000001.SZ",
        start_date: "20260204",
        end_date: "20260211",
      },
      fields: ["ts_code", "trade_date", "close"],
    });
    expect(JSON.stringify(result)).not.toContain("request-only-token");
  });

  it("keeps empty bridge results on the same safe Tushare error path", async () => {
    const client = new TinysharePythonClient({
      token: "request-only-token",
      runner: async () => ({
        fields: ["ts_code", "trade_date", "close"],
        items: [],
      }),
    });

    await expect(client.query(TUSHARE_ENDPOINTS.daily)).rejects.toMatchObject({
      name: "TushareApiError",
      apiName: "daily",
      code: 0,
    } satisfies Partial<TushareApiError>);
  });
});
