// @vitest-environment node
import {
  readFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline";

import { afterEach, describe, expect, it, vi } from "vitest";

import { TushareApiError } from "@/lib/tushare/client";
import { TUSHARE_ENDPOINTS } from "@/lib/tushare/endpoints";
import {
  createTushareClient,
  resolveTushareProvider,
} from "@/lib/tushare/provider";
import { resetProviderRuntimeForTests } from "@/lib/tushare/provider-runtime";
import { ScheduledTushareClient } from "@/lib/tushare/scheduled-client";
import { TinysharePythonClient } from "@/lib/tushare/tinyshare-client";

const persistentWorkerPath = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "tinyshare-persistent-worker.mjs",
);

afterEach(async () => {
  await resetProviderRuntimeForTests();
});

function createPersistentClient(
  options: Partial<ConstructorParameters<typeof TinysharePythonClient>[0]> = {},
) {
  return new TinysharePythonClient({
    token: "request-only-token",
    pythonPath: process.execPath,
    scriptPath: persistentWorkerPath,
    workerCount: 1,
    timeoutMs: 1_000,
    ...options,
  });
}

describe("Tushare provider selection", () => {
  it("uses REST by default and tinyshare only when explicitly configured", async () => {
    expect(resolveTushareProvider({})).toBe("rest");
    expect(resolveTushareProvider({ TUSHARE_PROVIDER: "rest" })).toBe("rest");
    expect(resolveTushareProvider({ TUSHARE_PROVIDER: "tinyshare" })).toBe(
      "tinyshare",
    );

    expect(createTushareClient("test-token", {})).toBeInstanceOf(
      ScheduledTushareClient,
    );
    await resetProviderRuntimeForTests();
    expect(
      createTushareClient("test-token", {
        TUSHARE_PROVIDER: "tinyshare",
        PYTHON_BIN: "python",
      }),
    ).toBeInstanceOf(ScheduledTushareClient);
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
        persistentWorkerPath,
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
    const client = createPersistentClient();
    const result = await client.query(
      { apiName: "stock_basic", fields: ["encoding"] },
      { mode: "encoding" },
    );

    expect(result.items[0]?.[2]).toBe("utf-8");
    await client.close();
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

  it("reuses one worker PID for consecutive queries", async () => {
    const client = createPersistentClient();

    const first = await client.query(TUSHARE_ENDPOINTS.daily, { mode: "pid" });
    const second = await client.query(TUSHARE_ENDPOINTS.daily, { mode: "pid" });

    expect(first.items[0]?.[0]).toBe(second.items[0]?.[0]);
    await client.close();
  });

  it("runs workers in parallel while keeping each PID serial", async () => {
    const client = createPersistentClient({
      workerCount: 2,
      timeoutMs: 2_000,
    });

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        client.query(TUSHARE_ENDPOINTS.daily, {
          mode: "delay",
          delay_ms: 80,
        }),
      ),
    );

    expect(new Set(results.map((result) => result.items[0]?.[0])).size).toBe(2);
    expect(results.every((result) => result.items[0]?.[1] === 1)).toBe(true);
    await client.close();
  });

  it("kills and rebuilds a worker after timeout", async () => {
    const client = createPersistentClient({ timeoutMs: 40 });
    const first = await client.query(TUSHARE_ENDPOINTS.daily, { mode: "pid" });

    await expect(
      client.query(TUSHARE_ENDPOINTS.daily, {
        mode: "delay",
        delay_ms: 200,
      }),
    ).rejects.toMatchObject({
      message: "network_or_service",
    });
    const next = await client.query(TUSHARE_ENDPOINTS.daily, { mode: "pid" });

    expect(next.items[0]?.[0]).not.toBe(first.items[0]?.[0]);
    await client.close();
  });

  it("rebuilds the slot after malformed worker output", async () => {
    const client = createPersistentClient();
    const first = await client.query(TUSHARE_ENDPOINTS.daily, { mode: "pid" });

    await expect(
      client.query(TUSHARE_ENDPOINTS.daily, { mode: "malformed" }),
    ).rejects.toMatchObject({
      message: "network_or_service",
    });
    const next = await client.query(TUSHARE_ENDPOINTS.daily, { mode: "pid" });

    expect(next.items[0]?.[0]).not.toBe(first.items[0]?.[0]);
    await client.close();
  });

  it("disables exhausted slots and settles all queued requests", async () => {
    const client = createPersistentClient({
      restartBudget: 3,
      timeoutMs: 500,
    });
    const requests = Array.from({ length: 4 }, () =>
      client.query(TUSHARE_ENDPOINTS.daily, { mode: "exit" }),
    );

    const results = await Promise.allSettled(requests);

    expect(results).toHaveLength(4);
    expect(
      results.filter(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof TushareApiError &&
          result.reason.message === "network_or_service",
      ),
    ).toHaveLength(3);
    expect(results[3]).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({
        message: "tinyshare_worker_pool_unavailable",
      }),
    });
    await expect(client.close()).resolves.toBeUndefined();
    await expect(client.close()).resolves.toBeUndefined();
  });
});
