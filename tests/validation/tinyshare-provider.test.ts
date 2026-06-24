// @vitest-environment node
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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
  it("forces UTF-8 for bridge output so Chinese stock names stay intact", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "gpwy-tinyshare-encoding-"));
    const scriptPath = path.join(root, "encoding-bridge.js");
    writeFileSync(
      scriptPath,
      [
        "process.stdin.resume();",
        "process.stdin.on('end', () => {",
        "  process.stdout.write(JSON.stringify({",
        "    ok: true,",
        "    data: {",
        "      fields: ['name', 'encoding'],",
        "      items: [['平安银行', process.env.PYTHONIOENCODING]],",
        "    },",
        "  }));",
        "});",
      ].join("\n"),
      "utf8",
    );

    try {
      const client = new TinysharePythonClient({
        token: "request-only-token",
        pythonPath: process.execPath,
        scriptPath,
      });

      await expect(
        client.query({
          apiName: "stock_basic",
          fields: ["name", "encoding"],
        }),
      ).resolves.toEqual({
        fields: ["name", "encoding"],
        items: [["平安银行", "utf-8"]],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("passes the generic Tushare request shape to the Python bridge", async () => {
    const runner = vi.fn(async () => ({
      fields: TUSHARE_ENDPOINTS.daily.fields,
      items: [["000001.SZ", "20260211", 12, 12.8, 11.9, 12.34, 12345]],
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
      fields: TUSHARE_ENDPOINTS.daily.fields,
    });
    expect(JSON.stringify(result)).not.toContain("request-only-token");
  });

  it("keeps empty bridge results on the same safe Tushare error path", async () => {
    const client = new TinysharePythonClient({
      token: "request-only-token",
      runner: async () => ({
        fields: TUSHARE_ENDPOINTS.daily.fields,
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
