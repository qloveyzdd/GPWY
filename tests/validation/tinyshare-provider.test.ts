// @vitest-environment node
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

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
  it("uses a persistent JSON Lines bridge that initializes pro_api once", async () => {
    const bridgeSource = readFileSync(
      path.join(process.cwd(), "scripts", "tinyshare_bridge.py"),
      "utf8",
    );
    expect(bridgeSource.match(/ts\.pro_api\(\)/g)).toHaveLength(1);

    const child = spawn(
      process.execPath,
      [
        path.join(
          process.cwd(),
          "tests",
          "fixtures",
          "tinyshare-persistent-worker.mjs",
        ),
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const output = createInterface({ input: child.stdout, crlfDelay: Infinity });
    const messages: unknown[] = [];
    output.on("line", (line) => messages.push(JSON.parse(line)));

    child.stdin.write(
      `${JSON.stringify({ type: "init", token: "request-only-token" })}\n`,
    );
    child.stdin.write(
      `${JSON.stringify({
        type: "query",
        request_id: "first",
        api_name: "daily",
        params: { mode: "pid" },
        fields: [],
      })}\n`,
    );
    child.stdin.write(
      `${JSON.stringify({
        type: "query",
        request_id: "second",
        api_name: "daily",
        params: { mode: "pid" },
        fields: [],
      })}\n`,
    );
    child.stdin.end(`${JSON.stringify({ type: "shutdown" })}\n`);

    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", () => resolve());
    });

    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ type: "ready" });
    expect(messages[1]).toMatchObject({
      type: "result",
      request_id: "first",
      ok: true,
    });
    expect(messages[2]).toMatchObject({
      type: "result",
      request_id: "second",
      ok: true,
    });
    const firstPid = (
      messages[1] as { data: { items: [[number, number]] } }
    ).data.items[0][0];
    const secondPid = (
      messages[2] as { data: { items: [[number, number]] } }
    ).data.items[0][0];
    expect(firstPid).toBe(secondPid);
  });

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
