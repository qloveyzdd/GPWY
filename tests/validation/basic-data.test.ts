// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readLatestValidationSnapshot } from "@/lib/validation-store";
import { runBasicValidation } from "@/lib/validation/run-basic-validation";

const tempRoots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function useTempStore() {
  const root = mkdtempSync(path.join(tmpdir(), "gpwy-basic-validation-"));
  tempRoots.push(root);
  vi.stubEnv("VALIDATION_DB_PATH", path.join(root, "validation.sqlite"));
}

describe("basic data validation", () => {
  it("stores a sanitized missing-token snapshot", async () => {
    useTempStore();
    vi.stubEnv("APP_PASSWORD", "local-password");
    vi.stubEnv("TUSHARE_TOKEN", "");

    const snapshot = await runBasicValidation({
      now: new Date("2026-06-23T00:00:00.000Z"),
    });

    expect(snapshot.overallStatus).toBe("blocked");
    expect(JSON.stringify(snapshot)).toContain("missing_config");
    expect(JSON.stringify(snapshot)).not.toContain("local-password");
    expect(readLatestValidationSnapshot()).toEqual(snapshot);
  });

  it("stores stock_basic sample and price-basis probe details without token leakage", async () => {
    useTempStore();
    vi.stubEnv("APP_PASSWORD", "local-password");
    vi.stubEnv("TUSHARE_TOKEN", "secret-token-value");
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        fields: ["ts_code", "name", "market", "list_status"],
        items: [["000001.SZ", "平安银行", "主板", "L"]],
      })
      .mockResolvedValueOnce({
        fields: ["ts_code", "trade_date", "close"],
        items: [["000001.SZ", "20260622", 12.34]],
      })
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

    const snapshot = await runBasicValidation({
      client: { query },
      now: new Date("2026-06-23T00:00:00.000Z"),
    });

    const serialized = JSON.stringify(snapshot);

    expect(snapshot.overallStatus).toBe("success");
    expect(serialized).toContain("000001.SZ");
    expect(serialized).toContain("平安银行");
    expect(serialized).toContain("front_adjusted");
    expect(serialized).toContain("available");
    expect(serialized).not.toContain("secret-token-value");
    expect(query).toHaveBeenCalledTimes(5);
    expect(
      query.mock.calls.every(
        (call) => call[2]?.priority === "validation",
      ),
    ).toBe(true);
    expect(readLatestValidationSnapshot()).toEqual(snapshot);
  });
});
