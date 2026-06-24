// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("deployment contract", () => {
  it("keeps required self-hosting scripts available", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts).toMatchObject({
      build: "next build",
      start: "next start",
      typecheck: "tsc --noEmit",
      test: "vitest --passWithNoTests",
      smoke: "playwright test",
    });
    expect(packageJson.scripts?.verify).toContain("npm run typecheck");
    expect(packageJson.scripts?.verify).toContain("npm run lint");
    expect(packageJson.scripts?.verify).toContain("npm run test -- --run");
    expect(packageJson.scripts?.verify).toContain("npm run build");
  });

  it("documents required environment variables and cloud commands", () => {
    const readme = readFileSync(path.join(root, "README.md"), "utf8");

    for (const name of [
      "APP_PASSWORD",
      "TUSHARE_TOKEN",
      "TUSHARE_PROVIDER",
      "REFRESH_DB_PATH",
    ]) {
      expect(readme).toContain(name);
    }

    for (const command of [
      "npm ci",
      "npm run build",
      "npm run start",
      "npm run verify",
      "npm run smoke",
    ]) {
      expect(readme).toContain(command);
    }
  });

  it("keeps the environment example placeholder-only", () => {
    const envExample = readFileSync(path.join(root, ".env.example"), "utf8");

    expect(envExample).toContain("APP_PASSWORD=change-me");
    expect(envExample).toContain(
      "TUSHARE_TOKEN=your-tushare-or-tinyshare-token",
    );
    expect(envExample).toContain("TUSHARE_PROVIDER=rest");
    expect(envExample).toContain("REFRESH_DB_PATH=.data/refresh.sqlite");
  });
});
