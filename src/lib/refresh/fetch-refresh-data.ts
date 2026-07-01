import type {
  AdjustmentFactorRecord,
  DailyBasicRecord,
  MarketStockRecord,
  MarketStockStatus,
  RawDailyQuoteRecord,
} from "@/lib/refresh/market-data-types";
import { TushareApiError } from "@/lib/tushare/client";
import { TUSHARE_ENDPOINTS } from "@/lib/tushare/endpoints";
import type {
  TushareClientLike,
  TushareDataTable,
} from "@/lib/tushare/types";

export const DEFAULT_TRADING_DATE_COUNT = 60;
export const DEFAULT_MAX_LOOKBACK_DAYS = 180;

export type FetchRefreshDataOptions = {
  client: TushareClientLike;
  now?: Date;
  targetTradingDates?: number;
  maxLookbackDays?: number;
};

export type FetchRefreshDataResult = {
  stocks: MarketStockRecord[];
  dailyQuotes: RawDailyQuoteRecord[];
  adjustmentFactors: AdjustmentFactorRecord[];
  dailyBasics: DailyBasicRecord[];
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

function optionalNumber(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);

  if (Number.isFinite(numberValue)) {
    return numberValue;
  }

  throw new Error(`invalid ${field}`);
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

function isEmptyDataError(error: unknown, apiName: string) {
  return (
    error instanceof TushareApiError &&
    error.apiName === apiName &&
    (error.code === 0 || error.message === "empty_data")
  );
}

async function fetchMarketStocksByStatus({
  client,
  listStatus,
}: {
  client: TushareClientLike;
  listStatus: MarketStockStatus;
}) {
  try {
    const table = await client.query(
      TUSHARE_ENDPOINTS.stockBasic,
      { list_status: listStatus },
      { priority: "market" },
    );

    return mapStocks(table, listStatus);
  } catch (error) {
    if (
      listStatus !== "L" &&
      isEmptyDataError(error, TUSHARE_ENDPOINTS.stockBasic.apiName)
    ) {
      return [];
    }

    throw error;
  }
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

async function findFirstDailyReadyTradeDateIndex({
  client,
  tradeDates,
  knownReadyTradeDates,
}: {
  client: TushareClientLike;
  tradeDates: string[];
  knownReadyTradeDates?: Iterable<string>;
}) {
  const knownReadyTradeDateSet = new Set(knownReadyTradeDates ?? []);

  for (let index = 0; index < tradeDates.length; index += 1) {
    const tradeDate = tradeDates[index]!;

    if (knownReadyTradeDateSet.has(tradeDate)) {
      return index;
    }

    try {
      await client.query(
        TUSHARE_ENDPOINTS.daily,
        { trade_date: tradeDate },
        { priority: "market" },
      );
      return index;
    } catch (error) {
      if (isEmptyDataError(error, TUSHARE_ENDPOINTS.daily.apiName)) {
        continue;
      }

      throw error;
    }
  }

  return -1;
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
      amount: requiredNumber(mapped.amount, "amount"),
    };
  });
}

function mapDailyBasics(table: TushareDataTable): DailyBasicRecord[] {
  return table.items.map((row) => {
    const mapped = mapRow(table.fields, row);

    return {
      tsCode: requiredString(mapped.ts_code, "ts_code"),
      tradeDate: requiredString(mapped.trade_date, "trade_date"),
      turnoverRate: requiredNumber(mapped.turnover_rate, "turnover_rate"),
      turnoverRateFreeFloat: optionalNumber(
        mapped.turnover_rate_f,
        "turnover_rate_f",
      ),
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
}: {
  client: TushareClientLike;
}) {
  const stocksByCode = new Map<string, MarketStockRecord>();
  const stockGroups = await Promise.all(
    (["L", "P", "D"] as const).map(async (listStatus) => ({
      listStatus,
      stocks: await fetchMarketStocksByStatus({ client, listStatus }),
    })),
  );

  for (const { stocks } of stockGroups) {
    for (const stock of stocks) {
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
  knownReadyTradeDates,
}: {
  client: TushareClientLike;
  now?: Date;
  targetTradingDates?: number;
  maxLookbackDays?: number;
  knownReadyTradeDates?: Iterable<string>;
}) {
  const table = await client.query(
    TUSHARE_ENDPOINTS.tradeCalendar,
    {
      exchange: "",
      start_date: formatDate(dateDaysAgo(now, maxLookbackDays)),
      end_date: formatDate(now),
      is_open: "1",
    },
    { priority: "market" },
  );
  const candidateTradeDates = mapTradeDates(table);
  const firstReadyIndex = await findFirstDailyReadyTradeDateIndex({
    client,
    tradeDates: candidateTradeDates,
    knownReadyTradeDates,
  });
  const tradeDates =
    firstReadyIndex >= 0
      ? candidateTradeDates.slice(
          firstReadyIndex,
          firstReadyIndex + targetTradingDates,
        )
      : [];

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
}: {
  client: TushareClientLike;
  tradeDate: string;
}) {
  const table = await client.query(
    TUSHARE_ENDPOINTS.daily,
    { trade_date: tradeDate },
    { priority: "market" },
  );

  return mapDailyQuotes(table);
}

export async function fetchAdjustmentFactorsForDate({
  client,
  tradeDate,
}: {
  client: TushareClientLike;
  tradeDate: string;
}) {
  const table = await client.query(
    TUSHARE_ENDPOINTS.adjFactor,
    { trade_date: tradeDate },
    { priority: "market" },
  );

  return mapAdjustmentFactors(table);
}

export async function fetchDailyBasicsForDate({
  client,
  tradeDate,
}: {
  client: TushareClientLike;
  tradeDate: string;
}) {
  const table = await client.query(
    TUSHARE_ENDPOINTS.dailyBasic,
    { trade_date: tradeDate },
    { priority: "market" },
  );

  return mapDailyBasics(table);
}

export async function fetchRefreshData({
  client,
  now = new Date(),
  targetTradingDates = DEFAULT_TRADING_DATE_COUNT,
  maxLookbackDays = DEFAULT_MAX_LOOKBACK_DAYS,
}: FetchRefreshDataOptions): Promise<FetchRefreshDataResult> {
  const stocks = await fetchMarketStocks({ client });
  const tradeDates = await fetchTargetTradeDates({
    client,
    now,
    targetTradingDates,
    maxLookbackDays,
  });
  const dateResults = await Promise.all(
    tradeDates.map(async (tradeDate) => {
      const [dailyQuotes, adjustmentFactors, dailyBasics] = await Promise.all([
        fetchDailyQuotesForDate({
          client,
          tradeDate,
        }),
        fetchAdjustmentFactorsForDate({
          client,
          tradeDate,
        }),
        fetchDailyBasicsForDate({
          client,
          tradeDate,
        }),
      ]);
      return { dailyQuotes, adjustmentFactors, dailyBasics };
    }),
  );

  return {
    stocks,
    dailyQuotes: dateResults.flatMap((result) => result.dailyQuotes),
    adjustmentFactors: dateResults.flatMap(
      (result) => result.adjustmentFactors,
    ),
    dailyBasics: dateResults.flatMap((result) => result.dailyBasics),
    tradeDates,
  };
}
