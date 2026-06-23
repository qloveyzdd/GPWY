import path from "node:path";

import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const smokeDbPath =
  process.env.REFRESH_DB_PATH ??
  path.join(process.cwd(), ".data", "smoke.sqlite");
const appPassword = process.env.APP_PASSWORD ?? "smoke-password";
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;

process.env.REFRESH_DB_PATH = smokeDbPath;
process.env.APP_PASSWORD = appPassword;
process.env.TUSHARE_TOKEN = process.env.TUSHARE_TOKEN ?? "smoke-token";
process.env.TUSHARE_PROVIDER = process.env.TUSHARE_PROVIDER ?? "rest";

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  globalSetup: "./tests/smoke/seed-smoke-db.ts",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    ...(browserChannel ? { channel: browserChannel } : {}),
  } satisfies PlaywrightTestConfig["use"],
  webServer: {
    command: `${process.platform === "win32" ? "npm.cmd" : "npm"} run build && ${
      process.platform === "win32" ? "npm.cmd" : "npm"
    } run start -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      APP_PASSWORD: appPassword,
      TUSHARE_TOKEN: process.env.TUSHARE_TOKEN,
      TUSHARE_PROVIDER: process.env.TUSHARE_PROVIDER,
      REFRESH_DB_PATH: smokeDbPath,
    },
  },
});
