import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type {
  AdjustmentFactorRecord,
  MarketCacheGeneration,
  MarketGenerationDateRecord,
  MarketGenerationItemStatus,
  MarketGenerationValidation,
  MarketStockRecord,
  RawDailyQuoteRecord,
} from "@/lib/refresh/market-data-types";

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
      fetched_at text not null,
      primary key (generation_id, ts_code, trade_date),
      foreign key (generation_id) references market_cache_generations(id)
    );

    create index if not exists market_daily_quotes_generation_date
      on market_daily_quotes(generation_id, trade_date);

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

  return db;
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
      generation.targetTradeDateCount === 60 &&
      actualTradeDateCount === 60 &&
      pairedSuccessCount === 60,
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
          fetched_at
        )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(generation_id, ts_code, trade_date) do update set
        open = excluded.open,
        high = excluded.high,
        low = excluded.low,
        close = excluded.close,
        vol = excluded.vol,
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
          select ts_code, trade_date, open, high, low, close, vol
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
    db.exec("commit");

    const activeGeneration = readGenerationFromDatabase(db, generationId);

    if (!activeGeneration) {
      throw new Error("market_generation_activation_failed");
    }

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
