// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  completeRefreshJob,
  failRefreshJob,
  readActiveRefreshJob,
  readLatestDailyBars,
  readLatestRefreshJob,
  readLatestStockBasics,
  readLatestSuccessfulRefreshJob,
  startRefreshJob,
  writeDailyBars,
  writeStockBasics,
} from "@/lib/refresh/refresh-store";

const tempRoots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function useTempRefreshStore() {
  const root = mkdtempSync(path.join(tmpdir(), "gpwy-refresh-store-"));
  tempRoots.push(root);
  vi.stubEnv("REFRESH_DB_PATH", path.join(root, "refresh.sqlite"));
}

describe("refresh store", () => {
  it("creates one running job and returns it for duplicate starts", () => {
    useTempRefreshStore();
    const now = new Date("2026-06-23T00:00:00.000Z");

    const first = startRefreshJob(now);
    const second = startRefreshJob(new Date("2026-06-23T00:01:00.000Z"));

    expect(first.started).toBe(true);
    expect(first.job.status).toBe("running");
    expect(second.started).toBe(false);
    expect(second.job.id).toBe(first.job.id);
    expect(readActiveRefreshJob()).toEqual(first.job);
    expect(readLatestRefreshJob()).toEqual(first.job);
  });

  it("records success and failure while keeping latest successful cache stable", () => {
    useTempRefreshStore();

    const successful = startRefreshJob(
      new Date("2026-06-23T00:00:00.000Z"),
    ).job;
    writeStockBasics(successful.id, [
      {
        tsCode: "000001.SZ",
        name: "Ping An Bank",
        market: "Main",
        listStatus: "L",
      },
    ]);
    writeDailyBars(successful.id, [
      {
        tsCode: "000001.SZ",
        tradeDate: "20260622",
        open: 10,
        high: 11,
        low: 9,
        close: 10.5,
        vol: 123456,
      },
    ]);
    completeRefreshJob(successful.id, {
      totalStocks: 1,
      successCount: 1,
      failedCount: 0,
      finishedAt: new Date("2026-06-23T00:02:00.000Z"),
    });

    const failed = startRefreshJob(new Date("2026-06-23T00:03:00.000Z")).job;
    writeStockBasics(failed.id, [
      {
        tsCode: "000002.SZ",
        name: "Failed Job Stock",
        market: "Main",
        listStatus: "L",
      },
    ]);
    failRefreshJob(failed.id, {
      errorSummary: "network_or_service",
      totalStocks: 1,
      successCount: 0,
      failedCount: 1,
      finishedAt: new Date("2026-06-23T00:04:00.000Z"),
    });

    expect(readActiveRefreshJob()).toBeNull();
    expect(readLatestRefreshJob()?.status).toBe("failed");
    expect(readLatestSuccessfulRefreshJob()?.id).toBe(successful.id);
    expect(readLatestStockBasics()).toEqual([
      {
        tsCode: "000001.SZ",
        name: "Ping An Bank",
        market: "Main",
        listStatus: "L",
      },
    ]);
    expect(readLatestDailyBars()).toEqual([
      {
        tsCode: "000001.SZ",
        tradeDate: "20260622",
        open: 10,
        high: 11,
        low: 9,
        close: 10.5,
        vol: 123456,
      },
    ]);
  });
});
