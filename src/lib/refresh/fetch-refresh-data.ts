import type {
  AdjustmentFactorRecord,
  MarketStockRecord,
  MarketStockStatus,
  RawDailyQuoteRecord,
} from "@/lib/refresh/market-data-types";
import { classifyTushareError } from "@/lib/tushare/client";
import { TUSHARE_ENDPOINTS } from "@/lib/tushare/endpoints";
import type {
  TushareClientLike,
  TushareDataTable,
  TushareEndpoint,
} from "@/lib/tushare/types";

export const DEFAULT_TRADING_DATE_COUNT = 60;
export const DEFAULT_MAX_LOOKBACK_DAYS = 180;
export const DEFAULT_PROVIDER_RETRY_COUNT = 1;
export const DEFAULT_PROVIDER_RETRY_DELAY_MS = 1_000;

type ProviderRetryOptions = {
  providerRetryCount?: number;
  providerRetryDelayMs?: number;
};

export type FetchRefreshDataOptions = ProviderRetryOptions & {
  client: TushareClientLike;
  now?: Date;
  targetTradingDates?: number;
  maxLookbackDays?: number;
};

export type FetchRefreshDataResult = {
  stocks: MarketStockRecord[];
  dailyQuotes: RawDailyQuoteRecord[];
  adjustmentFactors: AdjustmentFactorRecord[];
  tradeDates: string[];
};

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

function dateDaysAgo(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() - days);

  return next;
}

function mapRow(fields: string[], row: unknown[]) {
  return Object.fromEntries(fields.map((field, index) => [field, row[index]]));
}

function requiredString(value: unknown, field: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw new Error(`invalid ${field}`);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function requiredNumber(value: unknown, field: string) {
  const numberValue = Number(value);

  if (Number.isFinite(numberValue)) {
    return numberValue;
  }

  throw new Error(`invalid ${field}`);
}

function delay(ms: number) {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isTransientProviderError(error: unknown, apiName: string) {
  return classifyTushareError(error, apiName).category === "network_or_service";
}

async function queryWithRetry(
  client: TushareClientLike,
  endpoint: TushareEndpoint,
  params: Record<string, unknown>,
  {
    providerRetryCount = DEFAULT_PROVIDER_RETRY_COUNT,
    providerRetryDelayMs = DEFAULT_PROVIDER_RETRY_DELAY_MS,
  }: ProviderRetryOptions,
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await client.query(endpoint, params);
    } catch (error) {
      if (
        attempt >= providerRetryCount ||
        !isTransientProviderError(error, endpoint.apiName)
      ) {
        throw error;
      }

      await delay(providerRetryDelayMs * (attempt + 1));
    }
  }
}

function mapStocks(
  table: TushareDataTable,
  requestedStatus: MarketStockStatus,
) {
  return table.items.map((row): MarketStockRecord => {
    const mapped = mapRow(table.fields, row);
    const returnedStatus = optionalString(mapped.list_status);
    const listStatus =
      returnedStatus === "L" || returnedStatus === "P" || returnedStatus === "D"
        ? returnedStatus
        : requestedStatus;

    return {
      tsCode: requiredString(mapped.ts_code, "ts_code"),
      name: requiredString(mapped.name, "name"),
      market: optionalString(mapped.market),
      listStatus,
    };
  });
}

function mapTradeDates(table: TushareDataTable) {
  return table.items
    .map((row) => {
      const mapped = mapRow(table.fields, row);
      const isOpen = String(mapped.is_open) === "1";

      return isOpen ? requiredString(mapped.cal_date, "cal_date") : null;
    })
    .filter((tradeDate): tradeDate is string => tradeDate !== null)
    .sort((left, right) => right.localeCompare(left));
}

function mapDailyQuotes(table: TushareDataTable): RawDailyQuoteRecord[] {
  return table.items.map((row) => {
    const mapped = mapRow(table.fields, row);

    return {
      tsCode: requiredString(mapped.ts_code, "ts_code"),
      tradeDate: requiredString(mapped.trade_date, "trade_date"),
      open: requiredNumber(mapped.open, "open"),
      high: requiredNumber(mapped.high, "high"),
      low: requiredNumber(mapped.low, "low"),
      close: requiredNumber(mapped.close, "close"),
      vol: requiredNumber(mapped.vol, "vol"),
    };
  });
}

