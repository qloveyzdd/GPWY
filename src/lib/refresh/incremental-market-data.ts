import {
  DEFAULT_MAX_LOOKBACK_DAYS,
  DEFAULT_TRADING_DATE_COUNT,
  fetchAdjustmentFactorsForDate,
  fetchDailyQuotesForDate,
  fetchMarketStocks,
  fetchTargetTradeDates,
} from "@/lib/refresh/fetch-refresh-data";
import {
  assertActiveGenerationReadyForScreening,
  ensureMarketGenerationDates,
  planActiveGenerationMarketWork,
  updateMarketGenerationDateItemStatus,
  upsertMarketAdjustmentFactors,
  upsertMarketDailyQuotes,
  upsertMarketStocks,
} from "@/lib/refresh/market-data-store";
import type {
  MarketDataWorkItem,
} from "@/lib/refresh/market-data-types";
import {
  upsertRefreshStage,
} from "@/lib/refresh/refresh-store";
import type { TushareClientLike } from "@/lib/tushare/types";

export type RefreshActiveMarketGenerationOptions = {
  client: TushareClientLike;
  generationId: number;
  now?: Date;
  targetTradingDates?: number;
  maxLookbackDays?: number;
  stageOperationId?: number | null;
};

export type RefreshActiveMarketGenerationResult = {
  generationId: number;
  stockCount: number;
  targetTradeDates: string[];
  workItemCount: number;
  completedCount: number;
  failedCount: number;
};

const tokenAssignmentPattern =
  /(token|authorization|cookie|headers?)\s*[:=]\s*[^,\s"}]+/gi;
const localPathPattern = /[A-Z]:[\\/][^,\s"}]+|\/(?:Users|home|var|tmp)\/[^,\s"}]+/g;
const secretLikePattern = /\b[A-Za-z0-9_-]*secret[A-Za-z0-9_-]*\b/gi;

function sanitizeMarketErrorSummary(error: unknown) {
  const message =
    error instanceof Error ? error.message : String(error ?? "unknown");

  return message
    .replace(tokenAssignmentPattern, "$1=[redacted]")
    .replace(localPathPattern, "[redacted-path]")
    .replace(secretLikePattern, "[redacted]")
    .slice(0, 240);
}

function firstRejectedReason(results: PromiseSettledResult<unknown>[]) {
  return results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  )?.reason;
}

async function runWorkItem({
  client,
  generationId,
  item,
  now,
}: {
  client: TushareClientLike;
  generationId: number;
  item: MarketDataWorkItem;
  now: Date;
}) {
  try {
    if (item.itemKind === "daily") {
      const quotes = await fetchDailyQuotesForDate({
        client,
        tradeDate: item.tradeDate,
      });
      upsertMarketDailyQuotes(generationId, quotes, now);
    } else {
      const factors = await fetchAdjustmentFactorsForDate({
        client,
        tradeDate: item.tradeDate,
      });
      upsertMarketAdjustmentFactors(generationId, factors, now);
    }

    updateMarketGenerationDateItemStatus(
      generationId,
      item.tradeDate,
      item.itemKind,
      "succeeded",
      now,
    );
  } catch (error) {
    updateMarketGenerationDateItemStatus(
      generationId,
      item.tradeDate,
      item.itemKind,
      "failed",
      now,
    );
    throw error;
  }
}

export async function refreshActiveMarketGeneration({
  client,
  generationId,
  now = new Date(),
  targetTradingDates = DEFAULT_TRADING_DATE_COUNT,
  maxLookbackDays = DEFAULT_MAX_LOOKBACK_DAYS,
  stageOperationId = null,
}: RefreshActiveMarketGenerationOptions): Promise<RefreshActiveMarketGenerationResult> {
  const stockStartedAt = new Date();

  if (stageOperationId !== null) {
    upsertRefreshStage(stageOperationId, {
      stage: "stock_list",
      status: "running",
      startedAt: stockStartedAt,
    });
  }

  const stocks = await fetchMarketStocks({ client });
  upsertMarketStocks(stocks, now);

  if (stageOperationId !== null) {
    upsertRefreshStage(stageOperationId, {
      stage: "stock_list",
      status: "succeeded",
      total: stocks.length,
      completed: stocks.length,
      startedAt: stockStartedAt,
      finishedAt: new Date(),
    });
  }

  const targetTradeDates = await fetchTargetTradeDates({
    client,
    now,
    targetTradingDates,
    maxLookbackDays,
  });
  ensureMarketGenerationDates(generationId, targetTradeDates, now);
  const workPlan = planActiveGenerationMarketWork(
    generationId,
    targetTradeDates,
  );
  const marketStartedAt = new Date();

  if (stageOperationId !== null) {
    upsertRefreshStage(stageOperationId, {
      stage: "market_data",
      status: workPlan.items.length === 0 ? "succeeded" : "running",
      total: workPlan.items.length,
      completed: 0,
      failed: 0,
      startedAt: marketStartedAt,
      finishedAt: workPlan.items.length === 0 ? new Date() : null,
    });
  }

  const itemResults = await Promise.allSettled(
    workPlan.items.map((item) =>
      runWorkItem({
        client,
        generationId,
        item,
        now,
      }),
    ),
  );
  const completedCount = itemResults.filter(
    (result) => result.status === "fulfilled",
  ).length;
  const failedCount = itemResults.length - completedCount;
  const failure = firstRejectedReason(itemResults);

  if (stageOperationId !== null && workPlan.items.length > 0) {
    upsertRefreshStage(stageOperationId, {
      stage: "market_data",
      status: failedCount > 0 ? "failed" : "succeeded",
      total: workPlan.items.length,
      completed: completedCount,
      failed: failedCount,
      startedAt: marketStartedAt,
      finishedAt: new Date(),
      errorSummary: failure ? sanitizeMarketErrorSummary(failure) : null,
    });
  }

  if (failedCount > 0) {
    throw new Error(
      `active_generation_market_data_incomplete:${completedCount}/${workPlan.items.length}`,
    );
  }

  assertActiveGenerationReadyForScreening(generationId, targetTradeDates);

  return {
    generationId,
    stockCount: stocks.filter((stock) => stock.listStatus === "L").length,
    targetTradeDates,
    workItemCount: workPlan.items.length,
    completedCount,
    failedCount,
  };
}
