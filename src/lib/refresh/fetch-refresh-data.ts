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

type DailyBarWithAdjFactor = DailyBarRecord & {
  adjFactor: number;
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

function mapAdjFactors(table: TushareDataTable) {
  return new Map(
    table.items.map((row) => {
      const mapped = mapRow(table.fields, row);
      const tsCode = requiredString(mapped.ts_code, "ts_code");
      const tradeDate = requiredString(mapped.trade_date, "trade_date");
      const adjFactor = requiredNumber(mapped.adj_factor, "adj_factor");

      return [`${tsCode}:${tradeDate}`, adjFactor] as const;
    }),
  );
}

function adjustBarsToLatestBasis(
  records: DailyBarWithAdjFactor[],
): DailyBarRecord[] {
  const latestFactorByTsCode = new Map<
    string,
    { tradeDate: string; adjFactor: number }
  >();

  for (const record of records) {
    const latest = latestFactorByTsCode.get(record.tsCode);

    if (!latest || record.tradeDate > latest.tradeDate) {
      latestFactorByTsCode.set(record.tsCode, {
        tradeDate: record.tradeDate,
        adjFactor: record.adjFactor,
      });
    }
  }

  return records.map(({ adjFactor, ...record }) => {
    const latestFactor = latestFactorByTsCode.get(record.tsCode)?.adjFactor;

    if (!latestFactor || latestFactor <= 0 || adjFactor <= 0) {
      throw new TushareApiError(
        "adj_factor",
        0,
        `invalid adj factor for ${record.tsCode}`,
      );
    }

    const ratio = adjFactor / latestFactor;

    return {
      ...record,
      open: record.open * ratio,
      high: record.high * ratio,
      low: record.low * ratio,
      close: record.close * ratio,
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
  const dailyBars: DailyBarWithAdjFactor[] = [];
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

    const mappedDailyBars = mapDailyBars(dailyTable);
    const adjFactorTable = await queryWithRetry(
      client,
      TUSHARE_ENDPOINTS.adjFactor,
      { trade_date: tradeDate },
      providerRetryCount,
      providerRetryDelayMs,
    );
    const adjFactors = mapAdjFactors(adjFactorTable);

    for (const bar of mappedDailyBars) {
      const adjFactor = adjFactors.get(`${bar.tsCode}:${bar.tradeDate}`);

      if (adjFactor === undefined) {
        throw new TushareApiError(
          "adj_factor",
          0,
          `missing adj factor for ${bar.tsCode}:${bar.tradeDate}`,
        );
      }

      dailyBars.push({ ...bar, adjFactor });
    }
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
    dailyBars: adjustBarsToLatestBasis(dailyBars),
    tradeDates,
  };
}
