import {
  readLatestDailyBars,
  readLatestStockBasics,
  readLatestSuccessfulRefreshJob,
} from "@/lib/refresh/refresh-store";
import { evaluateDowntrendStock } from "@/lib/screening/downtrend-screen";
import { writeScreeningRun } from "@/lib/screening/screening-store";
import type {
  ScreeningDailyBar,
  ScreeningResultRecord,
  ScreeningRunRecord,
} from "@/lib/screening/screening-types";

export type RunDowntrendScreeningOptions = {
  now?: Date;
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
}: RunDowntrendScreeningOptions = {}): ScreeningRunRecord {
  const latestRefreshJob = readLatestSuccessfulRefreshJob();

  if (!latestRefreshJob) {
    throw new Error("no_successful_refresh_cache");
  }

  const stockBasics = readLatestStockBasics();
  const barsByTsCode = groupBarsByTsCode(readLatestDailyBars());
  const results: Omit<ScreeningResultRecord, "screeningRunId">[] = [];
  let skippedCount = 0;

  for (const stock of stockBasics) {
    const evaluation = evaluateDowntrendStock({
      tsCode: stock.tsCode,
      bars: barsByTsCode.get(stock.tsCode) ?? [],
    });

    if (evaluation.status === "skipped") {
      skippedCount += 1;
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
    sourceRefreshJobId: latestRefreshJob.id,
    totalStocks: stockBasics.length,
    matchedCount: results.length,
    skippedCount,
    results,
    now,
  });
}
