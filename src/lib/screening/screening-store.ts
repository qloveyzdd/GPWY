import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type {
  ScreeningResultRecord,
  ScreeningRunRecord,
  ScreeningSkipRecord,
} from "@/lib/screening/screening-types";

type Statement = {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => { lastInsertRowid: number | bigint };
};

type DatabaseConnection = {
  exec: (sql: string) => void;
  prepare: (sql: string) => Statement;
  close: () => void;
};

type DatabaseConstructor = new (filePath: string) => DatabaseConnection;

type ScreeningRunRow = {
  id: number;
  source_refresh_job_id: number;
  source_market_generation_id: number | null;
  created_at: string;
  total_stocks: number;
  matched_count: number;
  skipped_count: number;
};

type ScreeningResultRow = {
  screening_run_id: number;
  ts_code: string;
  name: string;
  latest_trade_date: string;
  current_price: number;
  interval_high: number;
  interval_high_trade_date: string;
  interval_high_source: ScreeningResultRecord["intervalHighSource"];
  current_high_ratio: number;
  drawdown_pct: number;
  ma20: number;
  ma60: number;
  ma20_slope: number;
};

type ScreeningSkipRow = {
  screening_run_id: number;
  ts_code: string;
  reason: ScreeningSkipRecord["reason"];
  available_bars: number | null;
};

type TableInfoRow = {
  name: string;
};

