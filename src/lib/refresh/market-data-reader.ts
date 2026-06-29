import {
  readActiveMarketCacheGeneration,
  readMarketAdjustmentFactors,
  readMarketCacheGenerationById,
  readMarketDailyQuotes,
  readMarketStocks,
} from "@/lib/refresh/market-data-store";
import type {
  AdjustmentFactorRecord,
  MarketStockRecord,
  RawDailyQuoteRecord,
} from "@/lib/refresh/market-data-types";
import type {
  ScreeningDailyBar,
  ScreeningSkipReason,
} from "@/lib/screening/screening-types";

export type AdjustedMarketStock = {
  stock: MarketStockRecord;
  bars: ScreeningDailyBar[];
};

export type AdjustedMarketDataSkip = {
  tsCode: string;
  reason: Extract<ScreeningSkipReason, "missing_adjustment_factor">;
  availableBars: number;
};

export type AdjustedMarketData = {
  generationId: number;
  stocks: AdjustedMarketStock[];
  skips: AdjustedMarketDataSkip[];
};

function resolveGenerationId(generationId?: number) {
  if (generationId !== undefined) {
    const generation = readMarketCacheGenerationById(generationId);

    if (!generation || generation.status === "building") {
      throw new Error("market_generation_not_readable");
    }

    return generation.id;
  }

  const activeGeneration = readActiveMarketCacheGeneration();

  if (!activeGeneration) {
    throw new Error("no_active_market_generation");
  }

  return activeGeneration.id;
}

function adjustmentFactorKey(tsCode: string, tradeDate: string) {
  return `${tsCode}:${tradeDate}`;
}

function adjustBarsForStock(
  tsCode: string,
  sourceQuotes: RawDailyQuoteRecord[],
  factors: Map<string, number>,
  { limitToLatest60 = true }: { limitToLatest60?: boolean } = {},
) {
  const sortedQuotes = sourceQuotes.sort((left, right) =>
    left.tradeDate.localeCompare(right.tradeDate),
  );
  const quotes = limitToLatest60 ? sortedQuotes.slice(-60) : sortedQuotes;
  const latestQuote = quotes.at(-1);
  const latestFactor = latestQuote
    ? factors.get(adjustmentFactorKey(tsCode, latestQuote.tradeDate))
    : undefined;

  if (
    quotes.some((quote) => {
      const factor = factors.get(
        adjustmentFactorKey(quote.tsCode, quote.tradeDate),
      );

      return factor === undefined || factor <= 0;
    }) ||
    (latestQuote && (latestFactor === undefined || latestFactor <= 0))
  ) {
    return {
      status: "skipped" as const,
      availableBars: quotes.length,
    };
  }

  return {
    status: "ready" as const,
    bars: quotes.map((quote) => {
      const factor = factors.get(
        adjustmentFactorKey(quote.tsCode, quote.tradeDate),
      );

      if (factor === undefined || latestFactor === undefined) {
        throw new Error("missing_adjustment_factor");
      }

      const ratio = factor / latestFactor;

      return {
        tsCode: quote.tsCode,
        tradeDate: quote.tradeDate,
        open: quote.open * ratio,
        high: quote.high * ratio,
        low: quote.low * ratio,
        close: quote.close * ratio,
        vol: quote.vol,
      };
    }),
  };
}

export function readAdjustedMarketBarsForStock(
  generationId: number,
  tsCode: string,
): ScreeningDailyBar[] {
  const resolvedGenerationId = resolveGenerationId(generationId);
  const quotes = readMarketDailyQuotes(resolvedGenerationId).filter(
    (quote) => quote.tsCode === tsCode,
  );
  const factors = factorMap(
    readMarketAdjustmentFactors(resolvedGenerationId).filter(
      (factor) => factor.tsCode === tsCode,
    ),
  );
  const adjusted = adjustBarsForStock(tsCode, quotes, factors);

  if (adjusted.status === "skipped") {
    throw new Error("missing_adjustment_factor");
  }

  return adjusted.bars;
}

export function readAdjustedMarketData({
  generationId,
  tradeDates,
}: {
  generationId?: number;
  tradeDates?: string[];
} = {}): AdjustedMarketData {
  const resolvedGenerationId = resolveGenerationId(generationId);
  const targetTradeDates =
    tradeDates === undefined ? null : new Set(tradeDates);
  const quotesByTsCode = new Map<string, RawDailyQuoteRecord[]>();
  const factors = factorMap(
    readMarketAdjustmentFactors(resolvedGenerationId).filter(
      (factor) =>
        targetTradeDates === null || targetTradeDates.has(factor.tradeDate),
    ),
  );
  const stocks: AdjustedMarketStock[] = [];
  const skips: AdjustedMarketDataSkip[] = [];

  for (const quote of readMarketDailyQuotes(resolvedGenerationId)) {
    if (targetTradeDates !== null && !targetTradeDates.has(quote.tradeDate)) {
      continue;
    }

    const existing = quotesByTsCode.get(quote.tsCode);

    if (existing) {
      existing.push(quote);
    } else {
      quotesByTsCode.set(quote.tsCode, [quote]);
    }
  }

  for (const stock of readMarketStocks()) {
    if (stock.listStatus !== "L") {
      continue;
    }

    const adjusted = adjustBarsForStock(
      stock.tsCode,
      quotesByTsCode.get(stock.tsCode) ?? [],
      factors,
      { limitToLatest60: targetTradeDates === null },
    );

    if (adjusted.status === "skipped") {
      skips.push({
        tsCode: stock.tsCode,
        reason: "missing_adjustment_factor",
        availableBars: adjusted.availableBars,
      });
      continue;
    }

    stocks.push({
      stock,
      bars: adjusted.bars,
    });
  }

  return {
    generationId: resolvedGenerationId,
    stocks,
    skips,
  };
}

function factorMap(records: AdjustmentFactorRecord[]) {
  return new Map(
    records.map((factor) => [
      adjustmentFactorKey(factor.tsCode, factor.tradeDate),
      factor.adjFactor,
    ]),
  );
}
