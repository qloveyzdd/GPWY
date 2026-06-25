import {
  readActiveMarketCacheGeneration,
} from "@/lib/refresh/market-data-store";
import {
  readAdjustedMarketData,
} from "@/lib/refresh/market-data-reader";
import {
  readDailyBarsForRefreshJob,
  readLatestSuccessfulRefreshJob,
  readRefreshJobById,
  readStockBasicsForRefreshJob,
} from "@/lib/refresh/refresh-store";
import { evaluateDowntrendStock } from "@/lib/screening/downtrend-screen";
import { writeScreeningRun } from "@/lib/screening/screening-store";
import type {
  ScreeningDailyBar,
  ScreeningResultRecord,
  ScreeningRunRecord,
  ScreeningSkipRecord,
} from "@/lib/screening/screening-types";

export type RunDowntrendScreeningOptions = {
  now?: Date;
  sourceRefreshJobId?: number;
};

function groupBarsByTsCode(bars: ScreeningDailyBar[]) {
  const grouped = new Map<string, ScreeningDailyBar[]>();

  for (const bar of bars) {
    const existing = grouped.get(bar.tsCode);

    if (existing) {
      existing.push(bar);
    } else {
      grouped.set(bar.tsCode, [bar]);
    }
  }

  return grouped;
}

export function runDowntrendScreeningFromCache({
  now = new Date(),
  sourceRefreshJobId,
}: RunDowntrendScreeningOptions = {}): ScreeningRunRecord {
  const activeGeneration = readActiveMarketCacheGeneration();
  let resolvedRefreshJobId: number;
  let sourceMarketGenerationId: number | null = null;
  let stockInputs: Array<{
    tsCode: string;
    name: string;
    bars: ScreeningDailyBar[];
  }>;
  let totalStocks: number;
  const skips: Omit<ScreeningSkipRecord, "screeningRunId">[] = [];

  if (activeGeneration) {
    const refreshJob =
      (sourceRefreshJobId ? readRefreshJobById(sourceRefreshJobId) : null) ??
      readLatestSuccessfulRefreshJob();

    if (!refreshJob) {
      throw new Error("no_refresh_job_provenance");
    }

    const marketData = readAdjustedMarketData({
      generationId: activeGeneration.id,
    });
    resolvedRefreshJobId = refreshJob.id;
    sourceMarketGenerationId = marketData.generationId;
    stockInputs = marketData.stocks.map(({ stock, bars }) => ({
      tsCode: stock.tsCode,
      name: stock.name,
      bars,
    }));
    skips.push(
      ...marketData.skips.map((skip) => ({
        tsCode: skip.tsCode,
        reason: skip.reason,
        availableBars: skip.availableBars,
      })),
    );
    totalStocks = marketData.stocks.length + marketData.skips.length;
  } else {
    const sourceRefreshJob = sourceRefreshJobId
      ? readRefreshJobById(sourceRefreshJobId)
      : readLatestSuccessfulRefreshJob();

    if (!sourceRefreshJob) {
      throw new Error("no_successful_refresh_cache");
    }

    const stockBasics = readStockBasicsForRefreshJob(sourceRefreshJob.id);
    const barsByTsCode = groupBarsByTsCode(
      readDailyBarsForRefreshJob(sourceRefreshJob.id),
    );
    resolvedRefreshJobId = sourceRefreshJob.id;
    stockInputs = stockBasics.map((stock) => ({
      tsCode: stock.tsCode,
      name: stock.name,
      bars: barsByTsCode.get(stock.tsCode) ?? [],
    }));
    totalStocks = stockInputs.length;
  }

  const results: Omit<ScreeningResultRecord, "screeningRunId">[] = [];

  for (const stock of stockInputs) {
    const evaluation = evaluateDowntrendStock({
      tsCode: stock.tsCode,
      bars: stock.bars,
    });

    if (evaluation.status === "skipped") {
      skips.push({
        tsCode: stock.tsCode,
        reason: evaluation.reason,
        availableBars: evaluation.availableBars,
      });
      continue;
    }

    if (evaluation.status === "matched") {
      results.push({
        tsCode: evaluation.tsCode,
        name: stock.name,
        latestTradeDate: evaluation.latestTradeDate,
        currentPrice: evaluation.currentPrice,
        intervalHigh: evaluation.intervalHigh,
        intervalHighTradeDate: evaluation.intervalHighTradeDate,
        intervalHighSource: evaluation.intervalHighSource,
        currentHighRatio: evaluation.currentHighRatio,
        drawdownPct: evaluation.drawdownPct,
        ma20: evaluation.ma20,
        ma60: evaluation.ma60,
        ma20Slope: evaluation.ma20Slope,
      });
    }
  }

  return writeScreeningRun({
    sourceRefreshJobId: resolvedRefreshJobId,
    sourceMarketGenerationId,
    totalStocks,
    matchedCount: results.length,
    skippedCount: skips.length,
    results,
    skips,
    now,
  });
}
