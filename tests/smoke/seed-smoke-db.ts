import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

type Statement = {
  run: (...params: unknown[]) => { lastInsertRowid: number | bigint };
};

type DatabaseConnection = {
  exec: (sql: string) => void;
  prepare: (sql: string) => Statement;
  close: () => void;
};

type DatabaseConstructor = new (filePath: string) => DatabaseConnection;

const require = createRequire(path.join(process.cwd(), "playwright.config.ts"));
const Database = require("better-sqlite3") as DatabaseConstructor;

function iso(date: string) {
  return new Date(date).toISOString();
}

function makeBars(tsCode: string, offset = 0) {
  return Array.from({ length: 60 }, (_, index) => {
    const close = 100 + offset - index;
    const high = index === 50 ? 90 + offset : close + 1;

    return {
      tsCode,
      tradeDate: `2026${String(index + 1).padStart(4, "0")}`,
      open: close + 0.5,
      high,
      low: close - 1,
      close,
      vol: 1000 + index,
    };
  });
}

function migrate(db: DatabaseConnection) {
  db.exec(`
    create table refresh_jobs (
      id integer primary key autoincrement,
      status text not null,
      started_at text not null,
      finished_at text,
      total_stocks integer not null default 0,
      success_count integer not null default 0,
      failed_count integer not null default 0,
      error_summary text
    );

    create table stock_basics (
      refresh_job_id integer not null,
      ts_code text not null,
      name text not null,
      market text,
      list_status text,
      updated_at text not null,
      primary key (refresh_job_id, ts_code)
    );

    create table daily_bars (
      refresh_job_id integer not null,
      ts_code text not null,
      trade_date text not null,
      open real not null,
      high real not null,
      low real not null,
      close real not null,
      vol real not null,
      updated_at text not null,
      primary key (refresh_job_id, ts_code, trade_date)
    );

    create table screening_runs (
      id integer primary key autoincrement,
      source_refresh_job_id integer not null,
      created_at text not null,
      total_stocks integer not null,
      matched_count integer not null,
      skipped_count integer not null
    );

    create table screening_results (
      screening_run_id integer not null,
      ts_code text not null,
      name text not null,
      latest_trade_date text not null,
      current_price real not null,
      interval_high real not null,
      interval_high_trade_date text not null,
      interval_high_source text not null,
      current_high_ratio real not null,
      drawdown_pct real not null,
      ma20 real not null,
      ma60 real not null,
      ma20_slope real not null,
      primary key (screening_run_id, ts_code)
    );

    create table chip_peak_runs (
      id integer primary key autoincrement,
      screening_run_id integer not null,
      status text not null,
      created_at text not null,
      total_candidates integer not null,
      success_count integer not null,
      blocked_count integer not null,
      failed_count integer not null
    );

    create table chip_peak_results (
      chip_peak_run_id integer not null,
      screening_run_id integer not null,
      ts_code text not null,
      status text not null,
      trade_date text,
      chip_peak_price real,
      peak_percent real,
      source text,
      error_category text,
      error_summary text,
      primary key (chip_peak_run_id, ts_code)
    );
  `);
}

export default async function seedSmokeDb() {
  const dbPath =
    process.env.REFRESH_DB_PATH ??
    path.join(process.cwd(), ".data", "smoke.sqlite");

  mkdirSync(path.dirname(dbPath), { recursive: true });
  rmSync(dbPath, { force: true });

  const db = new Database(dbPath);

  try {
    migrate(db);

    const refreshJobId = Number(
      db
        .prepare(
          `
          insert into refresh_jobs
            (status, started_at, finished_at, total_stocks, success_count, failed_count, error_summary)
          values (?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          "succeeded",
          iso("2026-06-23T00:00:00.000Z"),
          iso("2026-06-23T00:02:00.000Z"),
          2,
          2,
          0,
          null,
        ).lastInsertRowid,
    );
    const updatedAt = iso("2026-06-23T00:02:00.000Z");
    const insertStock = db.prepare(
      `
      insert into stock_basics
        (refresh_job_id, ts_code, name, market, list_status, updated_at)
      values (?, ?, ?, ?, ?, ?)
      `,
    );

    insertStock.run(refreshJobId, "000001.SZ", "平安银行", "主板", "L", updatedAt);
    insertStock.run(refreshJobId, "000002.SZ", "万科A", "主板", "L", updatedAt);

    const insertBar = db.prepare(
      `
      insert into daily_bars
        (refresh_job_id, ts_code, trade_date, open, high, low, close, vol, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    for (const bar of [...makeBars("000001.SZ"), ...makeBars("000002.SZ", 10)]) {
      insertBar.run(
        refreshJobId,
        bar.tsCode,
        bar.tradeDate,
        bar.open,
        bar.high,
        bar.low,
        bar.close,
        bar.vol,
        updatedAt,
      );
    }

    const screeningRunId = Number(
      db
        .prepare(
          `
          insert into screening_runs
            (source_refresh_job_id, created_at, total_stocks, matched_count, skipped_count)
          values (?, ?, ?, ?, ?)
          `,
        )
        .run(refreshJobId, iso("2026-06-23T00:03:00.000Z"), 2, 2, 0)
        .lastInsertRowid,
    );
    const insertScreening = db.prepare(
      `
      insert into screening_results
        (
          screening_run_id, ts_code, name, latest_trade_date, current_price,
          interval_high, interval_high_trade_date, interval_high_source,
          current_high_ratio, drawdown_pct, ma20, ma60, ma20_slope
        )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    insertScreening.run(
      screeningRunId,
      "000001.SZ",
      "平安银行",
      "20260060",
      41,
      90,
      "20260051",
      "swing_high",
      41 / 90,
      1 - 41 / 90,
      50.5,
      70.5,
      -1,
    );
    insertScreening.run(
      screeningRunId,
      "000002.SZ",
      "万科A",
      "20260060",
      40,
      100,
      "20260051",
      "swing_high",
      0.4,
      0.6,
      45,
      60,
      -0.4,
    );

    const chipPeakRunId = Number(
      db
        .prepare(
          `
          insert into chip_peak_runs
            (
              screening_run_id, status, created_at, total_candidates,
              success_count, blocked_count, failed_count
            )
          values (?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          screeningRunId,
          "partial",
          iso("2026-06-23T00:04:00.000Z"),
          2,
          1,
          1,
          0,
        ).lastInsertRowid,
    );
    const insertChip = db.prepare(
      `
      insert into chip_peak_results
        (
          chip_peak_run_id, screening_run_id, ts_code, status, trade_date,
          chip_peak_price, peak_percent, source, error_category, error_summary
        )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    insertChip.run(
      chipPeakRunId,
      screeningRunId,
      "000001.SZ",
      "succeeded",
      "20260060",
      36.2,
      6.5,
      "cyq_chips_highest_percent",
      null,
      null,
    );
    insertChip.run(
      chipPeakRunId,
      screeningRunId,
      "000002.SZ",
      "blocked",
      null,
      null,
      null,
      null,
      "permission_denied",
      "筹码接口权限不足。",
    );
  } finally {
    db.close();
  }
}
