import {
  DEFAULT_MAX_LOOKBACK_DAYS,
  DEFAULT_TRADING_DATE_COUNT,
  fetchAdjustmentFactorsForDate,
  fetchDailyQuotesForDate,
  fetchMarketStocks,
  fetchTargetTradeDates,
} from "@/lib/refresh/fetch-refresh-data";
import {
  activateMarketCacheGeneration,
  createMarketCacheGeneration,
  deleteBuildingMarketCacheGeneration,
  upsertMarketAdjustmentFactors,
  upsertMarketDailyQuotes,
  upsertMarketGenerationDate,
  upsertMarketStocks,
} from "@/lib/refresh/market-data-store";
import type {
  AdjustmentFactorRecord,
  MarketCacheGeneration,
  MarketStockRecord,
  RawDailyQuoteRecord,
} from "@/lib/refresh/market-data-types";
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
};

export type BootstrapMarketDataResult = {
  generationId: number;
  stockCount: number;
  tradeDateCount: number;
  dailyQuoteCount: number;
  adjustmentFactorCount: number;
};

export async function bootstrapMarketData({
  client,
  now = new Date(),
  targetTradingDates = DEFAULT_TRADING_DATE_COUNT,
  maxLookbackDays = DEFAULT_MAX_LOOKBACK_DAYS,
  store = DEFAULT_BOOTSTRAP_MARKET_DATA_STORE,
}: BootstrapMarketDataOptions): Promise<BootstrapMarketDataResult> {
  const generation = store.createGeneration({
    targetTradeDateCount: targetTradingDates,
    now,
  });
  let activated = false;

  try {
    const stocks = await fetchMarketStocks({ client });
    store.upsertStocks(stocks, now);
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

    const dateTasks = tradeDates.map(async (tradeDate) => {
      const [dailyQuotes, adjustmentFactors] = await Promise.all([
        fetchDailyQuotesForDate({ client, tradeDate }),
        fetchAdjustmentFactorsForDate({ client, tradeDate }),
      ]);
      store.upsertDailyQuotes(generation.id, dailyQuotes, now);
      store.upsertAdjustmentFactors(generation.id, adjustmentFactors, now);
      store.upsertGenerationDate(
        generation.id,
        {
          tradeDate,
          dailyStatus: "succeeded",
          factorStatus: "succeeded",
        },
        now,
      );
      return {
        dailyQuoteCount: dailyQuotes.length,
        adjustmentFactorCount: adjustmentFactors.length,
      };
    });
    const dateResults = await Promise.allSettled(dateTasks);
    const failedDate = dateResults.find(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected",
    );
    if (failedDate) {
      throw failedDate.reason;
    }
    const fulfilledDates = dateResults as PromiseFulfilledResult<{
      dailyQuoteCount: number;
      adjustmentFactorCount: number;
    }>[];
    const dailyQuoteCount = fulfilledDates.reduce(
      (total, result) => total + result.value.dailyQuoteCount,
      0,
    );
    const adjustmentFactorCount = fulfilledDates.reduce(
      (total, result) => total + result.value.adjustmentFactorCount,
      0,
    );

    store.activateGeneration(generation.id, now);
    activated = true;

    return {
      generationId: generation.id,
      stockCount: stocks.length,
      tradeDateCount: tradeDates.length,
      dailyQuoteCount,
      adjustmentFactorCount,
    };
  } catch (error) {
    if (!activated) {
      store.deleteBuildingGeneration(generation.id);
    }

    throw error;
  }
}
