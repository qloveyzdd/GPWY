// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { TushareApiError } from "@/lib/tushare/client";
import { TUSHARE_ENDPOINTS } from "@/lib/tushare/endpoints";
import { runChipAndPriceValidation } from "@/lib/validation/chip-and-price-validation";
import { sanitizeValidationSnapshot } from "@/lib/validation/result-sanitizer";

describe("chip and price validation", () => {
  it("selects front-adjusted basis only when daily and adj_factor are available", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        fields: ["ts_code", "trade_date", "adj_factor"],
        items: [["000001.SZ", "20260622", 123.45]],
      })
      .mockResolvedValueOnce({
        fields: ["ts_code", "trade_date", "price", "percent"],
        items: [["000001.SZ", "20260622", 12.3, 0.42]],
      })
      .mockResolvedValueOnce({
        fields: ["ts_code", "trade_date", "cost_50pct"],
        items: [["000001.SZ", "20260622", 11.8]],
      });

    const result = await runChipAndPriceValidation({
      client: { query },
      tsCode: "000001.SZ",
      dailyProbe: {
        fields: ["ts_code", "trade_date", "close"],
        items: [["000001.SZ", "20260622", 12.34]],
      },
      now: new Date("2026-06-23T00:00:00.000Z"),
    });

    expect(result.priceBasis.status).toBe("success");
    expect(JSON.stringify(result.priceBasis)).toContain("front_adjusted");
    expect(result.chipCandidate.status).toBe("success");
    expect(JSON.stringify(result.chipCandidate)).toContain("available");
    expect(JSON.stringify(result)).not.toContain("chip_peak");
    expect(query).toHaveBeenNthCalledWith(
      1,
      TUSHARE_ENDPOINTS.adjFactor,
      {
        ts_code: "000001.SZ",
        start_date: "20260613",
        end_date: "20260623",
      },
      { priority: "validation" },
    );
    expect(
      query.mock.calls.every(
        (call) => call[2]?.priority === "validation",
      ),
    ).toBe(true);
  });

  it("falls back to unadjusted daily and blocks chip peak when official chip data is unavailable", async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(new TushareApiError("adj_factor", 0, "empty data"))
      .mockRejectedValueOnce(
        new TushareApiError("cyq_chips", -2002, "没有访问该接口的权限"),
      )
      .mockRejectedValueOnce(new TushareApiError("cyq_perf", 0, "empty data"));

    const result = await runChipAndPriceValidation({
      client: { query },
      tsCode: "000001.SZ",
      dailyProbe: {
        fields: ["ts_code", "trade_date", "close"],
        items: [["000001.SZ", "20260622", 12.34]],
      },
      now: new Date("2026-06-23T00:00:00.000Z"),
    });

    const serialized = JSON.stringify(result);

    expect(result.priceBasis.status).toBe("warning");
    expect(serialized).toContain("unadjusted_daily");
    expect(serialized).toContain("fallback_risk");
    expect(result.chipCandidate.status).toBe("blocked");
    expect(serialized).toContain("permission_denied");
    expect(serialized).not.toContain("chip_peak");
  });

  it("sanitizes token-shaped and stack-like values from final snapshots", () => {
    const snapshot = sanitizeValidationSnapshot({
      overallStatus: "blocked",
      lastRunAt: "2026-06-23T00:00:00.000Z",
      summary: "raw token=secret-token-value",
      sections: [
        {
          key: "chip_candidate",
          title: "筹码候选接口",
          status: "blocked",
          summary: "Error: boom at C:/server/path secret-token-value",
          details: [
            { label: "headers", value: "Authorization: secret-token-value" },
          ],
        },
      ],
    });

    const serialized = JSON.stringify(snapshot);

    expect(serialized).not.toContain("secret-token-value");
    expect(serialized).not.toContain("C:/server/path");
  });
});
