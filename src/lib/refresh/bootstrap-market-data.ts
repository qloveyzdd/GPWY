import {
  DEFAULT_MAX_LOOKBACK_DAYS,
  DEFAULT_TRADING_DATE_COUNT,
  fetchAdjustmentFactorsForDate,
  fetchDailyBasicsForDate,
  fetchDailyQuotesForDate,
  fetchMarketStocks,
  fetchTargetTradeDates,
} from "@/lib/refresh/fetch-refresh-data";
import {
  activateMarketCacheGeneration,
  createMarketCacheGeneration,
  deleteBuildingMarketCacheGeneration,
  upsertMarketAdjustmentFactors,
  upsertMarketDailyBasics,
  upsertMarketDailyQuotes,
  upsertMarketGenerationDate,
  upsertMarketStocks,
} from "@/lib/refresh/market-data-store";
import type {
  AdjustmentFactorRecord,
  DailyBasicRecord,
  MarketCacheGeneration,
  MarketStockRecord,
  RawDailyQuoteRecord,
} from "@/lib/refresh/market-data-types";
import type {
  RefreshStageKey,
  RefreshStageStatus,
} from "@/lib/refresh/refresh-types";
import type { TushareClientLike } from "@/lib/tushare/types";

export type BootstrapMarketDataStore = {
  createGeneration: (options: {
    targetTradeDateCount: number;
    now?: Date;
  }) => MarketCacheGeneration;
  upsertStocks: (records: MarketStockRecord[], now?: Date) => void;
  upsertDailyQuotes: (
    generationId: number,
    records: RawDailyQuoteRecord[],
    now?: Date,
  ) => void;
  upsertAdjustmentFactors: (
    generationId: number,
    records: AdjustmentFactorRecord[],
    now?: Date,
  ) => void;
  upsertDailyBasics: (
    generationId: number,
    records: DailyBasicRecord[],
    now?: Date,
  ) => void;
  upsertGenerationDate: (
    generationId: number,
    record: {
      tradeDate: string;
      dailyStatus: "pending" | "succeeded" | "failed";
      factorStatus: "pending" | "succeeded" | "failed";
    },
    now?: Date,
  ) => void;
  activateGeneration: (
    generationId: number,
    now?: Date,
  ) => MarketCacheGeneration;
  deleteBuildingGeneration: (generationId: number) => boolean;
};

export const DEFAULT_BOOTSTRAP_MARKET_DATA_STORE: BootstrapMarketDataStore = {
  createGeneration: createMarketCacheGeneration,
  upsertStocks: upsertMarketStocks,
  upsertDailyQuotes: upsertMarketDailyQuotes,
  upsertAdjustmentFactors: upsertMarketAdjustmentFactors,
  upsertDailyBasics: upsertMarketDailyBasics,
  upsertGenerationDate: upsertMarketGenerationDate,
  activateGeneration: activateMarketCacheGeneration,
  deleteBuildingGeneration: deleteBuildingMarketCacheGeneration,
};

export type BootstrapMarketDataOptions = {
  client: TushareClientLike;
  now?: Date;
  targetTradingDates?: number;
  maxLookbackDays?: number;
  store?: BootstrapMarketDataStore;
  onProgress?: (progress: BootstrapMarketDataProgress) => void;
};

export type BootstrapMarketDataProgress = {
  stage: Extract<RefreshStageKey, "stock_list" | "market_data">;
  status: RefreshStageStatus;
  total: number;
  completed: number;
  failed: number;
  errorSummary?: string | null;
};

export type BootstrapMarketDataResult = {
  generationId: number;
  stockCount: number;
  tradeDateCount: number;
  dailyQuoteCount: number;
  adjustmentFactorCount: number;
  dailyBasicCount: number;
};

