// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { TUSHARE_ENDPOINTS } from "@/lib/tushare/endpoints";
import {
  classifyTushareError,
  TushareApiError,
  TushareClient,
} from "@/lib/tushare/client";

describe("Tushare error sanitizer", () => {
  it("classifies invalid token errors without exposing raw token or payload", () => {
    const secret = "very-secret-token";
    const safeError = classifyTushareError(
      new TushareApiError(
        "stock_basic",
        -2001,
        `抱歉，您输入的TOKEN无效: ${secret}`,
      ),
      "stock_basic",
    );

    const serialized = JSON.stringify(safeError);

    expect(safeError.category).toBe("invalid_token");
    expect(safeError.affectedInterface).toBe("stock_basic");
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("TOKEN无效");
  });

  it("maps permission, empty, rate-limit, and network failures to stable categories", () => {
    expect(
      classifyTushareError(
        new TushareApiError("daily", -2002, "没有访问该接口的权限"),
        "daily",
      ).category,
    ).toBe("permission_denied");

    expect(
      classifyTushareError(
        new TushareApiError("stock_basic", 0, "empty data"),
        "stock_basic",
      ).category,
    ).toBe("empty_data");

    expect(
      classifyTushareError(new Error("rate limit exceeded"), "daily")
        .category,
    ).toBe("rate_limited");

    expect(classifyTushareError(new TypeError("fetch failed"), "daily").category)
      .toBe("network_or_service");

    const abortError = new Error("operation aborted");
    abortError.name = "AbortError";
    expect(classifyTushareError(abortError, "daily").category).toBe(
      "network_or_service",
    );
  });

  it("sends the official generic query shape and returns only response data", async () => {
    const fetcher = vi.fn(
      async (
        input: string,
        init: {
          method: "POST";
          headers: Record<string, string>;
          body: string;
          signal?: AbortSignal;
        },
      ) => {
        expect(input).toBe("https://api.tushare.pro");
        expect(init.method).toBe("POST");

        return new Response(
          JSON.stringify({
            code: 0,
            msg: null,
            data: {
              fields: ["ts_code", "name"],
              items: [["000001.SZ", "平安银行"]],
            },
          }),
        );
      },
    );
    const client = new TushareClient({
      token: "request-only-token",
      fetcher,
    });

    const result = await client.query(TUSHARE_ENDPOINTS.stockBasic, {
      list_status: "L",
    });

    const [, init] = fetcher.mock.calls[0]!;
    const requestBody = JSON.parse(init.body);

    expect(requestBody).toEqual({
      api_name: "stock_basic",
      token: "request-only-token",
      params: { list_status: "L" },
      fields: "ts_code,name,market,list_status",
    });
    expect(JSON.stringify(result)).not.toContain("request-only-token");
  });

  it("passes the scheduler signal to fetch and sanitizes abort errors", async () => {
    const controller = new AbortController();
    const secret = "secret-payload";
    const fetcher = vi.fn(
      async (
        _input: string,
        init: {
          method: "POST";
          headers: Record<string, string>;
          body: string;
          signal?: AbortSignal;
        },
      ) => {
        expect(init.signal).toBe(controller.signal);
        const error = new Error(`aborted ${secret}`);
        error.name = "AbortError";
        throw error;
      },
    );
    const client = new TushareClient({
      token: "request-only-token",
      fetcher,
    });

    const error = await client
      .query(TUSHARE_ENDPOINTS.daily, {}, { signal: controller.signal })
      .catch((reason: unknown) => reason);
    const safeError = classifyTushareError(error, "daily");

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(safeError.category).toBe("network_or_service");
    expect(JSON.stringify(safeError)).not.toContain(secret);
    expect(JSON.stringify(safeError)).not.toContain("request-only-token");
  });
});
