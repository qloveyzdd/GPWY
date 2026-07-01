import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type {
  ActiveGenerationMarketWorkPlan,
  AdjustmentFactorRecord,
  DailyBasicRecord,
  MarketCacheGeneration,
  MarketDataItemKind,
  MarketGenerationDateRecord,
  MarketGenerationItemStatus,
  MarketGenerationValidation,
  MarketStockRecord,
  RawDailyQuoteRecord,
} from "@/lib/refresh/market-data-types";
import type { RefreshCacheStats } from "@/lib/refresh/refresh-types";

type StatementResult = {
  lastInsertRowid: number | bigint;
  changes: number;
};

type Statement = {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => StatementResult;
};

type DatabaseConnection = {
  exec: (sql: string) => void;
  prepare: (sql: string) => Statement;
  close: () => void;
};

type DatabaseConstructor = new (filePath: string) => DatabaseConnection;

type GenerationRow = {
  id: number;
  status: MarketCacheGeneration["status"];
  started_at: string;
  activated_at: string | null;
  target_trade_date_count: number;
};

type StockRow = {
  ts_code: string;
  name: string;
  market: string | null;
  list_status: MarketStockRecord["listStatus"];
};

type DailyQuoteRow = {
  ts_code: string;
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  vol: number;
  amount: number | null;
};

type DailyBasicRow = {
  ts_code: string;
  trade_date: string;
  turnover_rate: number;
  turnover_rate_f: number | null;
};

type AdjustmentFactorRow = {
  ts_code: string;
  trade_date: string;
  adj_factor: number;
};

type GenerationDateRow = {
  generation_id: number;
  trade_date: string;
  daily_status: MarketGenerationItemStatus;
  factor_status: MarketGenerationItemStatus;
  updated_at: string;
};

type ValidationCountRow = {
  actual_count: number;
  paired_count: number;
};

type CountRow = {
  count: number;
};

type TableInfoRow = {
  name: string;
};

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3") as DatabaseConstructor;

function getDatabasePath() {
  return (
    process.env.REFRESH_DB_PATH ??
    path.join(process.cwd(), ".data", "refresh.sqlite")
  );
}

function toIsoString(date: Date) {
  return date.toISOString();
}

function mapGeneration(row: GenerationRow): MarketCacheGeneration {
  return {
    id: row.id,
    status: row.status,
    startedAt: row.started_at,
    activatedAt: row.activated_at,
    targetTradeDateCount: row.target_trade_date_count,
  };
}

function mapStock(row: StockRow): MarketStockRecord {
  return {
    tsCode: row.ts_code,
    name: row.name,
    market: row.market,
    listStatus: row.list_status,
  };
}

function mapDailyQuote(row: DailyQuoteRow): RawDailyQuoteRecord {
  return {
    tsCode: row.ts_code,
    tradeDate: row.trade_date,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    vol: row.vol,
    amount: row.amount,
  };
}

function mapDailyBasic(row: DailyBasicRow): DailyBasicRecord {
  return {
    tsCode: row.ts_code,
    tradeDate: row.trade_date,
    turnoverRate: row.turnover_rate,
    turnoverRateFreeFloat: row.turnover_rate_f,
  };
}

function mapAdjustmentFactor(
  row: AdjustmentFactorRow,
): AdjustmentFactorRecord {
  return {
    tsCode: row.ts_code,
    tradeDate: row.trade_date,
    adjFactor: row.adj_factor,
  };
}

function mapGenerationDate(
  row: GenerationDateRow,
): MarketGenerationDateRecord {
  return {
    generationId: row.generation_id,
    tradeDate: row.trade_date,
    dailyStatus: row.daily_status,
    factorStatus: row.factor_status,
    updatedAt: row.updated_at,
  };
}