export async function bootstrapMarketData({
  client,
  now = new Date(),
  targetTradingDates = DEFAULT_TRADING_DATE_COUNT,
  maxLookbackDays = DEFAULT_MAX_LOOKBACK_DAYS,
  store = DEFAULT_BOOTSTRAP_MARKET_DATA_STORE,
  onProgress,
}: BootstrapMarketDataOptions): Promise<BootstrapMarketDataResult> {
  const generation = store.createGeneration({
    targetTradeDateCount: targetTradingDates,
    now,
  });
  let activated = false;

  try {
    onProgress?.({
      stage: "stock_list",
      status: "running",
      total: 0,
      completed: 0,
      failed: 0,
    });
    const stocks = await fetchMarketStocks({ client });
    store.upsertStocks(stocks, now);
    onProgress?.({
      stage: "stock_list",
      status: "succeeded",
      total: stocks.length,
      completed: stocks.length,
      failed: 0,
    });
    const tradeDates = await fetchTargetTradeDates({
      client,
      now,
      targetTradingDates,
      maxLookbackDays,
    });

    for (const tradeDate of tradeDates) {
      store.upsertGenerationDate(
        generation.id,
        {
          tradeDate,
          dailyStatus: "pending",
          factorStatus: "pending",
        },
        now,
      );
    }

    let completedItems = 0;
    let failedItems = 0;
    const totalItems = tradeDates.length * 2;

    onProgress?.({
      stage: "market_data",
      status: "running",
      total: totalItems,
      completed: completedItems,
      failed: failedItems,
    });

    const dateTasks = tradeDates.map(async (tradeDate) => {
      try {
        const [dailyQuotes, adjustmentFactors] = await Promise.all([
          fetchDailyQuotesForDate({ client, tradeDate }),
          fetchAdjustmentFactorsForDate({ client, tradeDate }),
        ]);
        const dailyBasics = await fetchDailyBasicsForDate({
          client,
          tradeDate,
        }).catch(() => [] as DailyBasicRecord[]);
        store.upsertDailyQuotes(generation.id, dailyQuotes, now);
        store.upsertAdjustmentFactors(generation.id, adjustmentFactors, now);
        store.upsertDailyBasics(generation.id, dailyBasics, now);
        store.upsertGenerationDate(
          generation.id,
          {
            tradeDate,
            dailyStatus: "succeeded",
            factorStatus: "succeeded",
          },
          now,
        );
        completedItems += 2;
        onProgress?.({
          stage: "market_data",
          status: "running",
          total: totalItems,
          completed: completedItems,
          failed: failedItems,
        });
        return {
          dailyQuoteCount: dailyQuotes.length,
          adjustmentFactorCount: adjustmentFactors.length,
          dailyBasicCount: dailyBasics.length,
        };
      } catch (error) {
        failedItems += 2;
        onProgress?.({
          stage: "market_data",
          status: "running",
          total: totalItems,
          completed: completedItems,
          failed: failedItems,
          errorSummary:
            error instanceof Error ? error.message.slice(0, 240) : "unknown",
        });
        throw error;
      }
    });
    const dateResults = await Promise.allSettled(dateTasks);
    const failedDate = dateResults.find(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected",
    );
    if (failedDate) {
      onProgress?.({
        stage: "market_data",
        status: "failed",
        total: totalItems,
        completed: completedItems,
        failed: failedItems,
        errorSummary:
          failedDate.reason instanceof Error
            ? failedDate.reason.message.slice(0, 240)
            : "unknown",
      });
      throw failedDate.reason;
    }
    const fulfilledDates = dateResults as PromiseFulfilledResult<{
      dailyQuoteCount: number;
      adjustmentFactorCount: number;
      dailyBasicCount: number;
    }>[];
    const dailyQuoteCount = fulfilledDates.reduce(
      (total, result) => total + result.value.dailyQuoteCount,
      0,
    );
    const adjustmentFactorCount = fulfilledDates.reduce(
      (total, result) => total + result.value.adjustmentFactorCount,
      0,
    );
    const dailyBasicCount = fulfilledDates.reduce(
      (total, result) => total + result.value.dailyBasicCount,
      0,
    );

    store.activateGeneration(generation.id, now);
    activated = true;
    onProgress?.({
      stage: "market_data",
      status: "succeeded",
      total: totalItems,
      completed: completedItems,
      failed: 0,
    });

    return {
      generationId: generation.id,
      stockCount: stocks.length,
      tradeDateCount: tradeDates.length,
      dailyQuoteCount,
      adjustmentFactorCount,
      dailyBasicCount,
    };
  } catch (error) {
    if (!activated) {
      store.deleteBuildingGeneration(generation.id);
    }

    throw error;
  }
}
