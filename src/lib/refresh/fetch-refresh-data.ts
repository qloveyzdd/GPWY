import type {
  DailyBarRecord,
  StockBasicRecord,
} from "@/lib/refresh/refresh-types";
import { classifyTushareError, TushareApiError } from "@/lib/tushare/client";
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

export type FetchRefreshDataOptions = {
  client: TushareClientLike;
  now?: Date;
  targetTradingDates?: number;
  maxLookbackDays?: number;
  providerRetryCount?: number;
  providerRetryDelayMs?: number;
};

export type FetchRefreshDataResult = {
  stockBasics: StockBasicRecord[];
  dailyBars: DailyBarRecord[];
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

function isEmptyDataError(error: unknown) {
  return error instanceof TushareApiError && error.code === 0;
}

function isTransientProviderError(error: unknown, apiName: string) {
  return classifyTushareError(error, apiName).category === "network_or_service";
}

function delay(ms: number) {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function queryWithRetry(
  client: TushareClientLike,
  endpoint: TushareEndpoint,
  params: Record<string, unknown>,
  retryCount: number,
  retryDelayMs: number,
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await client.query(endpoint, params);
    } catch (error) {
      if (
        attempt >= retryCount ||
        !isTransientProviderError(error, endpoint.apiName)
      ) {
        throw error;
      }

      await delay(retryDelayMs * (attempt + 1));
    }
  }
}

function mapStockBasics(table: TushareDataTable): StockBasicRecord[] {
  const records = table.items
    .map((row) => {
      const mapped = mapRow(table.fields, row);

      return {
        tsCode: requiredString(mapped.ts_code, "ts_code"),
        name: requiredString(mapped.name, "name"),
        market: optionalString(mapped.market),
        listStatus: optionalString(mapped.list_status) ?? "L",
      };
    })
    .filter((record) => record.listStatus === "L");

  if (!records.length) {
    throw new TushareApiError("stock_basic", 0, "empty listed stocks");
  }

  return records;
}

function mapDailyBars(table: TushareDataTable): DailyBarRecord[] {
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

export async function fetchRefreshData({
  client,
  now = new Date(),
  targetTradingDates = DEFAULT_TRADING_DATE_COUNT,
  maxLookbackDays = DEFAULT_MAX_LOOKBACK_DAYS,
  providerRetryCount = DEFAULT_PROVIDER_RETRY_COUNT,
  providerRetryDelayMs = DEFAULT_PROVIDER_RETRY_DELAY_MS,
}: FetchRefreshDataOptions): Promise<FetchRefreshDataResult> {
  const stockBasicTable = await queryWithRetry(
    client,
    TUSHARE_ENDPOINTS.stockBasic,
    { list_status: "L" },
    providerRetryCount,
    providerRetryDelayMs,
  );
  const stockBasics = mapStockBasics(stockBasicTable);
  const dailyBars: DailyBarRecord[] = [];
  const tradeDates: string[] = [];

  for (
    let daysBack = 0;
    daysBack < maxLookbackDays && tradeDates.length < targetTradingDates;
    daysBack += 1
  ) {
    const tradeDate = formatDate(dateDaysAgo(now, daysBack));
    let dailyTable: TushareDataTable;

    try {
      dailyTable = await queryWithRetry(
        client,
        TUSHARE_ENDPOINTS.daily,
        { trade_date: tradeDate },
        providerRetryCount,
        providerRetryDelayMs,
      );
    } catch (error) {
      if (isEmptyDataError(error)) {
        continue;
      }

      throw error;
    }

    if (!dailyTable.items.length) {
      continue;
    }

    dailyBars.push(...mapDailyBars(dailyTable));
    tradeDates.push(tradeDate);
  }

  if (tradeDates.length < targetTradingDates) {
    throw new TushareApiError(
      "daily",
      0,
      `insufficient trading dates ${tradeDates.length}/${targetTradingDates}`,
    );
  }

  return {
    stockBasics,
    dailyBars,
    tradeDates,
  };
}