function openDatabase() {
  const dbPath = getDatabasePath();
  const dir = path.dirname(dbPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.exec(`
    create table if not exists market_stocks (
      ts_code text primary key,
      name text not null,
      market text,
      list_status text not null check (list_status in ('L', 'P', 'D')),
      updated_at text not null
    );

    create table if not exists market_cache_generations (
      id integer primary key autoincrement,
      status text not null check (status in ('building', 'active', 'failed', 'retired')),
      started_at text not null,
      activated_at text,
      target_trade_date_count integer not null
    );

    create table if not exists market_cache_state (
      singleton_id integer primary key check (singleton_id = 1),
      active_generation_id integer,
      foreign key (active_generation_id) references market_cache_generations(id)
    );

    create table if not exists market_generation_dates (
      generation_id integer not null,
      trade_date text not null,
      daily_status text not null check (daily_status in ('pending', 'succeeded', 'failed')),
      factor_status text not null check (factor_status in ('pending', 'succeeded', 'failed')),
      updated_at text not null,
      primary key (generation_id, trade_date),
      foreign key (generation_id) references market_cache_generations(id)
    );

    create table if not exists market_daily_quotes (
      generation_id integer not null,
      ts_code text not null,
      trade_date text not null,
      open real not null,
      high real not null,
      low real not null,
      close real not null,
      vol real not null,
      amount real,
      fetched_at text not null,
      primary key (generation_id, ts_code, trade_date),
      foreign key (generation_id) references market_cache_generations(id)
    );

    create index if not exists market_daily_quotes_generation_date
      on market_daily_quotes(generation_id, trade_date);

    create table if not exists market_daily_basics (
      generation_id integer not null,
      ts_code text not null,
      trade_date text not null,
      turnover_rate real not null,
      turnover_rate_f real,
      fetched_at text not null,
      primary key (generation_id, ts_code, trade_date),
      foreign key (generation_id) references market_cache_generations(id)
    );

    create index if not exists market_daily_basics_generation_date
      on market_daily_basics(generation_id, trade_date);

    create table if not exists market_adjustment_factors (
      generation_id integer not null,
      ts_code text not null,
      trade_date text not null,
      adj_factor real not null,
      fetched_at text not null,
      primary key (generation_id, ts_code, trade_date),
      foreign key (generation_id) references market_cache_generations(id)
    );

    create index if not exists market_adjustment_factors_generation_date
      on market_adjustment_factors(generation_id, trade_date);
  `);
  ensureColumn(db, "market_daily_quotes", "amount", "real");

  return db;
}

function ensureColumn(
  db: DatabaseConnection,
  tableName: string,
  columnName: string,
  definition: string,
) {
  const columns = db.prepare(`pragma table_info(${tableName})`).all() as TableInfoRow[];

  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`alter table ${tableName} add column ${columnName} ${definition}`);
  }
}

function readGenerationFromDatabase(
  db: DatabaseConnection,
  generationId: number,
) {
  const row = db
    .prepare("select * from market_cache_generations where id = ?")
    .get(generationId) as GenerationRow | undefined;

  return row ? mapGeneration(row) : null;
}

function validateGenerationInDatabase(
  db: DatabaseConnection,
  generation: MarketCacheGeneration,
): MarketGenerationValidation {
  const counts = db
    .prepare(
      `
      select
        count(*) as actual_count,
        sum(
          case
            when daily_status = 'succeeded' and factor_status = 'succeeded'
            then 1
            else 0
          end
        ) as paired_count
      from market_generation_dates
      where generation_id = ?
      `,
    )
    .get(generation.id) as ValidationCountRow;
  const actualTradeDateCount = Number(counts.actual_count ?? 0);
  const pairedSuccessCount = Number(counts.paired_count ?? 0);

  return {
    generationId: generation.id,
    expectedTradeDateCount: generation.targetTradeDateCount,
    actualTradeDateCount,
    pairedSuccessCount,
    complete:
      generation.status === "building" &&
      actualTradeDateCount === generation.targetTradeDateCount &&
      pairedSuccessCount === generation.targetTradeDateCount,
  };
}

export function createMarketCacheGeneration({
  targetTradeDateCount,
  now = new Date(),
}: {
  targetTradeDateCount: number;
  now?: Date;
}): MarketCacheGeneration {
  const db = openDatabase();

  try {
    const result = db
      .prepare(
        `
        insert into market_cache_generations
          (status, started_at, target_trade_date_count)
        values ('building', ?, ?)
        `,
      )
      .run(toIsoString(now), targetTradeDateCount);
    const generation = readGenerationFromDatabase(
      db,
      Number(result.lastInsertRowid),
    );

    if (!generation) {
      throw new Error("market_generation_create_failed");
    }

    return generation;
  } finally {
    db.close();
  }
}

