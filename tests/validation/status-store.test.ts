// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readLatestValidationSnapshot,
  writeValidationSnapshot,
} from "@/lib/validation-store";
import type { ValidationSnapshot } from "@/lib/validation-types";

const tempRoots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("validation snapshot store", () => {
  it("returns the empty snapshot before validation has run", () => {
    const root = mkdtempSync(path.join(tmpdir(), "gpwy-validation-"));
    tempRoots.push(root);
    vi.stubEnv("VALIDATION_DB_PATH", path.join(root, "validation.sqlite"));

    const snapshot = readLatestValidationSnapshot();

    expect(snapshot.overallStatus).toBe("not_validated");
    expect(snapshot.sections).toHaveLength(5);
  });

  it("writes and reads the latest sanitized validation snapshot", () => {
    const root = mkdtempSync(path.join(tmpdir(), "gpwy-validation-"));
    tempRoots.push(root);
    vi.stubEnv("VALIDATION_DB_PATH", path.join(root, "validation.sqlite"));
    const snapshot: ValidationSnapshot = {
      overallStatus: "blocked",
      lastRunAt: "2026-06-23T00:00:00.000Z",
      summary:
        "缺少服务端配置。请在服务器环境变量中设置 TUSHARE_TOKEN 后重新验证。",
      sections: [
        {
          key: "token",
          title: "Token 配置",
          status: "blocked",
          summary:
            "缺少服务端配置。请在服务器环境变量中设置 TUSHARE_TOKEN 后重新验证。",
          details: [{ label: "错误类别", value: "missing_config" }],
        },
      ],
    };

    writeValidationSnapshot(snapshot);

    expect(readLatestValidationSnapshot()).toEqual(snapshot);
  });
});
