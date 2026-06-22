// @vitest-environment node
import { describe, expect, it } from "vitest";

import { loadServerConfig } from "@/lib/config";

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
});