export function readMarketCacheGenerationById(
  generationId: number,
): MarketCacheGeneration | null {
  const db = openDatabase();

  try {
    return readGenerationFromDatabase(db, generationId);
  } finally {
    db.close();
  }
}

export function readActiveMarketCacheGeneration(): MarketCacheGeneration | null {
  const db = openDatabase();

  try {
    const row = db
      .prepare(
        `
        select generation.*
        from market_cache_state state
        join market_cache_generations generation
          on generation.id = state.active_generation_id
        where state.singleton_id = 1
          and generation.status = 'active'
        `,
      )
      .get() as GenerationRow | undefined;

    return row ? mapGeneration(row) : null;
  } finally {
    db.close();
  }
}

export function readActiveMarketCacheStats(): RefreshCacheStats | null {
  const db = openDatabase();

  try {
    const activeGeneration = db
      .prepare(
        `
        select generation.id
        from market_cache_state state
        join market_cache_generations generation
          on generation.id = state.active_generation_id
        where state.singleton_id = 1
          and generation.status = 'active'
        `,
      )
      .get() as { id: number } | undefined;

    if (!activeGeneration) {
      return null;
    }

    const stockCount = db
      .prepare("select count(*) as count from market_stocks")
      .get() as CountRow;
    const dailyBarCount = db
      .prepare(
        `
        select count(*) as count
        from market_daily_quotes
        where generation_id = ?
        `,
      )
      .get(activeGeneration.id) as CountRow;

    return {
      stockCount: stockCount.count,
      dailyBarCount: dailyBarCount.count,
    };
  } finally {
    db.close();
  }
}

export function upsertMarketStocks(
  records: MarketStockRecord[],
  now = new Date(),
) {
  const db = openDatabase();

  try {
    db.exec("begin");
    const statement = db.prepare(
      `
      insert into market_stocks
        (ts_code, name, market, list_status, updated_at)
      values (?, ?, ?, ?, ?)
      on conflict(ts_code) do update set
        name = excluded.name,
        market = excluded.market,
        list_status = excluded.list_status,
        updated_at = excluded.updated_at
      `,
    );
    const updatedAt = toIsoString(now);

    for (const record of records) {
      statement.run(
        record.tsCode,
        record.name,
        record.market,
        record.listStatus,
        updatedAt,
      );
    }

    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  } finally {
    db.close();
  }
}

export function readMarketStocks(): MarketStockRecord[] {
  const db = openDatabase();

  try {
    return (
      db
        .prepare(
          "select ts_code, name, market, list_status from market_stocks order by ts_code",
        )
        .all() as StockRow[]
    ).map(mapStock);
  } finally {
    db.close();
  }
}

export function upsertMarketDailyQuotes(
  generationId: number,
  records: RawDailyQuoteRecord[],
  now = new Date(),
) {
  const db = openDatabase();

  try {
    db.exec("begin");
    const statement = db.prepare(
      `
      insert into market_daily_quotes
        (
          generation_id,
          ts_code,
          trade_date,
          open,
          high,
          low,
          close,
          vol,
          amount,
          fetched_at
        )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(generation_id, ts_code, trade_date) do update set
        open = excluded.open,
        high = excluded.high,
        low = excluded.low,
        close = excluded.close,
        vol = excluded.vol,
        amount = excluded.amount,
        fetched_at = excluded.fetched_at
      `,
    );
    const fetchedAt = toIsoString(now);

    for (const record of records) {
      statement.run(
        generationId,
        record.tsCode,
        record.tradeDate,
        record.open,
        record.high,
        record.low,
        record.close,
        record.vol,
        record.amount ?? null,
        fetchedAt,
      );
    }

    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  } finally {
    db.close();
  }
}

export function readMarketDailyQuotes(
  generationId: number,
): RawDailyQuoteRecord[] {
  const db = openDatabase();

  try {
    return (
      db
        .prepare(
          `
          select ts_code, trade_date, open, high, low, close, vol, amount
          from market_daily_quotes
          where generation_id = ?
          order by ts_code, trade_date
          `,
        )
        .all(generationId) as DailyQuoteRow[]
    ).map(mapDailyQuote);
  } finally {
    db.close();
  }
}

