import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type {
  DailyBarRecord,
  RefreshJob,
  RefreshStartResult,
  StockBasicRecord,
} from "@/lib/refresh/refresh-types";

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

type RefreshJobRow = {
  id: number;
  status: RefreshJob["status"];
  started_at: string;
  finished_at: string | null;
  total_stocks: number;
  success_count: number;
  failed_count: number;
  error_summary: string | null;
};

type StockBasicRow = {
  ts_code: string;
  name: string;
  market: string | null;
  list_status: string | null;
};

type DailyBarRow = {
  ts_code: string;
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  vol: number;
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

function mapJob(row: RefreshJobRow): RefreshJob {
  return {
    id: row.id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    totalStocks: row.total_stocks,
    successCount: row.success_count,
    failedCount: row.failed_count,
    errorSummary: row.error_summary,
  };
}

function mapStockBasic(row: StockBasicRow): StockBasicRecord {
  return {
    tsCode: row.ts_code,
    name: row.name,
    market: row.market,
    listStatus: row.list_status,
  };
}

function mapDailyBar(row: DailyBarRow): DailyBarRecord {
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

function openDatabase() {
  const dbPath = getDatabasePath();
  const dir = path.dirname(dbPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.exec(`
    create table if not exists refresh_jobs (
      id integer primary key autoincrement,
      status text not null check (status in ('running', 'succeeded', 'failed')),
      started_at text not null,
      finished_at text,
      total_stocks integer not null default 0,
      success_count integer not null default 0,
      failed_count integer not null default 0,
      error_summary text
    );

    create unique index if not exists refresh_jobs_one_running
      on refresh_jobs(status)
      where status = 'running';

    create table if not exists stock_basics (
      refresh_job_id integer not null,
      ts_code text not null,
      name text not null,
      market text,
      list_status text,
      updated_at text not null,
      primary key (refresh_job_id, ts_code),
      foreign key (refresh_job_id) references refresh_jobs(id)
    );

    create table if not exists daily_bars (
      refresh_job_id integer not null,
      ts_code text not null,
      trade_date text not null,
      open real not null,
      high real not null,
      low real not null,
      close real not null,
      vol real not null,
      updated_at text not null,
      primary key (refresh_job_id, ts_code, trade_date),
      foreign key (refresh_job_id) references refresh_jobs(id)
    );

    create index if not exists daily_bars_job_date
      on daily_bars(refresh_job_id, trade_date);
  `);

  return db;
}

function readJobByStatus(status: RefreshJob["status"]) {
  const db = openDatabase();

  try {
    const row = db
      .prepare("select * from refresh_jobs where status = ? order by id desc limit 1")
      .get(status) as RefreshJobRow | undefined;

    return row ? mapJob(row) : null;
  } finally {
    db.close();
  }
}

export function startRefreshJob(now = new Date()): RefreshStartResult {
  const db = openDatabase();

  try {
    try {
      const result = db
        .prepare("insert into refresh_jobs (status, started_at) values (?, ?)")
        .run("running", toIsoString(now));
      const id = Number(result.lastInsertRowid);
      const row = db
        .prepare("select * from refresh_jobs where id = ?")
        .get(id) as RefreshJobRow;

      return { started: true, job: mapJob(row) };
    } catch {
      const row = db
        .prepare(
          "select * from refresh_jobs where status = 'running' order by id desc limit 1",
        )
        .get() as RefreshJobRow | undefined;

      if (!row) {
        throw new Error("refresh job lock conflict without active job");
      }

      return { started: false, job: mapJob(row) };
    }
  } finally {
    db.close();
  }
}

export function readActiveRefreshJob() {
  return readJobByStatus("running");
}

export function readLatestSuccessfulRefreshJob() {
  return readJobByStatus("succeeded");
}

export function readLatestRefreshJob() {
  const db = openDatabase();

  try {
    const row = db
      .prepare("select * from refresh_jobs order by id desc limit 1")
      .get() as RefreshJobRow | undefined;

    return row ? mapJob(row) : null;
  } finally {
    db.close();
  }
}

export function completeRefreshJob(
  jobId: number,
  {
    totalStocks,
    successCount,
    failedCount,
    finishedAt = new Date(),
  }: {
    totalStocks: number;
    successCount: number;
    failedCount: number;
    finishedAt?: Date;
  },
) {
  const db = openDatabase();

  try {
    db.prepare(
      `
      update refresh_jobs
      set status = 'succeeded',
        finished_at = ?,
        total_stocks = ?,
        success_count = ?,
        failed_count = ?,
        error_summary = null
      where id = ?
      `,
    ).run(toIsoString(finishedAt), totalStocks, successCount, failedCount, jobId);
  } finally {
    db.close();
  }
}

export function failRefreshJob(
  jobId: number,
  {
    errorSummary,
    totalStocks = 0,
    successCount = 0,
    failedCount = 0,
    finishedAt = new Date(),
  }: {
    errorSummary: string;
    totalStocks?: number;
    successCount?: number;
    failedCount?: number;
    finishedAt?: Date;
  },
) {
  const db = openDatabase();

  try {
    db.prepare(
      `
      update refresh_jobs
      set status = 'failed',
        finished_at = ?,
        total_stocks = ?,
        success_count = ?,
        failed_count = ?,
        error_summary = ?
      where id = ?
      `,
    ).run(
      toIsoString(finishedAt),
      totalStocks,
      successCount,
      failedCount,
      errorSummary,
      jobId,
    );
  } finally {
    db.close();
  }
}

export function writeStockBasics(
  refreshJobId: number,
  records: StockBasicRecord[],
  now = new Date(),
) {
  const db = openDatabase();

  try {
    db.exec("begin");
    const statement = db.prepare(
      `
      insert into stock_basics
        (refresh_job_id, ts_code, name, market, list_status, updated_at)
      values (?, ?, ?, ?, ?, ?)
      on conflict(refresh_job_id, ts_code) do update set
        name = excluded.name,
        market = excluded.market,
        list_status = excluded.list_status,
        updated_at = excluded.updated_at
      `,
    );
    const updatedAt = toIsoString(now);

    for (const record of records) {
      statement.run(
        refreshJobId,
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

export function writeDailyBars(
  refreshJobId: number,
  records: DailyBarRecord[],
  now = new Date(),
) {
  const db = openDatabase();

  try {
    db.exec("begin");
    const statement = db.prepare(
      `
      insert into daily_bars
        (refresh_job_id, ts_code, trade_date, open, high, low, close, vol, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(refresh_job_id, ts_code, trade_date) do update set
        open = excluded.open,
        high = excluded.high,
        low = excluded.low,
        close = excluded.close,
        vol = excluded.vol,
        updated_at = excluded.updated_at
      `,
    );
    const updatedAt = toIsoString(now);

    for (const record of records) {
      statement.run(
        refreshJobId,
        record.tsCode,
        record.tradeDate,
        record.open,
        record.high,
        record.low,
        record.close,
        record.vol,
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

export function readLatestStockBasics(): StockBasicRecord[] {
  const latestSuccess = readLatestSuccessfulRefreshJob();

  if (!latestSuccess) {
    return [];
  }

  const db = openDatabase();

  try {
    return (
      db
        .prepare(
          "select ts_code, name, market, list_status from stock_basics where refresh_job_id = ? order by ts_code",
        )
        .all(latestSuccess.id) as StockBasicRow[]
    ).map(mapStockBasic);
  } finally {
    db.close();
  }
}

export function readLatestDailyBars(): DailyBarRecord[] {
  const latestSuccess = readLatestSuccessfulRefreshJob();

  if (!latestSuccess) {
    return [];
  }

  const db = openDatabase();

  try {
    return (
      db
        .prepare(
          `
          select ts_code, trade_date, open, high, low, close, vol
          from daily_bars
          where refresh_job_id = ?
          order by ts_code, trade_date
          `,
        )
        .all(latestSuccess.id) as DailyBarRow[]
    ).map(mapDailyBar);
  } finally {
    db.close();
  }
}