export type WriteScreeningRunInput = {
  sourceRefreshJobId: number;
  sourceMarketGenerationId?: number | null;
  totalStocks: number;
  matchedCount: number;
  skippedCount: number;
  results: Omit<ScreeningResultRecord, "screeningRunId">[];
  skips?: Omit<ScreeningSkipRecord, "screeningRunId">[];
  now?: Date;
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

function openDatabase() {
  const dbPath = getDatabasePath();
  const dir = path.dirname(dbPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  db.exec(`
    create table if not exists screening_runs (
      id integer primary key autoincrement,
      source_refresh_job_id integer not null,
      source_market_generation_id integer,
      created_at text not null,
      total_stocks integer not null,
      matched_count integer not null,
      skipped_count integer not null
    );

    create table if not exists screening_results (
      screening_run_id integer not null,
      ts_code text not null,
      name text not null,
      latest_trade_date text not null,
      current_price real not null,
      interval_high real not null,
      interval_high_trade_date text not null,
      interval_high_source text not null check (interval_high_source in ('swing_high', 'fallback_60d_high')),
      current_high_ratio real not null,
      drawdown_pct real not null,
      ma20 real not null,
      ma60 real not null,
      ma20_slope real not null,
      primary key (screening_run_id, ts_code),
      foreign key (screening_run_id) references screening_runs(id)
    );

    create table if not exists screening_skips (
      screening_run_id integer not null,
      ts_code text not null,
      reason text not null check (reason in ('insufficient_bars', 'missing_adjustment_factor')),
      available_bars integer,
      primary key (screening_run_id, ts_code),
      foreign key (screening_run_id) references screening_runs(id)
    );
  `);
  const screeningRunColumns = db
    .prepare("pragma table_info(screening_runs)")
    .all() as TableInfoRow[];

  if (
    !screeningRunColumns.some(
      (column) => column.name === "source_market_generation_id",
    )
  ) {
    db.exec(
      "alter table screening_runs add column source_market_generation_id integer",
    );
  }

  return db;
}

function mapRun(row: ScreeningRunRow): ScreeningRunRecord {
  return {
    id: row.id,
    sourceRefreshJobId: row.source_refresh_job_id,
    sourceMarketGenerationId: row.source_market_generation_id,
    createdAt: row.created_at,
    totalStocks: row.total_stocks,
    matchedCount: row.matched_count,
    skippedCount: row.skipped_count,
  };
}

function mapResult(row: ScreeningResultRow): ScreeningResultRecord {
  return {
    screeningRunId: row.screening_run_id,
    tsCode: row.ts_code,
    name: row.name,
    latestTradeDate: row.latest_trade_date,
    currentPrice: row.current_price,
    intervalHigh: row.interval_high,
    intervalHighTradeDate: row.interval_high_trade_date,
    intervalHighSource: row.interval_high_source,
    currentHighRatio: row.current_high_ratio,
    drawdownPct: row.drawdown_pct,
    ma20: row.ma20,
    ma60: row.ma60,
    ma20Slope: row.ma20_slope,
  };
}

function mapSkip(row: ScreeningSkipRow): ScreeningSkipRecord {
  return {
    screeningRunId: row.screening_run_id,
    tsCode: row.ts_code,
    reason: row.reason,
    availableBars: row.available_bars,
  };
}

export function writeScreeningRun({
  sourceRefreshJobId,
  sourceMarketGenerationId = null,
  totalStocks,
  matchedCount,
  skippedCount,
  results,
  skips = [],
  now = new Date(),
}: WriteScreeningRunInput): ScreeningRunRecord {
  const db = openDatabase();

  try {
    db.exec("begin");
    const createdAt = toIsoString(now);
    const insertRun = db
      .prepare(
        `
        insert into screening_runs
          (
            source_refresh_job_id,
            source_market_generation_id,
            created_at,
            total_stocks,
            matched_count,
            skipped_count
          )
        values (?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        sourceRefreshJobId,
        sourceMarketGenerationId,
        createdAt,
        totalStocks,
        matchedCount,
        skippedCount,
      );
    const screeningRunId = Number(insertRun.lastInsertRowid);
    const insertResult = db.prepare(
      `
      insert into screening_results
        (
          screening_run_id,
          ts_code,
          name,
          latest_trade_date,
          current_price,
          interval_high,
          interval_high_trade_date,
          interval_high_source,
          current_high_ratio,
          drawdown_pct,
          ma20,
          ma60,
          ma20_slope
        )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    for (const result of results) {
      insertResult.run(
        screeningRunId,
        result.tsCode,
        result.name,
        result.latestTradeDate,
        result.currentPrice,
        result.intervalHigh,
        result.intervalHighTradeDate,
        result.intervalHighSource,
        result.currentHighRatio,
        result.drawdownPct,
        result.ma20,
        result.ma60,
        result.ma20Slope,
      );
    }
    const insertSkip = db.prepare(
      `
      insert into screening_skips
        (screening_run_id, ts_code, reason, available_bars)
      values (?, ?, ?, ?)
      `,
    );

    for (const skip of skips) {
      insertSkip.run(
        screeningRunId,
        skip.tsCode,
        skip.reason,
        skip.availableBars,
      );
    }

    db.exec("commit");

    return {
      id: screeningRunId,
      sourceRefreshJobId,
      sourceMarketGenerationId,
      createdAt,
      totalStocks,
      matchedCount,
      skippedCount,
    };
  } catch (error) {
    db.exec("rollback");
    throw error;
  } finally {
    db.close();
  }
}

export function readLatestScreeningRun(): ScreeningRunRecord | null {
  const db = openDatabase();

  try {
    const row = db
      .prepare("select * from screening_runs order by id desc limit 1")
      .get() as ScreeningRunRow | undefined;

    return row ? mapRun(row) : null;
  } finally {
    db.close();
  }
}

export function readScreeningRunById(
  screeningRunId: number,
): ScreeningRunRecord | null {
  const db = openDatabase();

  try {
    const row = db
      .prepare("select * from screening_runs where id = ?")
      .get(screeningRunId) as ScreeningRunRow | undefined;

    return row ? mapRun(row) : null;
  } finally {
    db.close();
  }
}

export function readScreeningResultsForRun(
  screeningRunId: number,
): ScreeningResultRecord[] {
  const db = openDatabase();

  try {
    return (
      db
        .prepare(
          `
          select *
          from screening_results
          where screening_run_id = ?
          order by current_high_ratio asc, ts_code asc
          `,
        )
        .all(screeningRunId) as ScreeningResultRow[]
    ).map(mapResult);
  } finally {
    db.close();
  }
}

export function readLatestScreeningResults(): ScreeningResultRecord[] {
  const latestRun = readLatestScreeningRun();

  return latestRun ? readScreeningResultsForRun(latestRun.id) : [];
}

export function readLatestScreeningSkips(): ScreeningSkipRecord[] {
  const latestRun = readLatestScreeningRun();

  if (!latestRun) {
    return [];
  }

  const db = openDatabase();

  try {
    return (
      db
        .prepare(
          `
          select screening_run_id, ts_code, reason, available_bars
          from screening_skips
          where screening_run_id = ?
          order by ts_code
          `,
        )
        .all(latestRun.id) as ScreeningSkipRow[]
    ).map(mapSkip);
  } finally {
    db.close();
  }
}