export function upsertMarketDailyBasics(
  generationId: number,
  records: DailyBasicRecord[],
  now = new Date(),
) {
  const db = openDatabase();

  try {
    db.exec("begin");
    const statement = db.prepare(
      `
      insert into market_daily_basics
        (
          generation_id,
          ts_code,
          trade_date,
          turnover_rate,
          turnover_rate_f,
          fetched_at
        )
      values (?, ?, ?, ?, ?, ?)
      on conflict(generation_id, ts_code, trade_date) do update set
        turnover_rate = excluded.turnover_rate,
        turnover_rate_f = excluded.turnover_rate_f,
        fetched_at = excluded.fetched_at
      `,
    );
    const fetchedAt = toIsoString(now);

    for (const record of records) {
      statement.run(
        generationId,
        record.tsCode,
        record.tradeDate,
        record.turnoverRate,
        record.turnoverRateFreeFloat,
        fetchedAt,
      );
    }

    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  } finally {
    db.close();
  }
}

export function readMarketDailyBasics(
  generationId: number,
): DailyBasicRecord[] {
  const db = openDatabase();

  try {
    return (
      db
        .prepare(
          `
          select ts_code, trade_date, turnover_rate, turnover_rate_f
          from market_daily_basics
          where generation_id = ?
          order by ts_code, trade_date
          `,
        )
        .all(generationId) as DailyBasicRow[]
    ).map(mapDailyBasic);
  } finally {
    db.close();
  }
}

export function upsertMarketAdjustmentFactors(
  generationId: number,
  records: AdjustmentFactorRecord[],
  now = new Date(),
) {
  const db = openDatabase();

  try {
    db.exec("begin");
    const statement = db.prepare(
      `
      insert into market_adjustment_factors
        (generation_id, ts_code, trade_date, adj_factor, fetched_at)
      values (?, ?, ?, ?, ?)
      on conflict(generation_id, ts_code, trade_date) do update set
        adj_factor = excluded.adj_factor,
        fetched_at = excluded.fetched_at
      `,
    );
    const fetchedAt = toIsoString(now);

    for (const record of records) {
      statement.run(
        generationId,
        record.tsCode,
        record.tradeDate,
        record.adjFactor,
        fetchedAt,
      );
    }

    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  } finally {
    db.close();
  }
}

export function readMarketAdjustmentFactors(
  generationId: number,
): AdjustmentFactorRecord[] {
  const db = openDatabase();

  try {
    return (
      db
        .prepare(
          `
          select ts_code, trade_date, adj_factor
          from market_adjustment_factors
          where generation_id = ?
          order by ts_code, trade_date
          `,
        )
        .all(generationId) as AdjustmentFactorRow[]
    ).map(mapAdjustmentFactor);
  } finally {
    db.close();
  }
}

export function upsertMarketGenerationDate(
  generationId: number,
  record: {
    tradeDate: string;
    dailyStatus: MarketGenerationItemStatus;
    factorStatus: MarketGenerationItemStatus;
  },
  now = new Date(),
) {
  const db = openDatabase();

  try {
    db.prepare(
      `
      insert into market_generation_dates
        (generation_id, trade_date, daily_status, factor_status, updated_at)
      values (?, ?, ?, ?, ?)
      on conflict(generation_id, trade_date) do update set
        daily_status = excluded.daily_status,
        factor_status = excluded.factor_status,
        updated_at = excluded.updated_at
      `,
    ).run(
      generationId,
      record.tradeDate,
      record.dailyStatus,
      record.factorStatus,
      toIsoString(now),
    );
  } finally {
    db.close();
  }
}

export function readMarketGenerationDates(
  generationId: number,
): MarketGenerationDateRecord[] {
  const db = openDatabase();

  try {
    return (
      db
        .prepare(
          `
          select generation_id, trade_date, daily_status, factor_status, updated_at
          from market_generation_dates
          where generation_id = ?
          order by trade_date
          `,
        )
        .all(generationId) as GenerationDateRow[]
    ).map(mapGenerationDate);
  } finally {
    db.close();
  }
}

