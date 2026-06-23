// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createProviderRefreshWorker,
  readRefreshStatus,
  startManualRefresh,
} from "@/lib/refresh/refresh-runner";
import {
  readLatestDailyBars,
  readLatestStockBasics,
  writeDailyBars,
  writeStockBasics,
} from "@/lib/refresh/refresh-store";
import {
  readLatestScreeningResults,
  readLatestScreeningRun,
} from "@/lib/screening/screening-store";
import type { ChipPeakRunRecord } from "@/lib/chip/chip-types";
import type { DailyBarRecord } from "@/lib/refresh/refresh-types";
import type {
  TushareClientLike,
  TushareDataTable,
  TushareEndpoint,
} from "@/lib/tushare/types";

const tempRoots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function useTempRefreshStore() {
  const root = mkdtempSync(path.join(tmpdir(), "gpwy-refresh-runner-"));
  tempRoots.push(root);
  vi.stubEnv("REFRESH_DB_PATH", path.join(root, "refresh.sqlite"));
}

function table(fields: string[], items: unknown[][]): TushareDataTable {
  return { fields, items };
}

function createMockClient(
  handler: (
    endpoint: TushareEndpoint,
    params: Record<string, unknown>,
  ) => Promise<TushareDataTable>,
): TushareClientLike {
  return {
    query: vi.fn((endpoint, params = {}) => handler(endpoint, params)),
  };
}

function makeBars(tsCode: string, count: number): DailyBarRecord[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 - index;
    const high = index === 50 ? 90 : close + 1;

    return {
      tsCode,
      tradeDate: `2026${String(index + 1).padStart(4, "0")}`,
      open: close + 0.5,
      high,
      low: close - 1,
      close,
      vol: 1000 + index,
    };
  });
}

function chipRunFixture(): ChipPeakRunRecord {
  return {
    id: 1,
    screeningRunId: 1,
    status: "succeeded",
    createdAt: "2026-06-23T00:00:00.000Z",
    totalCandidates: 0,
    successCount: 0,
    blockedCount: 0,
    failedCount: 0,
  };
}

