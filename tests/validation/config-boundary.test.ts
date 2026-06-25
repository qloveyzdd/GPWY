// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  loadServerConfig,
  readProviderRuntimeConfig,
} from "@/lib/config";

describe("server config boundary", () => {
  it("returns sanitized status without exposing secrets", () => {
    const status = loadServerConfig({
      APP_PASSWORD: "local-password",
      TUSHARE_TOKEN: "secret-token-value",
    });

    const serialized = JSON.stringify(status);

    expect(status.appPassword.configured).toBe(true);
    expect(status.tushareToken.configured).toBe(true);
    expect(status.provider).toBe("rest");
    expect(serialized).not.toContain("local-password");
    expect(serialized).not.toContain("secret-token-value");
  });

  it("reports the selected provider without exposing local Python path", () => {
    const status = loadServerConfig({
      APP_PASSWORD: "local-password",
      TUSHARE_TOKEN: "secret-token-value",
      TUSHARE_PROVIDER: "tinyshare",
      PYTHON_BIN: "C:\\private\\python.exe",
    });

    const serialized = JSON.stringify(status);

    expect(status.provider).toBe("tinyshare");
    expect(serialized).not.toContain("C:\\private\\python.exe");
    expect(serialized).not.toContain("secret-token-value");
  });

  it("classifies a missing Tushare token as server configuration error", () => {
    const status = loadServerConfig({
      APP_PASSWORD: "local-password",
    });

    expect(status.tushareToken.configured).toBe(false);
    expect(status.issues).toContainEqual({
      category: "missing_config",
      affected: "TUSHARE_TOKEN",
      message:
        "缺少服务端配置。请在服务器环境变量中设置 TUSHARE_TOKEN 后重新验证。",
    });
  });

  it("uses bounded provider runtime defaults", () => {
    expect(readProviderRuntimeConfig({})).toEqual({
      maxConcurrency: 8,
      requestTimeoutMs: 60_000,
      tinyshareWorkerCount: 2,
    });
  });

  it("parses explicit bounded provider runtime values", () => {
    expect(
      readProviderRuntimeConfig({
        TUSHARE_MAX_CONCURRENCY: "12",
        TUSHARE_REQUEST_TIMEOUT_MS: "90000",
        TINYSHARE_WORKER_COUNT: "4",
      }),
    ).toEqual({
      maxConcurrency: 12,
      requestTimeoutMs: 90_000,
      tinyshareWorkerCount: 4,
    });
  });

  it.each([
    ["TUSHARE_MAX_CONCURRENCY", "0"],
    ["TUSHARE_MAX_CONCURRENCY", "33"],
    ["TUSHARE_MAX_CONCURRENCY", "1.5"],
    ["TUSHARE_REQUEST_TIMEOUT_MS", "999"],
    ["TUSHARE_REQUEST_TIMEOUT_MS", "300001"],
    ["TINYSHARE_WORKER_COUNT", "0"],
    ["TINYSHARE_WORKER_COUNT", "9"],
    ["TINYSHARE_WORKER_COUNT", "NaN"],
  ])("rejects invalid runtime config %s=%s", (key, value) => {
    expect(() => readProviderRuntimeConfig({ [key]: value })).toThrow();
  });
});
