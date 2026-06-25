// @vitest-environment node
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { TUSHARE_ENDPOINTS } from "@/lib/tushare/endpoints";
import { createTushareClient } from "@/lib/tushare/provider";
import {
  getProviderRuntime,
  resetProviderRuntimeForTests,
} from "@/lib/tushare/provider-runtime";
import { ScheduledTushareClient } from "@/lib/tushare/scheduled-client";

const fixturePath = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "tinyshare-persistent-worker.mjs",
);

afterEach(async () => {
  await resetProviderRuntimeForTests();
});

describe("provider runtime", () => {
  it("shares one process-level scheduler across production clients", () => {
    const env = {
      TUSHARE_PROVIDER: "rest",
      TUSHARE_MAX_CONCURRENCY: "3",
    };
    const firstRuntime = getProviderRuntime(env);
    const firstClient = createTushareClient("token-a", env);
    const secondClient = createTushareClient("token-b", env);
    const secondRuntime = getProviderRuntime(env);

    expect(firstClient).toBeInstanceOf(ScheduledTushareClient);
    expect(secondClient).toBeInstanceOf(ScheduledTushareClient);
    expect(firstRuntime).toBe(secondRuntime);
    expect(firstRuntime.scheduler).toBe(secondRuntime.scheduler);
    expect(firstRuntime.getSnapshot().scheduler.configuredConcurrency).toBe(3);
  });

  it("caps tinyshare scheduling by both global concurrency and worker count", () => {
    const runtime = getProviderRuntime({
      TUSHARE_PROVIDER: "tinyshare",
      TUSHARE_MAX_CONCURRENCY: "2",
      TINYSHARE_WORKER_COUNT: "6",
      PYTHON_BIN: process.execPath,
      TINYSHARE_SCRIPT_PATH: fixturePath,
    });

    expect(runtime.getSnapshot()).toMatchObject({
      provider: "tinyshare",
      workerCount: 6,
      scheduler: {
        configuredConcurrency: 2,
        effectiveConcurrency: 2,
      },
    });
  });

  it("reuses the same tinyshare worker pool for the same token and config", async () => {
    const env = {
      TUSHARE_PROVIDER: "tinyshare",
      TUSHARE_MAX_CONCURRENCY: "4",
      TUSHARE_REQUEST_TIMEOUT_MS: "2000",
      TINYSHARE_WORKER_COUNT: "1",
      PYTHON_BIN: process.execPath,
      TINYSHARE_SCRIPT_PATH: fixturePath,
    };
    const firstClient = createTushareClient("shared-token", env);
    const secondClient = createTushareClient("shared-token", env);

    const first = await firstClient.query(TUSHARE_ENDPOINTS.daily, {
      mode: "pid",
    });
    const second = await secondClient.query(TUSHARE_ENDPOINTS.daily, {
      mode: "pid",
    });

    expect(first.items[0]?.[0]).toBe(second.items[0]?.[0]);
  });

  it("keeps snapshots safe and closes idempotently without provider fallback", async () => {
    const secret = "runtime-secret-token";
    const privatePath = `${fixturePath}-private`;
    const env = {
      TUSHARE_PROVIDER: "tinyshare",
      TINYSHARE_WORKER_COUNT: "1",
      PYTHON_BIN: process.execPath,
      TINYSHARE_SCRIPT_PATH: fixturePath,
    };
    const runtime = getProviderRuntime(env);
    const client = runtime.createClient(secret);
    await client.query(TUSHARE_ENDPOINTS.daily, { mode: "pid" });

    const serialized = JSON.stringify(runtime.getSnapshot());
    expect(runtime.provider).toBe("tinyshare");
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(process.execPath);
    expect(serialized).not.toContain(privatePath);
    await expect(runtime.close()).resolves.toBeUndefined();
    await expect(runtime.close()).resolves.toBeUndefined();
    expect(runtime.getSnapshot().closed).toBe(true);
  });
});