describe("refresh runner", () => {
  it("runs an injected worker and records a succeeded job", async () => {
    useTempRefreshStore();

    const result = await startManualRefresh({
      now: new Date("2026-06-23T00:00:00.000Z"),
      waitForCompletion: true,
      worker: async () => ({
        totalStocks: 2,
        successCount: 2,
        failedCount: 0,
      }),
    });
    const status = readRefreshStatus();

    expect(result.started).toBe(true);
    expect(result.job.status).toBe("succeeded");
    expect(status.activeJob).toBeNull();
    expect(status.latestJob?.status).toBe("succeeded");
    expect(status.latestSuccessfulJob?.successCount).toBe(2);
    expect(status.lastSuccessfulFinishedAt).toBeTruthy();
  });

  it("returns the active job without starting a duplicate worker", async () => {
    useTempRefreshStore();
    let finishWorker:
      | ((value: { totalStocks: number; successCount: number; failedCount: number }) => void)
      | undefined;
    const worker = vi.fn(
      () =>
        new Promise<{
          totalStocks: number;
          successCount: number;
          failedCount: number;
        }>((resolve) => {
          finishWorker = resolve;
        }),
    );

    const first = await startManualRefresh({
      now: new Date("2026-06-23T00:00:00.000Z"),
      worker,
    });
    const second = await startManualRefresh({
      now: new Date("2026-06-23T00:01:00.000Z"),
      worker,
    });

    expect(first.started).toBe(true);
    expect(second.started).toBe(false);
    expect(second.job.id).toBe(first.job.id);
    expect(worker).toHaveBeenCalledTimes(1);

    finishWorker?.({ totalStocks: 1, successCount: 1, failedCount: 0 });
    await vi.waitFor(() => {
      expect(readRefreshStatus().activeJob).toBeNull();
    });
  });

  it("stores sanitized failures from the worker", async () => {
    useTempRefreshStore();

    const result = await startManualRefresh({
      waitForCompletion: true,
      worker: async () => {
        throw new Error(
          "token=very-secret-token failed at C:\\server\\private\\worker.ts",
        );
      },
    });
    const latestJob = readRefreshStatus().latestJob;
    const serialized = JSON.stringify(latestJob);

    expect(result.started).toBe(true);
    expect(result.job.status).toBe("failed");
    expect(latestJob?.status).toBe("failed");
    expect(serialized).not.toContain("very-secret-token");
    expect(serialized).not.toContain("C:\\server\\private");
  });

  it("runs cache refresh, downtrend screening, and chip peak enrichment as one workflow", async () => {
    useTempRefreshStore();
    const chipPeakRunner = vi.fn(async () => chipRunFixture());

    const result = await startManualRefresh({
      waitForCompletion: true,
      now: new Date("2026-06-23T00:00:00.000Z"),
      chipPeakRunner,
      worker: async (job) => {
        writeStockBasics(job.id, [
          {
            tsCode: "000001.SZ",
            name: "平安银行",
            market: "主板",
            listStatus: "L",
          },
        ]);
        writeDailyBars(job.id, makeBars("000001.SZ", 60));

        return {
          totalStocks: 1,
          successCount: 1,
          failedCount: 0,
        };
      },
    });
    const screeningRun = readLatestScreeningRun();

    expect(result.job.status).toBe("succeeded");
    expect(screeningRun?.sourceRefreshJobId).toBe(result.job.id);
    expect(readLatestScreeningResults()).toMatchObject([
      {
        tsCode: "000001.SZ",
        name: "平安银行",
        intervalHigh: 90,
      },
    ]);
    expect(chipPeakRunner).toHaveBeenCalledOnce();
  });

  it("keeps the refresh job running until chip peak enrichment finishes", async () => {
    useTempRefreshStore();
    let finishChipPeak:
      | ((value: ChipPeakRunRecord) => void)
      | undefined;
    const chipPeakRunner = vi.fn(
      () =>
        new Promise<ChipPeakRunRecord>((resolve) => {
          finishChipPeak = resolve;
        }),
    );

    const refreshPromise = startManualRefresh({
      waitForCompletion: true,
      chipPeakRunner,
      worker: async () => ({
        totalStocks: 0,
        successCount: 0,
        failedCount: 0,
      }),
    });

    await vi.waitFor(() => {
      expect(readRefreshStatus().isRunning).toBe(true);
    });

    finishChipPeak?.(chipRunFixture());
    const result = await refreshPromise;

    expect(result.job.status).toBe("succeeded");
    expect(readRefreshStatus().isRunning).toBe(false);
  });

  it("marks screening failures as refresh workflow failures", async () => {
    useTempRefreshStore();
    const chipPeakRunner = vi.fn(async () => chipRunFixture());

    const result = await startManualRefresh({
      waitForCompletion: true,
      screeningRunner: () => {
        throw new Error(
          "token=very-secret-token screening failed at C:\\server\\private\\screen.ts",
        );
      },
      chipPeakRunner,
      worker: async () => ({
        totalStocks: 1,
        successCount: 1,
        failedCount: 0,
      }),
    });
    const latestJob = readRefreshStatus().latestJob;
    const serialized = JSON.stringify(latestJob);

    expect(result.job.status).toBe("failed");
    expect(latestJob?.status).toBe("failed");
    expect(serialized).not.toContain("very-secret-token");
    expect(serialized).not.toContain("C:\\server\\private");
    expect(chipPeakRunner).not.toHaveBeenCalled();
  });

  it("does not fail refresh when chip peak enrichment throws", async () => {
    useTempRefreshStore();

    const result = await startManualRefresh({
      waitForCompletion: true,
      chipPeakRunner: async () => {
        throw new Error("cyq_chips temporarily unavailable");
      },
      worker: async (job) => {
        writeStockBasics(job.id, [
          {
            tsCode: "000001.SZ",
            name: "平安银行",
            market: "主板",
            listStatus: "L",
          },
        ]);
        writeDailyBars(job.id, makeBars("000001.SZ", 60));

        return {
          totalStocks: 1,
          successCount: 1,
          failedCount: 0,
        };
      },
    });

    expect(result.job.status).toBe("succeeded");
    expect(readLatestScreeningResults()).toHaveLength(1);
  });

  it("writes provider-fetched stock basics and daily bars", async () => {
    useTempRefreshStore();
    const client = createMockClient(async (endpoint) => {
      if (endpoint.apiName === "stock_basic") {
        return table(["ts_code", "name", "market", "list_status"], [
          ["000001.SZ", "平安银行", "主板", "L"],
        ]);
      }

      if (endpoint.apiName === "daily") {
        return table(
          ["ts_code", "trade_date", "open", "high", "low", "close", "vol"],
          [["000001.SZ", "20260623", 10, 11, 9, 10.5, 1200]],
        );
      }

      throw new Error(`Unexpected endpoint ${endpoint.apiName}`);
    });

    const result = await startManualRefresh({
      waitForCompletion: true,
      worker: createProviderRefreshWorker({
        client,
        now: new Date("2026-06-23T00:00:00.000Z"),
        targetTradingDates: 1,
        maxLookbackDays: 1,
      }),
    });
    const status = readRefreshStatus();

    expect(result.job.status).toBe("succeeded");
    expect(status.latestSuccessfulJob?.successCount).toBe(1);
    expect(status.latestCacheStats).toEqual({
      stockCount: 1,
      dailyBarCount: 1,
    });
    expect(readLatestStockBasics()).toEqual([
      {
        tsCode: "000001.SZ",
        name: "平安银行",
        market: "主板",
        listStatus: "L",
      },
    ]);
    expect(readLatestDailyBars()).toEqual([
      {
        tsCode: "000001.SZ",
        tradeDate: "20260623",
        open: 10,
        high: 11,
        low: 9,
        close: 10.5,
        vol: 1200,
      },
    ]);
  });

  it("stores a sanitized missing-config failure for the default worker", async () => {
    useTempRefreshStore();
    vi.stubEnv("TUSHARE_TOKEN", "");

    const result = await startManualRefresh({
      waitForCompletion: true,
    });
    const latestJob = readRefreshStatus().latestJob;

    expect(result.job.status).toBe("failed");
    expect(latestJob?.errorSummary).toContain("missing_config");
    expect(latestJob?.errorSummary).not.toContain("TUSHARE_TOKEN=");
  });
});