function uniqueTradeDates(tradeDates: string[]) {
  return Array.from(new Set(tradeDates));
}

export function ensureMarketGenerationDates(
  generationId: number,
  tradeDates: string[],
  now = new Date(),
) {
  const db = openDatabase();
  let transactionStarted = false;

  try {
    const generation = readGenerationFromDatabase(db, generationId);

    if (!generation) {
      throw new Error("market_generation_not_found");
    }

    db.exec("begin");
    transactionStarted = true;
    const statement = db.prepare(
      `
      insert or ignore into market_generation_dates
        (generation_id, trade_date, daily_status, factor_status, updated_at)
      values (?, ?, 'pending', 'pending', ?)
      `,
    );
    const updatedAt = toIsoString(now);

    for (const tradeDate of uniqueTradeDates(tradeDates)) {
      statement.run(generationId, tradeDate, updatedAt);
    }

    db.exec("commit");
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      db.exec("rollback");
    }
    throw error;
  } finally {
    db.close();
  }
}

export function updateMarketGenerationDateItemStatus(
  generationId: number,
  tradeDate: string,
  itemKind: MarketDataItemKind,
  status: MarketGenerationItemStatus,
  now = new Date(),
) {
  const db = openDatabase();

  try {
    const generation = readGenerationFromDatabase(db, generationId);

    if (!generation) {
      throw new Error("market_generation_not_found");
    }

    const updatedAt = toIsoString(now);
    const existing = db
      .prepare(
        `
        select generation_id, trade_date, daily_status, factor_status, updated_at
        from market_generation_dates
        where generation_id = ? and trade_date = ?
        `,
      )
      .get(generationId, tradeDate) as GenerationDateRow | undefined;

    if (!existing) {
      db.prepare(
        `
        insert into market_generation_dates
          (generation_id, trade_date, daily_status, factor_status, updated_at)
        values (?, ?, ?, ?, ?)
        `,
      ).run(
        generationId,
        tradeDate,
        itemKind === "daily" ? status : "pending",
        itemKind === "factor" ? status : "pending",
        updatedAt,
      );
      return;
    }

    if (itemKind === "daily") {
      db.prepare(
        `
        update market_generation_dates
        set daily_status = ?,
          updated_at = ?
        where generation_id = ? and trade_date = ?
        `,
      ).run(status, updatedAt, generationId, tradeDate);
      return;
    }

    db.prepare(
      `
      update market_generation_dates
      set factor_status = ?,
        updated_at = ?
      where generation_id = ? and trade_date = ?
      `,
    ).run(status, updatedAt, generationId, tradeDate);
  } finally {
    db.close();
  }
}

export function planActiveGenerationMarketWork(
  generationId: number,
  targetTradeDates: string[],
): ActiveGenerationMarketWorkPlan {
  const db = openDatabase();

  try {
    const generation = readGenerationFromDatabase(db, generationId);

    if (!generation) {
      throw new Error("market_generation_not_found");
    }

    const normalizedTargetTradeDates = uniqueTradeDates(targetTradeDates);
    const rows = (
      db
        .prepare(
          `
          select generation_id, trade_date, daily_status, factor_status, updated_at
          from market_generation_dates
          where generation_id = ?
          `,
        )
        .all(generationId) as GenerationDateRow[]
    ).map(mapGenerationDate);
    const byTradeDate = new Map(rows.map((row) => [row.tradeDate, row]));
    const items: ActiveGenerationMarketWorkPlan["items"] = [];

    for (const tradeDate of normalizedTargetTradeDates) {
      const record = byTradeDate.get(tradeDate);
      const dailyStatus = record?.dailyStatus ?? "pending";
      const factorStatus = record?.factorStatus ?? "pending";

      if (dailyStatus !== "succeeded") {
        items.push({
          generationId,
          tradeDate,
          itemKind: "daily",
          currentStatus: dailyStatus,
        });
      }

      if (factorStatus !== "succeeded") {
        items.push({
          generationId,
          tradeDate,
          itemKind: "factor",
          currentStatus: factorStatus,
        });
      }
    }

    return {
      generationId,
      targetTradeDates: normalizedTargetTradeDates,
      items,
      missingDailyCount: items.filter((item) => item.itemKind === "daily").length,
      missingFactorCount: items.filter((item) => item.itemKind === "factor")
        .length,
      ready: items.length === 0,
    };
  } finally {
    db.close();
  }
}

