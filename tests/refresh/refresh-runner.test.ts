// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readRefreshStatus,
  startManualRefresh,
  type ChipDistributionWorkflowRunner,
} from "@/lib/refresh/refresh-runner";
import {
  activateMarketCacheGeneration,
  createMarketCacheGeneration,
  readActiveMarketCacheGeneration,
  readMarketDailyQuotes,
  readMarketGenerationDates,
  readMarketStocks,
  updateMarketGenerationDateItemStatus,
  upsertMarketAdjustmentFactors,
  upsertMarketDailyBasics,
  upsertMarketDailyQuotes,
  upsertMarketGenerationDate,
} from "@/lib/refresh/market-data-store";
import {
  readRefreshOperationSnapshot,
  writeDailyBars,
  writeStockBasics,
} from "@/lib/refresh/refresh-store";
import {
  readLatestScreeningResults,
  readLatestScreeningRun,
  writeScreeningRun,
} from "@/lib/screening/screening-store";
import {
  replaceChipDistribution,
  writeChipDistributionRun,
} from "@/lib/chip/chip-store";
import { readLatestCalculatedChipModelRun } from "@/lib/chip/chip-model-store";
import type { ChipDistributionRunRecord } from "@/lib/chip/chip-types";
import type { DailyBarRecord } from "@/lib/refresh/refresh-types";
import type {
  TushareClientLike,
  TushareDataTable,
  TushareEndpoint,
} from "@/lib/tushare/types";
import { TUSHARE_ENDPOINTS } from "@/lib/tushare/endpoints";

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

function targetTradeDates(count = 60) {
  return Array.from({ length: count }, (_, index) =>
    `2026${String(index + 1).padStart(4, "0")}`,
  );
}

