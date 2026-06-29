// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  completeRefreshJob,
  completeRefreshOperation,
  failRefreshJob,
  failRefreshOperation,
  readActiveRefreshJob,
  readLatestDailyBars,
  readLatestRefreshJob,
  readLatestStockBasics,
  readLatestSuccessfulRefreshJob,
  readRefreshOperationSnapshot,
  startRefreshJob,
  startRefreshOperation,
  upsertRefreshStage,
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
  it("creates one running operation lock across refresh, chip, and rebuild work", () => {
    useTempRefreshStore();

    const first = startRefreshOperation("manual_refresh", {
      now: new Date("2026-06-29T00:00:00.000Z"),
    });
    const second = startRefreshOperation("chip_background", {
      now: new Date("2026-06-29T00:01:00.000Z"),
    });

    expect(first.started).toBe(true);
    expect(first.operation.kind).toBe("manual_refresh");
    expect(first.operation.status).toBe("running");
    expect(second.started).toBe(false);
    expect(second.operation.id).toBe(first.operation.id);

    const snapshot = readRefreshOperationSnapshot(
      new Date("2026-06-29T00:02:00.000Z"),
    );

    expect(snapshot.hasActiveWork).toBe(true);
    expect(snapshot.activeOperation?.kind).toBe("manual_refresh");
    expect(snapshot.stages).toEqual([
      expect.objectContaining({
        stage: "stock_list",
        label: "股票列表",
        status: "pending",
      }),
      expect.objectContaining({
        stage: "market_data",
        label: "行情/复权",
        status: "pending",
      }),
      expect.objectContaining({
        stage: "screening",
        label: "筛选",
        status: "pending",
      }),
      expect.objectContaining({
        stage: "chip",
        label: "筹码处理",
        status: "pending",
      }),
    ]);

    completeRefreshOperation(first.operation.id, {
      finishedAt: new Date("2026-06-29T00:03:00.000Z"),
    });

    expect(readRefreshOperationSnapshot().hasActiveWork).toBe(false);
    expect(
      startRefreshOperation("full_rebuild", {
        now: new Date("2026-06-29T00:04:00.000Z"),
      }).started,
    ).toBe(true);
  });

  it("persists stage progress in UI order with deterministic durations", () => {
    useTempRefreshStore();
    const operation = startRefreshOperation("manual_refresh", {
      now: new Date("2026-06-29T00:00:00.000Z"),
    }).operation;

    upsertRefreshStage(operation.id, {
      stage: "market_data",
      status: "running",
      total: 120,
      completed: 80,
      failed: 2,
      retryCount: 1,
      startedAt: new Date("2026-06-29T00:00:30.000Z"),
      errorSummary: "daily failed: 2",
    });
    upsertRefreshStage(operation.id, {
      stage: "screening",
      status: "succeeded",
      total: 100,
      completed: 100,
      failed: 0,
      startedAt: new Date("2026-06-29T00:01:00.000Z"),
      finishedAt: new Date("2026-06-29T00:01:45.000Z"),
    });
    upsertRefreshStage(operation.id, {
      stage: "chip",
      status: "skipped",
      errorSummary: "no candidates",
    });

    const snapshot = readRefreshOperationSnapshot(
      new Date("2026-06-29T00:02:00.000Z"),
    );
    const marketStage = snapshot.stages.find(
      (stage) => stage.stage === "market_data",
    );
    const screeningStage = snapshot.stages.find(
      (stage) => stage.stage === "screening",
    );

    expect(snapshot.stages.map((stage) => stage.stage)).toEqual([
      "stock_list",
      "market_data",
      "screening",
      "chip",
    ]);
    expect(marketStage).toMatchObject({
      label: "行情/复权",
      status: "running",
      total: 120,
      completed: 80,
      failed: 2,
      retryCount: 1,
      durationMs: 90_000,
      errorSummary: "daily failed: 2",
    });
    expect(screeningStage).toMatchObject({
      status: "succeeded",
      durationMs: 45_000,
    });

    failRefreshOperation(operation.id, {
      errorSummary: "market_data_failed",
      finishedAt: new Date("2026-06-29T00:03:00.000Z"),
    });

    expect(readRefreshOperationSnapshot().latestOperation?.status).toBe(
      "failed",
    );
  });

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