export function readPairedSuccessTradeDates(
  generationId: number,
  targetTradeDates: string[],
): string[] {
  const db = openDatabase();

  try {
    const generation = readGenerationFromDatabase(db, generationId);

    if (!generation) {
      throw new Error("market_generation_not_found");
    }

    const normalizedTargetTradeDates = uniqueTradeDates(targetTradeDates);
    const rows = (
      db
        .prepare(
          `
          select generation_id, trade_date, daily_status, factor_status, updated_at
          from market_generation_dates
          where generation_id = ?
          `,
        )
        .all(generationId) as GenerationDateRow[]
    ).map(mapGenerationDate);
    const byTradeDate = new Map(rows.map((row) => [row.tradeDate, row]));

    return normalizedTargetTradeDates.filter((tradeDate) => {
      const record = byTradeDate.get(tradeDate);

      return (
        record?.dailyStatus === "succeeded" &&
        record.factorStatus === "succeeded"
      );
    });
  } finally {
    db.close();
  }
}

export function assertActiveGenerationReadyForScreening(
  generationId: number,
  targetTradeDates: string[],
) {
  const targetCount = uniqueTradeDates(targetTradeDates).length;
  const pairedSuccessCount = readPairedSuccessTradeDates(
    generationId,
    targetTradeDates,
  ).length;

  if (pairedSuccessCount !== targetCount) {
    throw new Error("active_generation_target_incomplete");
  }
}

export function validateMarketCacheGeneration(
  generationId: number,
): MarketGenerationValidation {
  const db = openDatabase();

  try {
    const generation = readGenerationFromDatabase(db, generationId);

    if (!generation) {
      throw new Error("market_generation_not_found");
    }

    return validateGenerationInDatabase(db, generation);
  } finally {
    db.close();
  }
}

export function activateMarketCacheGeneration(
  generationId: number,
  now = new Date(),
): MarketCacheGeneration {
  const db = openDatabase();

  try {
    db.exec("begin immediate");
    const generation = readGenerationFromDatabase(db, generationId);

    if (!generation) {
      throw new Error("market_generation_not_found");
    }

    const validation = validateGenerationInDatabase(db, generation);

    if (!validation.complete) {
      throw new Error("market_generation_incomplete");
    }

    db.prepare(
      `
      update market_cache_generations
      set status = 'retired'
      where status = 'active' and id <> ?
      `,
    ).run(generationId);
    db.prepare(
      `
      update market_cache_generations
      set status = 'active', activated_at = ?
      where id = ? and status = 'building'
      `,
    ).run(toIsoString(now), generationId);
    db.prepare(
      `
      insert into market_cache_state (singleton_id, active_generation_id)
      values (1, ?)
      on conflict(singleton_id) do update set
        active_generation_id = excluded.active_generation_id
      `,
    ).run(generationId);
    const activeGeneration = readGenerationFromDatabase(db, generationId);

    if (!activeGeneration) {
      throw new Error("market_generation_activation_failed");
    }

    db.exec("commit");

    return activeGeneration;
  } catch (error) {
    db.exec("rollback");
    throw error;
  } finally {
    db.close();
  }
}

export function deleteBuildingMarketCacheGeneration(generationId: number) {
  const db = openDatabase();

  try {
    db.exec("begin immediate");
    const generation = readGenerationFromDatabase(db, generationId);

    if (!generation || generation.status !== "building") {
      db.exec("commit");
      return false;
    }

    db.prepare(
      "delete from market_adjustment_factors where generation_id = ?",
    ).run(generationId);
    db.prepare("delete from market_daily_basics where generation_id = ?").run(
      generationId,
    );
    db.prepare("delete from market_daily_quotes where generation_id = ?").run(
      generationId,
    );
    db.prepare("delete from market_generation_dates where generation_id = ?").run(
      generationId,
    );
    db.prepare("delete from market_cache_generations where id = ?").run(
      generationId,
    );
    db.exec("commit");

    return true;
  } catch (error) {
    db.exec("rollback");
    throw error;
  } finally {
    db.close();
  }
}