function mapAdjustmentFactors(
  table: TushareDataTable,
): AdjustmentFactorRecord[] {
  return table.items.map((row) => {
    const mapped = mapRow(table.fields, row);

    return {
      tsCode: requiredString(mapped.ts_code, "ts_code"),
      tradeDate: requiredString(mapped.trade_date, "trade_date"),
      adjFactor: requiredNumber(mapped.adj_factor, "adj_factor"),
    };
  });
}

export async function fetchMarketStocks({
  client,
  ...retryOptions
}: ProviderRetryOptions & {
  client: TushareClientLike;
}) {
  const stocksByCode = new Map<string, MarketStockRecord>();

  for (const listStatus of ["L", "P", "D"] as const) {
    const table = await queryWithRetry(
      client,
      TUSHARE_ENDPOINTS.stockBasic,
      { list_status: listStatus },
      retryOptions,
    );

    for (const stock of mapStocks(table, listStatus)) {
      stocksByCode.set(stock.tsCode, stock);
    }
  }

  return [...stocksByCode.values()];
}

export async function fetchTargetTradeDates({
  client,
  now = new Date(),
  targetTradingDates = DEFAULT_TRADING_DATE_COUNT,
  maxLookbackDays = DEFAULT_MAX_LOOKBACK_DAYS,
  ...retryOptions
}: ProviderRetryOptions & {
  client: TushareClientLike;
  now?: Date;
  targetTradingDates?: number;
  maxLookbackDays?: number;
}) {
  const table = await queryWithRetry(
    client,
    TUSHARE_ENDPOINTS.tradeCalendar,
    {
      exchange: "",
      start_date: formatDate(dateDaysAgo(now, maxLookbackDays)),
      end_date: formatDate(now),
      is_open: "1",
    },
    retryOptions,
  );
  const tradeDates = mapTradeDates(table).slice(0, targetTradingDates);

  if (tradeDates.length !== targetTradingDates) {
    throw new Error(
      `insufficient_trading_dates:${tradeDates.length}/${targetTradingDates}`,
    );
  }

  return tradeDates;
}

export async function fetchDailyQuotesForDate({
  client,
  tradeDate,
  ...retryOptions
}: ProviderRetryOptions & {
  client: TushareClientLike;
  tradeDate: string;
}) {
  const table = await queryWithRetry(
    client,
    TUSHARE_ENDPOINTS.daily,
    { trade_date: tradeDate },
    retryOptions,
  );

  return mapDailyQuotes(table);
}

export async function fetchAdjustmentFactorsForDate({
  client,
  tradeDate,
  ...retryOptions
}: ProviderRetryOptions & {
  client: TushareClientLike;
  tradeDate: string;
}) {
  const table = await queryWithRetry(
    client,
    TUSHARE_ENDPOINTS.adjFactor,
    { trade_date: tradeDate },
    retryOptions,
  );

  return mapAdjustmentFactors(table);
}

export async function fetchRefreshData({
  client,
  now = new Date(),
  targetTradingDates = DEFAULT_TRADING_DATE_COUNT,
  maxLookbackDays = DEFAULT_MAX_LOOKBACK_DAYS,
  providerRetryCount = DEFAULT_PROVIDER_RETRY_COUNT,
  providerRetryDelayMs = DEFAULT_PROVIDER_RETRY_DELAY_MS,
}: FetchRefreshDataOptions): Promise<FetchRefreshDataResult> {
  const retryOptions = {
    providerRetryCount,
    providerRetryDelayMs,
  };
  const stocks = await fetchMarketStocks({ client, ...retryOptions });
  const tradeDates = await fetchTargetTradeDates({
    client,
    now,
    targetTradingDates,
    maxLookbackDays,
    ...retryOptions,
  });
  const dailyQuotes: RawDailyQuoteRecord[] = [];
  const adjustmentFactors: AdjustmentFactorRecord[] = [];

  for (const tradeDate of tradeDates) {
    dailyQuotes.push(
      ...(await fetchDailyQuotesForDate({
        client,
        tradeDate,
        ...retryOptions,
      })),
    );
    adjustmentFactors.push(
      ...(await fetchAdjustmentFactorsForDate({
        client,
        tradeDate,
        ...retryOptions,
      })),
    );
  }

  return {
    stocks,
    dailyQuotes,
    adjustmentFactors,
    tradeDates,
  };
}