function createMarketOnlyClient({
  tradeDates = targetTradeDates(),
  dailyFailureDate = null,
  factorFailureDate = null,
}: {
  tradeDates?: string[];
  dailyFailureDate?: string | null;
  factorFailureDate?: string | null;
} = {}) {
  const calls = {
    daily: 0,
    factor: 0,
  };
  const client = createMockClient(async (endpoint, params) => {
    if (endpoint.apiName === "stock_basic") {
      const status = String(params.list_status);

      return table(TUSHARE_ENDPOINTS.stockBasic.fields, [
        [
          status === "L" ? "000001.SZ" : `${status}.SZ`,
          status === "L" ? "Listed" : status,
          "Main",
          status,
        ],
      ]);
    }

    if (endpoint.apiName === "trade_cal") {
      return table(
        TUSHARE_ENDPOINTS.tradeCalendar.fields,
        tradeDates.map((tradeDate) => [tradeDate, 1]),
      );
    }

    if (endpoint.apiName === "daily") {
      calls.daily += 1;
      const tradeDate = String(params.trade_date);

      if (tradeDate === dailyFailureDate) {
        throw new Error(
          "token=very-secret-token failed at C:\\server\\private\\daily.ts",
        );
      }

      return table(TUSHARE_ENDPOINTS.daily.fields, [
        ["000001.SZ", tradeDate, 10, 11, 9, 10, 1000, 1000],
      ]);
    }

    if (endpoint.apiName === "adj_factor") {
      calls.factor += 1;
      const tradeDate = String(params.trade_date);

      if (tradeDate === factorFailureDate) {
        throw new Error(
          "headers=very-secret-token failed at C:\\server\\private\\factor.ts",
        );
      }

      return table(TUSHARE_ENDPOINTS.adjFactor.fields, [
        ["000001.SZ", tradeDate, 1],
      ]);
    }

    throw new Error(`Unexpected endpoint ${endpoint.apiName}`);
  });

  return { client, calls };
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

function chipRunFixture(
  overrides: Partial<ChipDistributionRunRecord> = {},
): ChipDistributionRunRecord {
  return {
    id: 1,
    screeningRunId: 1,
    status: "succeeded",
    createdAt: "2026-06-23T00:00:00.000Z",
    totalTargets: 0,
    successCount: 0,
    blockedCount: 0,
    failedCount: 0,
    missingCount: 0,
    skippedCompleteCount: 0,
    ...overrides,
  };
}

function writeChipRunFixture(
  overrides: Partial<ChipDistributionRunRecord> = {},
): ChipDistributionRunRecord {
  const screeningRunId =
    overrides.screeningRunId ?? readLatestScreeningRun()?.id ?? 1;
  const createdAt = overrides.createdAt ?? "2026-06-23T00:00:00.000Z";
  const fixture = chipRunFixture({
    ...overrides,
    screeningRunId,
    createdAt,
  });

  return writeChipDistributionRun({
    screeningRunId: fixture.screeningRunId,
    status: fixture.status,
    totalTargets: fixture.totalTargets,
    successCount: fixture.successCount,
    blockedCount: fixture.blockedCount,
    failedCount: fixture.failedCount,
    missingCount: fixture.missingCount,
    skippedCompleteCount: fixture.skippedCompleteCount,
    statuses: [],
    now: new Date(createdAt),
  });
}

function createEmptyActiveGeneration() {
  const generation = createMarketCacheGeneration({ targetTradeDateCount: 60 });

  for (const tradeDate of targetTradeDates()) {
    upsertMarketGenerationDate(generation.id, {
      tradeDate,
      dailyStatus: "succeeded",
      factorStatus: "succeeded",
    });
  }

  return activateMarketCacheGeneration(generation.id);
}

function chipModelTradeDates() {
  return [
    "20260331",
    "20260401",
    ...Array.from({ length: 58 }, (_, index) =>
      `202605${String(index + 1).padStart(2, "0")}`,
    ),
    "20260628",
    "20260629",
  ];
}

function createChipModelActiveGeneration() {
  const tradeDates = chipModelTradeDates();
  const generation = createMarketCacheGeneration({
    targetTradeDateCount: tradeDates.length,
  });

  for (const tradeDate of tradeDates) {
    upsertMarketGenerationDate(generation.id, {
      tradeDate,
      dailyStatus: "succeeded",
      factorStatus: "succeeded",
    });
  }

  upsertMarketAdjustmentFactors(
    generation.id,
    tradeDates.map((tradeDate) => ({
      tsCode: "002565.SZ",
      tradeDate,
      adjFactor: 1,
    })),
  );
  upsertMarketDailyQuotes(
    generation.id,
    tradeDates.map((tradeDate, index) => ({
      tsCode: "002565.SZ",
      tradeDate,
      open: 10 + index * 0.1,
      high: 11 + index * 0.1,
      low: 9 + index * 0.1,
      close: 10.5 + index * 0.1,
      vol: 1000 + index,
      amount: ((10.5 + index * 0.1) * (1000 + index) * 100) / 1000,
    })),
  );
  upsertMarketDailyBasics(
    generation.id,
    tradeDates.map((tradeDate) => ({
      tsCode: "002565.SZ",
      tradeDate,
      turnoverRate: 5,
      turnoverRateFreeFloat: 4,
    })),
  );

  return activateMarketCacheGeneration(generation.id);
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
    expect(result.job!.status).toBe("succeeded");
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
    expect(second.job!.id).toBe(first.job!.id);
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
    expect(result.job!.status).toBe("failed");
    expect(latestJob?.status).toBe("failed");
    expect(serialized).not.toContain("very-secret-token");
    expect(serialized).not.toContain("C:\\server\\private");
  });

  it("runs cache refresh, downtrend screening, and chip distribution enrichment as one workflow", async () => {
    useTempRefreshStore();
    const chipPeakRunner = vi.fn(async () => writeChipRunFixture());

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

    expect(result.job!.status).toBe("succeeded");
    expect(screeningRun?.sourceRefreshJobId).toBe(result.job!.id);
    expect(readLatestScreeningResults()).toMatchObject([
      {
        tsCode: "000001.SZ",
        name: "平安银行",
        intervalHigh: 90,
      },
    ]);
    expect(chipPeakRunner).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(readRefreshStatus().chipVersion).toContain(
        ":2026-06-23T00:00:00.000Z:succeeded",
      );
    });
  });

  it("marks refresh succeeded while chip distribution enrichment continues in background", async () => {
    useTempRefreshStore();
    let finishChipPeak:
      | ((value: ChipDistributionRunRecord) => void)
      | undefined;
    const chipPeakRunner = vi.fn(
      () =>
        new Promise<ChipDistributionRunRecord>((resolve) => {
          finishChipPeak = resolve;
        }),
    );

    const result = await startManualRefresh({
      waitForCompletion: true,
      chipPeakRunner,
      worker: async () => ({
        totalStocks: 0,
        successCount: 0,
        failedCount: 0,
      }),
    });

    await vi.waitFor(() => {
      expect(chipPeakRunner).toHaveBeenCalledOnce();
    });

    let status = readRefreshStatus();
    expect(result.job!.status).toBe("succeeded");
    expect(status.isRunning).toBe(false);
    expect(status.hasActiveWork).toBe(true);
    expect(status.activeOperation?.kind).toBe("chip_background");
    expect(
      status.stages.find((stage) => stage.stage === "chip")?.status,
    ).toBe("running");

    finishChipPeak?.(chipRunFixture());

    await vi.waitFor(() => {
      status = readRefreshStatus();
      expect(status.hasActiveWork).toBe(false);
    });
  });

  it("rejects a new manual refresh while chip background work owns the operation lock", async () => {
    useTempRefreshStore();
    let finishChipPeak:
      | ((value: ChipDistributionRunRecord) => void)
      | undefined;
    const chipPeakRunner = vi.fn(
      () =>
        new Promise<ChipDistributionRunRecord>((resolve) => {
          finishChipPeak = resolve;
        }),
    );

    const first = await startManualRefresh({
      waitForCompletion: true,
      chipPeakRunner,
      worker: async () => ({
        totalStocks: 0,
        successCount: 0,
        failedCount: 0,
      }),
    });

    await vi.waitFor(() => {
      expect(readRefreshStatus().activeOperation?.kind).toBe("chip_background");
    });

    const second = await startManualRefresh({
      waitForCompletion: true,
      worker: async () => ({
        totalStocks: 1,
        successCount: 1,
        failedCount: 0,
      }),
    });

    expect(first.job!.status).toBe("succeeded");
    expect(second.started).toBe(false);
    expect(second.job?.id).toBe(first.job!.id);
    expect(second.status.activeOperation?.kind).toBe("chip_background");

    finishChipPeak?.(chipRunFixture());
    await vi.waitFor(() => {
      expect(readRefreshStatus().hasActiveWork).toBe(false);
    });
  });

  it("maps chip distribution progress and terminal counts into the chip stage", async () => {
    useTempRefreshStore();
    const chipPeakRunner = vi.fn(
      async ({
        onProgress,
      }: Parameters<ChipDistributionWorkflowRunner>[0]) => {
      onProgress?.({
        totalTargets: 4,
        completedTargets: 2,
        succeeded: 1,
        blocked: 0,
        failed: 0,
        missing: 1,
        skippedComplete: 0,
      });

      return chipRunFixture({
        status: "partial",
        totalTargets: 4,
        successCount: 1,
        blockedCount: 1,
        failedCount: 1,
        missingCount: 1,
      });
      },
    );

    await startManualRefresh({
      waitForCompletion: true,
      chipPeakRunner,
      worker: async () => ({
        totalStocks: 0,
        successCount: 0,
        failedCount: 0,
      }),
    });

    await vi.waitFor(() => {
      const chipStage = readRefreshStatus().stages.find(
        (stage) => stage.stage === "chip",
      );

      expect(chipStage).toMatchObject({
        status: "partial",
        total: 4,
        completed: 4,
        failed: 3,
        errorSummary: "chip_partial:3",
      });
    });
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

    expect(result.job!.status).toBe("failed");
    expect(latestJob?.status).toBe("failed");
    expect(serialized).not.toContain("very-secret-token");
    expect(serialized).not.toContain("C:\\server\\private");
    expect(chipPeakRunner).not.toHaveBeenCalled();
  });

  it("does not fail refresh when chip distribution enrichment throws", async () => {
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

    expect(result.job!.status).toBe("succeeded");
    expect(readLatestScreeningResults()).toHaveLength(1);

    await vi.waitFor(() => {
      const status = readRefreshStatus();
      expect(status.hasActiveWork).toBe(false);
      expect(status.latestOperation?.kind).toBe("chip_background");
      expect(status.latestOperation?.status).toBe("failed");
      expect(status.latestSuccessfulJob?.id).toBe(result.job!.id);
      expect(status.latestJob?.status).toBe("succeeded");
    });
  });

  it("runs calculated chip model enrichment in the default chip background workflow", async () => {
    useTempRefreshStore();
    const generation = createChipModelActiveGeneration();
    replaceChipDistribution({
      tsCode: "002565.SZ",
      tradeDate: "20260331",
      levels: [{ price: 15, percent: 100 }],
    });
    replaceChipDistribution({
      tsCode: "002565.SZ",
      tradeDate: "20260401",
      levels: [{ price: 16, percent: 100 }],
    });

    const result = await startManualRefresh({
      waitForCompletion: true,
      worker: async () => ({
        totalStocks: 1,
        successCount: 1,
        failedCount: 0,
      }),
      screeningRunner: ({ sourceRefreshJobId, now }) =>
        writeScreeningRun({
          sourceRefreshJobId,
          sourceMarketGenerationId: generation.id,
          totalStocks: 1,
          matchedCount: 1,
          skippedCount: 0,
          now,
          results: [
            {
              tsCode: "002565.SZ",
              name: "顺灏股份",
              latestTradeDate: "20260629",
              currentPrice: 10.5,
              intervalHigh: 12,
              intervalHighTradeDate: "20260601",
              intervalHighSource: "swing_high",
              currentHighRatio: 0.8,
              drawdownPct: 0.2,
              ma20: 10,
              ma60: 11,
              ma20Slope: -0.1,
            },
          ],
        }),
    });

    expect(result.job!.status).toBe("succeeded");
    await vi.waitFor(() => {
      expect(readLatestCalculatedChipModelRun()).toMatchObject({
        status: "succeeded",
        totalTargets: 14,
        successCount: 14,
      });
    });
  });

  it("automatically bootstraps normalized market data and immediately screens it", async () => {
    useTempRefreshStore();
    const client = createMockClient(async (endpoint, params) => {
      if (endpoint.apiName === "stock_basic") {
        const status = String(params.list_status);
        return table(TUSHARE_ENDPOINTS.stockBasic.fields, [
          [
            status === "L" ? "000001.SZ" : `${status}.SZ`,
            status === "L" ? "平安银行" : status,
            "主板",
            status,
          ],
        ]);
      }

      if (endpoint.apiName === "trade_cal") {
        return table(
          TUSHARE_ENDPOINTS.tradeCalendar.fields,
          Array.from({ length: 60 }, (_, index) => [
            `2026${String(index + 1).padStart(4, "0")}`,
            1,
          ]),
        );
      }

      if (endpoint.apiName === "daily") {
        const tradeDate = String(params.trade_date);
        const index = Number(tradeDate.slice(-4));
        const close = 101 - index;
        return table(TUSHARE_ENDPOINTS.daily.fields, [
          [
            "000001.SZ",
            tradeDate,
            close + 0.5,
            index === 51 ? 90 : close + 1,
            close - 1,
            close,
            1000 + index,
            close * (1000 + index) * 100 / 1000,
          ],
        ]);
      }

      if (endpoint.apiName === "adj_factor") {
        return table(TUSHARE_ENDPOINTS.adjFactor.fields, [
          ["000001.SZ", params.trade_date, 1],
        ]);
      }

      if (endpoint.apiName === "daily_basic") {
        return table(TUSHARE_ENDPOINTS.dailyBasic.fields, [
          ["000001.SZ", params.trade_date, 2.3, 1.7],
        ]);
      }

      throw new Error(`Unexpected endpoint ${endpoint.apiName}`);
    });

    const result = await startManualRefresh({
      waitForCompletion: true,
      providerWorkerOptions: {
        client,
        now: new Date("2026-06-23T00:00:00.000Z"),
      },
      chipPeakRunner: async () => chipRunFixture(),
    });
    const generation = readActiveMarketCacheGeneration();
    const screeningRun = readLatestScreeningRun();

    expect(result.job!.status).toBe("succeeded");
    expect(result.job!.mode).toBe("bootstrap");
    expect(generation).not.toBeNull();
    expect(readMarketStocks()).toHaveLength(3);
    expect(readMarketDailyQuotes(generation?.id ?? 0)).toHaveLength(60);
    expect(readRefreshStatus().latestCacheStats).toEqual({
      stockCount: 3,
      dailyBarCount: 60,
    });
    expect(screeningRun?.sourceRefreshJobId).toBe(result.job!.id);
    expect(screeningRun?.sourceMarketGenerationId).toBe(generation?.id);
    expect(readLatestScreeningResults()).toHaveLength(1);
  }, 10000);

  it("refreshes stock list and trade calendar but skips daily/factor when the active target window is complete", async () => {
    useTempRefreshStore();
    const generation = createEmptyActiveGeneration();
    const { client, calls } = createMarketOnlyClient();

    const result = await startManualRefresh({
      waitForCompletion: true,
      providerWorkerOptions: {
        client,
        now: new Date("2026-06-23T00:00:00.000Z"),
      },
      chipPeakRunner: async () => chipRunFixture(),
    });

    expect(result.job!.status).toBe("succeeded");
    expect(result.job!.mode).toBe("ordinary");
    expect(calls.daily).toBe(0);
    expect(calls.factor).toBe(0);
    expect(readActiveMarketCacheGeneration()?.id).toBe(generation.id);
    expect(readLatestScreeningRun()?.sourceMarketGenerationId).toBe(
      generation.id,
    );
  });

  it("resumes only failed factor items without re-fetching succeeded daily data", async () => {
    useTempRefreshStore();
    const generation = createEmptyActiveGeneration();
    const failedTradeDate = "20260060";
    const { client, calls } = createMarketOnlyClient();

    updateMarketGenerationDateItemStatus(
      generation.id,
      failedTradeDate,
      "factor",
      "failed",
    );

    const result = await startManualRefresh({
      waitForCompletion: true,
      providerWorkerOptions: {
        client,
        now: new Date("2026-06-23T00:00:00.000Z"),
      },
      chipPeakRunner: async () => chipRunFixture(),
    });
    const updatedManifest = readMarketGenerationDates(generation.id).find(
      (record) => record.tradeDate === failedTradeDate,
    );

    expect(result.job!.status).toBe("succeeded");
    expect(calls.daily).toBe(0);
    expect(calls.factor).toBe(1);
    expect(updatedManifest).toMatchObject({
      dailyStatus: "succeeded",
      factorStatus: "succeeded",
    });
  });

  it("keeps previous screening results when incremental market items partially fail", async () => {
    useTempRefreshStore();
    const generation = createEmptyActiveGeneration();
    const failedTradeDate = "20260060";
    const { client, calls } = createMarketOnlyClient({
      factorFailureDate: failedTradeDate,
    });
    const previousRun = writeScreeningRun({
      sourceRefreshJobId: 1,
      sourceMarketGenerationId: generation.id,
      totalStocks: 0,
      matchedCount: 0,
      skippedCount: 0,
      results: [],
    });
    const chipPeakRunner = vi.fn(async () => chipRunFixture());

    updateMarketGenerationDateItemStatus(
      generation.id,
      failedTradeDate,
      "factor",
      "failed",
    );

    const result = await startManualRefresh({
      waitForCompletion: true,
      providerWorkerOptions: {
        client,
        now: new Date("2026-06-23T00:00:00.000Z"),
      },
      chipPeakRunner,
    });
    const marketStage = readRefreshOperationSnapshot().stages.find(
      (stage) => stage.stage === "market_data",
    );
    const serializedStage = JSON.stringify(marketStage);

    expect(result.job!.status).toBe("failed");
    expect(calls.daily).toBe(0);
    expect(calls.factor).toBe(1);
    expect(readLatestScreeningRun()?.id).toBe(previousRun.id);
    expect(chipPeakRunner).not.toHaveBeenCalled();
    expect(marketStage).toMatchObject({
      status: "failed",
      failed: 1,
    });
    expect(serializedStage).not.toContain("very-secret-token");
    expect(serializedStage).not.toContain("C:\\server\\private");
  });

  it("stores a sanitized missing-config failure for the default worker", async () => {
    useTempRefreshStore();
    vi.stubEnv("TUSHARE_TOKEN", "");

    const result = await startManualRefresh({
      waitForCompletion: true,
    });
    const latestJob = readRefreshStatus().latestJob;

    expect(result.job!.status).toBe("failed");
    expect(latestJob?.errorSummary).toContain("missing_config");
    expect(latestJob?.errorSummary).not.toContain("TUSHARE_TOKEN=");
  });
});
