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
const CHIP_MODEL_VERSION = "decay-triangle-v1";

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

    create table chip_peak_levels (
      chip_peak_run_id integer not null,
      ts_code text not null,
      peak_rank integer not null,
      trade_date text not null,
      price real not null,
      percent real not null,
      primary key (chip_peak_run_id, ts_code, peak_rank)
    );

    create table chip_distribution_runs (
      id integer primary key autoincrement,
      screening_run_id integer not null,
      status text not null,
      created_at text not null,
      total_targets integer not null,
      success_count integer not null,
      blocked_count integer not null,
      failed_count integer not null,
      missing_count integer not null,
      skipped_complete_count integer not null default 0
    );

    create index chip_distribution_runs_screening_run_id
      on chip_distribution_runs(screening_run_id, id);

    create table chip_distribution_statuses (
      chip_distribution_run_id integer not null,
      screening_run_id integer not null,
      ts_code text not null,
      target_kind text not null,
      trade_date text,
      status text not null,
      source text,
      error_category text,
      error_summary text,
      updated_at text not null,
      primary key (chip_distribution_run_id, ts_code, target_kind)
    );

    create index chip_distribution_statuses_target_lookup
      on chip_distribution_statuses(ts_code, trade_date, chip_distribution_run_id);

    create table chip_distribution_levels (
      ts_code text not null,
      trade_date text not null,
      price real not null,
      percent real not null,
      fetched_at text not null,
      primary key (ts_code, trade_date, price)
    );

    create index chip_distribution_levels_target_lookup
      on chip_distribution_levels(ts_code, trade_date);

    create table chip_model_runs (
      id integer primary key autoincrement,
      screening_run_id integer not null,
      status text not null,
      created_at text not null,
      total_targets integer not null,
      success_count integer not null,
      blocked_count integer not null,
      failed_count integer not null,
      missing_count integer not null,
      skipped_complete_count integer not null default 0
    );

    create index chip_model_runs_screening_run_id
      on chip_model_runs(screening_run_id, id);

    create table chip_model_statuses (
      id integer primary key autoincrement,
      chip_model_run_id integer not null,
      screening_run_id integer not null,
      ts_code text not null,
      target_kind text not null,
      target_trade_date text,
      seed_trade_date text,
      decay_coefficient real not null,
      model_version text not null,
      status text not null,
      unavailable_reason text,
      error_category text,
      error_summary text,
      updated_at text not null
    );

    create index chip_model_status_lookup
      on chip_model_statuses(
        ts_code,
        target_trade_date,
        seed_trade_date,
        decay_coefficient,
        model_version,
        chip_model_run_id
      );

    create table chip_model_levels (
      ts_code text not null,
      target_trade_date text not null,
      seed_trade_date text not null,
      decay_coefficient real not null,
      model_version text not null,
      price real not null,
      percent real not null,
      calculated_at text not null,
      primary key (
        ts_code,
        target_trade_date,
        seed_trade_date,
        decay_coefficient,
        model_version,
        price
      )
    );

    create table chip_model_seed_snapshots (
      ts_code text not null,
      target_trade_date text not null,
      seed_trade_date text not null,
      model_version text not null,
      price real not null,
      percent real not null,
      calculated_at text not null,
      primary key (
        ts_code,
        target_trade_date,
        seed_trade_date,
        model_version,
        price
      )
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
    const insertChipLevel = db.prepare(
      `
      insert into chip_peak_levels
        (chip_peak_run_id, ts_code, peak_rank, trade_date, price, percent)
      values (?, ?, ?, ?, ?, ?)
      `,
    );

    insertChipLevel.run(chipPeakRunId, "000001.SZ", 1, "20260060", 36.2, 6.5);
    insertChipLevel.run(chipPeakRunId, "000001.SZ", 2, "20260060", 35.8, 4.2);
    insertChipLevel.run(chipPeakRunId, "000001.SZ", 3, "20260060", 37.1, 3.1);
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
    const chipDistributionRunId = Number(
      db
        .prepare(
          `
          insert into chip_distribution_runs
            (
              screening_run_id, status, created_at, total_targets,
              success_count, blocked_count, failed_count, missing_count,
              skipped_complete_count
            )
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          screeningRunId,
          "partial",
          iso("2026-06-23T00:04:30.000Z"),
          4,
          2,
          2,
          0,
          0,
          0,
        ).lastInsertRowid,
    );
    const insertDistributionLevel = db.prepare(
      `
      insert into chip_distribution_levels
        (ts_code, trade_date, price, percent, fetched_at)
      values (?, ?, ?, ?, ?)
      `,
    );

    insertDistributionLevel.run(
      "000001.SZ",
      "20260060",
      36.2,
      6.5,
      updatedAt,
    );
    insertDistributionLevel.run(
      "000001.SZ",
      "20260060",
      35.8,
      4.2,
      updatedAt,
    );
    insertDistributionLevel.run(
      "000001.SZ",
      "20260060",
      37.1,
      3.1,
      updatedAt,
    );
    insertDistributionLevel.run(
      "000001.SZ",
      "20260059",
      35.9,
      5.5,
      updatedAt,
    );
    insertDistributionLevel.run(
      "000001.SZ",
      "20260059",
      36.4,
      4.4,
      updatedAt,
    );
    const insertDistributionStatus = db.prepare(
      `
      insert into chip_distribution_statuses
        (
          chip_distribution_run_id, screening_run_id, ts_code, target_kind,
          trade_date, status, source, error_category, error_summary, updated_at
        )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    insertDistributionStatus.run(
      chipDistributionRunId,
      screeningRunId,
      "000001.SZ",
      "latest",
      "20260060",
      "succeeded",
      "cyq_chips_highest_percent",
      null,
      null,
      updatedAt,
    );
    insertDistributionStatus.run(
      chipDistributionRunId,
      screeningRunId,
      "000001.SZ",
      "previous",
      "20260059",
      "succeeded",
      "cyq_chips_highest_percent",
      null,
      null,
      updatedAt,
    );
    insertDistributionStatus.run(
      chipDistributionRunId,
      screeningRunId,
      "000002.SZ",
      "latest",
      "20260060",
      "blocked",
      null,
      "permission_denied",
      "chip distribution endpoint permission denied",
      updatedAt,
    );
    insertDistributionStatus.run(
      chipDistributionRunId,
      screeningRunId,
      "000002.SZ",
      "previous",
      "20260059",
      "blocked",
      null,
      "empty_data",
      "cyq_chips returned no distribution rows for previous trade date",
      updatedAt,
    );

    const chipModelRunId = Number(
      db
        .prepare(
          `
          insert into chip_model_runs
            (
              screening_run_id, status, created_at, total_targets,
              success_count, blocked_count, failed_count, missing_count,
              skipped_complete_count
            )
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          screeningRunId,
          "partial",
          iso("2026-06-23T00:05:00.000Z"),
          6,
          3,
          3,
          0,
          0,
          0,
        ).lastInsertRowid,
    );
    const insertModelLevel = db.prepare(
      `
      insert into chip_model_levels
        (
          ts_code, target_trade_date, seed_trade_date, decay_coefficient,
          model_version, price, percent, calculated_at
        )
      values (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    insertModelLevel.run(
      "000001.SZ",
      "20260060",
      "20260001",
      0.5,
      CHIP_MODEL_VERSION,
      31,
      8,
      updatedAt,
    );
    insertModelLevel.run(
      "000001.SZ",
      "20260060",
      "20260001",
      0.5,
      CHIP_MODEL_VERSION,
      32,
      4,
      updatedAt,
    );
    insertModelLevel.run(
      "000001.SZ",
      "20260059",
      "20260000",
      0.5,
      CHIP_MODEL_VERSION,
      30,
      7,
      updatedAt,
    );
    insertModelLevel.run(
      "000001.SZ",
      "20260059",
      "20260000",
      0.5,
      CHIP_MODEL_VERSION,
      31,
      5,
      updatedAt,
    );
    insertModelLevel.run(
      "000001.SZ",
      "20260060",
      "20260001",
      1,
      CHIP_MODEL_VERSION,
      28,
      10,
      updatedAt,
    );
    insertModelLevel.run(
      "000001.SZ",
      "20260060",
      "20260001",
      1,
      CHIP_MODEL_VERSION,
      29,
      3,
      updatedAt,
    );
    const insertModelStatus = db.prepare(
      `
      insert into chip_model_statuses
        (
          chip_model_run_id, screening_run_id, ts_code, target_kind,
          target_trade_date, seed_trade_date, decay_coefficient, model_version,
          status, unavailable_reason, error_category, error_summary, updated_at
        )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    insertModelStatus.run(
      chipModelRunId,
      screeningRunId,
      "000001.SZ",
      "latest",
      "20260060",
      "20260001",
      0.5,
      CHIP_MODEL_VERSION,
      "succeeded",
      null,
      null,
      null,
      updatedAt,
    );
    insertModelStatus.run(
      chipModelRunId,
      screeningRunId,
      "000001.SZ",
      "previous",
      "20260059",
      "20260000",
      0.5,
      CHIP_MODEL_VERSION,
      "succeeded",
      null,
      null,
      null,
      updatedAt,
    );
    insertModelStatus.run(
      chipModelRunId,
      screeningRunId,
      "000001.SZ",
      "latest",
      "20260060",
      "20260001",
      1,
      CHIP_MODEL_VERSION,
      "succeeded",
      null,
      null,
      null,
      updatedAt,
    );
    insertModelStatus.run(
      chipModelRunId,
      screeningRunId,
      "000001.SZ",
      "previous",
      "20260059",
      "20260000",
      1,
      CHIP_MODEL_VERSION,
      "blocked",
      "missing_turnover_rate",
      "empty_data",
      "calculated distribution missing turnover rate for previous target",
      updatedAt,
    );
    insertModelStatus.run(
      chipModelRunId,
      screeningRunId,
      "000002.SZ",
      "latest",
      "20260060",
      "20260001",
      0.5,
      CHIP_MODEL_VERSION,
      "blocked",
      "missing_turnover_rate",
      "empty_data",
      "calculated distribution missing turnover rate for latest target",
      updatedAt,
    );
    insertModelStatus.run(
      chipModelRunId,
      screeningRunId,
      "000002.SZ",
      "previous",
      "20260059",
      "20260000",
      0.5,
      CHIP_MODEL_VERSION,
      "blocked",
      "missing_seed_distribution",
      "empty_data",
      "calculated seed distribution is unavailable for previous target",
      updatedAt,
    );
  } finally {
    db.close();
  }
}
