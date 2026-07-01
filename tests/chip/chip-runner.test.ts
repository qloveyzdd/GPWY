// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolveChipDistributionTargetsForLatestScreening,
  runChipDistributionIntegrationFromLatestScreening,
  type ChipDistributionProgress,
} from "@/lib/chip/chip-runner";
import {
  planChipDistributionWork,
  readChipDistributionForDate,
  readChipDistributionStatusesForRun,
  replaceChipDistribution,
  writeChipDistributionRun,
} from "@/lib/chip/chip-store";
import {
  activateMarketCacheGeneration,
  createMarketCacheGeneration,
  upsertMarketAdjustmentFactors,
  upsertMarketDailyQuotes,
  upsertMarketGenerationDate,
} from "@/lib/refresh/market-data-store";
import {
  writeScreeningRun,
} from "@/lib/screening/screening-store";
import { TushareApiError } from "@/lib/tushare/client";
import { TUSHARE_ENDPOINTS } from "@/lib/tushare/endpoints";
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

function useTempStore() {
  const root = mkdtempSync(path.join(tmpdir(), "gpwy-chip-runner-"));
  tempRoots.push(root);
  vi.stubEnv("REFRESH_DB_PATH", path.join(root, "refresh.sqlite"));
}

function table(items: unknown[][]): TushareDataTable {
  return {
    fields: ["ts_code", "trade_date", "price", "percent"],
    items,
  };
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

function createReadableGeneration() {
  const generation = createMarketCacheGeneration({ targetTradeDateCount: 60 });

  for (let index = 1; index <= 60; index += 1) {
    upsertMarketGenerationDate(generation.id, {
      tradeDate: `202606${String(index).padStart(2, "0")}`,
      dailyStatus: "succeeded",
      factorStatus: "succeeded",
    });
  }

  return activateMarketCacheGeneration(generation.id);
}

function writeMarketBars(
  generationId: number,
  tsCode: string,
  tradeDates: string[],
) {
  upsertMarketDailyQuotes(
    generationId,
    tradeDates.map((tradeDate, index) => ({
      tsCode,
      tradeDate,
      open: 10 + index,
      high: 11 + index,
      low: 9 + index,
      close: 10.5 + index,
      vol: 1000 + index,
    })),
  );
  upsertMarketAdjustmentFactors(
    generationId,
    tradeDates.map((tradeDate) => ({
      tsCode,
      tradeDate,
      adjFactor: 1,
    })),
  );
}

function writeScreeningFixture({
  tsCode = "000001.SZ",
  latestTradeDate = "20260623",
  generationId,
}: {
  tsCode?: string;
  latestTradeDate?: string;
  generationId: number;
}) {
  return writeScreeningRun({
    sourceRefreshJobId: 7,
    sourceMarketGenerationId: generationId,
    totalStocks: 1,
    matchedCount: 1,
    skippedCount: 0,
    now: new Date("2026-06-23T00:00:00.000Z"),
    results: [
      {
        tsCode,
        name: "股票1",
        latestTradeDate,
        currentPrice: 8.5,
        intervalHigh: 10,
        intervalHighTradeDate: "20260601",
        intervalHighSource: "swing_high",
        currentHighRatio: 0.8,
        drawdownPct: 0.15,
        ma20: 9,
        ma60: 11,
        ma20Slope: -0.1,
      },
    ],
  });
}

function statusSummary(runId: number) {
  return readChipDistributionStatusesForRun(runId).map((record) => ({
    tsCode: record.tsCode,
    targetKind: record.targetKind,
    tradeDate: record.tradeDate,
    status: record.status,
    errorCategory: record.errorCategory,
  }));
}

describe("chip distribution runner", () => {
  it("resolves latest and previous dates from same-source bars and requests one cyq_chips range", async () => {
    useTempStore();
    const generation = createReadableGeneration();
    writeMarketBars(generation.id, "000001.SZ", ["20260622", "20260623"]);
    const screeningRun = writeScreeningFixture({ generationId: generation.id });
    const progressEvents: ChipDistributionProgress[] = [];
    const client = createMockClient(async () =>
      table([
        ["000001.SZ", "20260621", 8.8, 9],
        ["000001.SZ", "20260622", 9.8, 2],
        ["000001.SZ", "20260623", 10.2, 6],
      ]),
    );

    const run = await runChipDistributionIntegrationFromLatestScreening({
      client,
      now: new Date("2026-06-23T00:01:00.000Z"),
      onProgress: (progress) => progressEvents.push(progress),
    });

    expect(client.query).toHaveBeenCalledWith(
      TUSHARE_ENDPOINTS.chipChips,
      {
        ts_code: "000001.SZ",
        start_date: "20260622",
        end_date: "20260623",
      },
      { priority: "chip" },
    );
    expect(run).toMatchObject({
      screeningRunId: screeningRun.id,
      status: "succeeded",
      totalTargets: 2,
      successCount: 2,
      blockedCount: 0,
      failedCount: 0,
      missingCount: 0,
    });
    expect(statusSummary(run.id)).toEqual([
      {
        tsCode: "000001.SZ",
        targetKind: "latest",
        tradeDate: "20260623",
        status: "succeeded",
        errorCategory: null,
      },
      {
        tsCode: "000001.SZ",
        targetKind: "previous",
        tradeDate: "20260622",
        status: "succeeded",
        errorCategory: null,
      },
    ]);
    expect(readChipDistributionForDate("000001.SZ", "20260622")).toHaveLength(1);
    expect(readChipDistributionForDate("000001.SZ", "20260623")).toHaveLength(1);
    expect(readChipDistributionForDate("000001.SZ", "20260621")).toEqual([]);
    expect(progressEvents.at(-1)).toMatchObject({
      totalTargets: 2,
      completedTargets: 2,
      succeeded: 2,
    });
  });

  it("marks previous as missing when only one same-source bar exists while latest remains requestable", async () => {
    useTempStore();
    const generation = createReadableGeneration();
    writeMarketBars(generation.id, "000001.SZ", ["20260623"]);
    writeScreeningFixture({ generationId: generation.id });
    const client = createMockClient(async () =>
      table([["000001.SZ", "20260623", 10.2, 6]]),
    );

    const run = await runChipDistributionIntegrationFromLatestScreening({
      client,
    });

    expect(client.query).toHaveBeenCalledWith(
      TUSHARE_ENDPOINTS.chipChips,
      {
        ts_code: "000001.SZ",
        start_date: "20260623",
        end_date: "20260623",
      },
      { priority: "chip" },
    );
    expect(run).toMatchObject({
      status: "partial",
      totalTargets: 2,
      successCount: 1,
      missingCount: 1,
    });
    expect(statusSummary(run.id)).toEqual([
      {
        tsCode: "000001.SZ",
        targetKind: "latest",
        tradeDate: "20260623",
        status: "succeeded",
        errorCategory: null,
      },
      {
        tsCode: "000001.SZ",
        targetKind: "previous",
        tradeDate: null,
        status: "missing",
        errorCategory: null,
      },
    ]);
  });

  it("reuses complete latest cache and retries only failed previous target", async () => {
    useTempStore();
    const generation = createReadableGeneration();
    writeMarketBars(generation.id, "000001.SZ", ["20260622", "20260623"]);
    writeScreeningFixture({ generationId: generation.id });
    replaceChipDistribution({
      tsCode: "000001.SZ",
      tradeDate: "20260623",
      levels: [{ price: 10.2, percent: 6 }],
    });
    writeChipDistributionRun({
      screeningRunId: 1,
      status: "partial",
      totalTargets: 2,
      successCount: 1,
      blockedCount: 0,
      failedCount: 1,
      missingCount: 0,
      statuses: [
        {
          screeningRunId: 1,
          tsCode: "000001.SZ",
          targetKind: "latest",
          tradeDate: "20260623",
          status: "succeeded",
          source: "cyq_chips_highest_percent",
          errorCategory: null,
          errorSummary: null,
        },
        {
          screeningRunId: 1,
          tsCode: "000001.SZ",
          targetKind: "previous",
          tradeDate: "20260622",
          status: "failed",
          source: null,
          errorCategory: "network_or_service",
          errorSummary: "temporary failure",
        },
      ],
    });
    const client = createMockClient(async () =>
      table([["000001.SZ", "20260622", 9.8, 2]]),
    );

    const run = await runChipDistributionIntegrationFromLatestScreening({
      client,
    });

    expect(client.query).toHaveBeenCalledWith(
      TUSHARE_ENDPOINTS.chipChips,
      {
        ts_code: "000001.SZ",
        start_date: "20260622",
        end_date: "20260622",
      },
      { priority: "chip" },
    );
    expect(run).toMatchObject({
      status: "succeeded",
      successCount: 2,
      skippedCompleteCount: 1,
    });
  });

  it("retries empty-data blocked targets on the next chip refresh", async () => {
    useTempStore();
    const generation = createReadableGeneration();
    writeMarketBars(generation.id, "000001.SZ", ["20260622", "20260623"]);
    writeScreeningFixture({ generationId: generation.id });
    replaceChipDistribution({
      tsCode: "000001.SZ",
      tradeDate: "20260622",
      levels: [{ price: 9.8, percent: 2 }],
    });
    writeChipDistributionRun({
      screeningRunId: 1,
      status: "partial",
      totalTargets: 2,
      successCount: 1,
      blockedCount: 1,
      failedCount: 0,
      missingCount: 0,
      statuses: [
        {
          screeningRunId: 1,
          tsCode: "000001.SZ",
          targetKind: "latest",
          tradeDate: "20260623",
          status: "blocked",
          source: null,
          errorCategory: "empty_data",
          errorSummary: "cyq_chips returned no distribution rows for target trade date",
        },
        {
          screeningRunId: 1,
          tsCode: "000001.SZ",
          targetKind: "previous",
          tradeDate: "20260622",
          status: "succeeded",
          source: "cyq_chips_highest_percent",
          errorCategory: null,
          errorSummary: null,
        },
      ],
    });
    const client = createMockClient(async () =>
      table([["000001.SZ", "20260623", 10.2, 6]]),
    );

    const run = await runChipDistributionIntegrationFromLatestScreening({
      client,
    });

    expect(client.query).toHaveBeenCalledWith(
      TUSHARE_ENDPOINTS.chipChips,
      {
        ts_code: "000001.SZ",
        start_date: "20260623",
        end_date: "20260623",
      },
      { priority: "chip" },
    );
    expect(run).toMatchObject({
      status: "succeeded",
      successCount: 2,
      skippedCompleteCount: 1,
    });
    expect(readChipDistributionForDate("000001.SZ", "20260623")).toHaveLength(1);
  });

  it("falls back to the latest cached official distribution when target date returns empty data", async () => {
    useTempStore();
    const generation = createReadableGeneration();
    writeMarketBars(generation.id, "000001.SZ", [
      "20260629",
      "20260630",
      "20260701",
    ]);
    writeScreeningFixture({
      generationId: generation.id,
      latestTradeDate: "20260701",
    });
    replaceChipDistribution({
      tsCode: "000001.SZ",
      tradeDate: "20260630",
      levels: [{ price: 10.2, percent: 6 }],
    });
    writeChipDistributionRun({
      screeningRunId: 1,
      status: "succeeded",
      totalTargets: 1,
      successCount: 1,
      blockedCount: 0,
      failedCount: 0,
      missingCount: 0,
      statuses: [
        {
          screeningRunId: 1,
          tsCode: "000001.SZ",
          targetKind: "previous",
          tradeDate: "20260630",
          status: "succeeded",
          source: "cyq_chips_highest_percent",
          errorCategory: null,
          errorSummary: null,
        },
      ],
    });
    const client = createMockClient(async () => table([]));

    const run = await runChipDistributionIntegrationFromLatestScreening({
      client,
    });

    expect(client.query).toHaveBeenCalledWith(
      TUSHARE_ENDPOINTS.chipChips,
      {
        ts_code: "000001.SZ",
        start_date: "20260701",
        end_date: "20260701",
      },
      { priority: "chip" },
    );
    expect(run).toMatchObject({
      status: "succeeded",
      successCount: 2,
      blockedCount: 0,
      skippedCompleteCount: 1,
    });
    expect(statusSummary(run.id)).toEqual([
      {
        tsCode: "000001.SZ",
        targetKind: "latest",
        tradeDate: "20260630",
        status: "succeeded",
        errorCategory: null,
      },
      {
        tsCode: "000001.SZ",
        targetKind: "previous",
        tradeDate: "20260630",
        status: "succeeded",
        errorCategory: null,
      },
    ]);
  });

  it("does not call provider for blocked latest and records previous missing", async () => {
    useTempStore();
    const generation = createReadableGeneration();
    writeMarketBars(generation.id, "000001.SZ", ["20260623"]);
    writeScreeningFixture({ generationId: generation.id });
    writeChipDistributionRun({
      screeningRunId: 1,
      status: "blocked",
      totalTargets: 1,
      successCount: 0,
      blockedCount: 1,
      failedCount: 0,
      missingCount: 0,
      statuses: [
        {
          screeningRunId: 1,
          tsCode: "000001.SZ",
          targetKind: "latest",
          tradeDate: "20260623",
          status: "blocked",
          source: null,
          errorCategory: "permission_denied",
          errorSummary: "permission denied",
        },
      ],
    });
    const client = createMockClient(async () => table([]));

    const run = await runChipDistributionIntegrationFromLatestScreening({
      client,
    });

    expect(client.query).not.toHaveBeenCalled();
    expect(run).toMatchObject({
      status: "blocked",
      blockedCount: 1,
      missingCount: 1,
    });
  });

  it("handles partial provider returns independently and ignores non-target dates", async () => {
    useTempStore();
    const generation = createReadableGeneration();
    writeMarketBars(generation.id, "000001.SZ", ["20260622", "20260623"]);
    writeScreeningFixture({ generationId: generation.id });
    const client = createMockClient(async () =>
      table([
        ["000001.SZ", "20260621", 8.8, 9],
        ["000001.SZ", "20260623", 10.2, 6],
      ]),
    );

    const run = await runChipDistributionIntegrationFromLatestScreening({
      client,
    });

    expect(statusSummary(run.id)).toEqual([
      {
        tsCode: "000001.SZ",
        targetKind: "latest",
        tradeDate: "20260623",
        status: "succeeded",
        errorCategory: null,
      },
      {
        tsCode: "000001.SZ",
        targetKind: "previous",
        tradeDate: "20260622",
        status: "blocked",
        errorCategory: "empty_data",
      },
    ]);
    expect(readChipDistributionForDate("000001.SZ", "20260623")).toHaveLength(1);
    expect(readChipDistributionForDate("000001.SZ", "20260622")).toEqual([]);
    expect(readChipDistributionForDate("000001.SZ", "20260621")).toEqual([]);
  });

  it("marks temporary provider failures as failed so the next planner retries them", async () => {
    useTempStore();
    const generation = createReadableGeneration();
    writeMarketBars(generation.id, "000001.SZ", ["20260622", "20260623"]);
    writeScreeningFixture({ generationId: generation.id });
    const client = createMockClient(async () => {
      throw new TypeError("fetch failed");
    });

    const run = await runChipDistributionIntegrationFromLatestScreening({
      client,
    });
    const retryPlan = planChipDistributionWork(
      resolveChipDistributionTargetsForLatestScreening(),
    );

    expect(run).toMatchObject({
      status: "failed",
      failedCount: 2,
      blockedCount: 0,
    });
    expect(statusSummary(run.id).map((record) => record.status)).toEqual([
      "failed",
      "failed",
    ]);
    expect(retryPlan.items).toHaveLength(2);
    expect(retryPlan.failedRetryCount).toBe(2);
  });

  it("marks permission failures as blocked so the next planner does not retry them", async () => {
    useTempStore();
    const generation = createReadableGeneration();
    writeMarketBars(generation.id, "000001.SZ", ["20260622", "20260623"]);
    writeScreeningFixture({ generationId: generation.id });
    const client = createMockClient(async () => {
      throw new TushareApiError("cyq_chips", -2002, "没有访问该接口的权限");
    });

    const run = await runChipDistributionIntegrationFromLatestScreening({
      client,
    });
    const retryPlan = planChipDistributionWork(
      resolveChipDistributionTargetsForLatestScreening(),
    );

    expect(run).toMatchObject({
      status: "blocked",
      blockedCount: 2,
      failedCount: 0,
    });
    expect(statusSummary(run.id).map((record) => record.status)).toEqual([
      "blocked",
      "blocked",
    ]);
    expect(retryPlan.items).toEqual([]);
    expect(retryPlan.blockedCount).toBe(2);
  });

  it("classifies missing token as blocked without leaking an exception stack", async () => {
    useTempStore();
    const generation = createReadableGeneration();
    writeMarketBars(generation.id, "000001.SZ", ["20260622", "20260623"]);
    writeScreeningFixture({ generationId: generation.id });

    const run = await runChipDistributionIntegrationFromLatestScreening();
    const summaries = readChipDistributionStatusesForRun(run.id).map(
      (record) => record.errorSummary ?? "",
    );

    expect(run).toMatchObject({
      status: "blocked",
      blockedCount: 2,
    });
    expect(statusSummary(run.id).map((record) => record.errorCategory)).toEqual([
      "missing_config",
      "missing_config",
    ]);
    expect(summaries.join("\n")).not.toContain("Error:");
  });
});
