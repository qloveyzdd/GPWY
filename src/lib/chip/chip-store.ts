import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type {
  ChipPeakResultRecord,
  ChipPeakRunRecord,
} from "@/lib/chip/chip-types";

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

type ChipPeakRunRow = {
  id: number;
  screening_run_id: number;
  status: ChipPeakRunRecord["status"];
  created_at: string;
  total_candidates: number;
  success_count: number;
  blocked_count: number;
  failed_count: number;
};

type ChipPeakResultRow = {
  chip_peak_run_id: number;
  screening_run_id: number;
  ts_code: string;
  status: ChipPeakResultRecord["status"];
  trade_date: string | null;
  chip_peak_price: number | null;
  peak_percent: number | null;
  source: ChipPeakResultRecord["source"];
  error_category: ChipPeakResultRecord["errorCategory"];
  error_summary: string | null;
};

export type WriteChipPeakRunInput = {
  screeningRunId: number;
  status: ChipPeakRunRecord["status"];
  totalCandidates: number;
  successCount: number;
  blockedCount: number;
  failedCount: number;
  results: Omit<ChipPeakResultRecord, "chipPeakRunId">[];
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
    create table if not exists chip_peak_runs (
      id integer primary key autoincrement,
      screening_run_id integer not null,
      status text not null check (status in ('succeeded', 'partial', 'blocked', 'failed')),
      created_at text not null,
      total_candidates integer not null,
      success_count integer not null,
      blocked_count integer not null,
      failed_count integer not null
    );

    create table if not exists chip_peak_results (
      chip_peak_run_id integer not null,
      screening_run_id integer not null,
      ts_code text not null,
      status text not null check (status in ('succeeded', 'blocked', 'failed')),
      trade_date text,
      chip_peak_price real,
      peak_percent real,
      source text check (source is null or source in ('cyq_chips_highest_percent')),
      error_category text check (
        error_category is null or
        error_category in (
          'missing_config',
          'invalid_token',
          'permission_denied',
          'empty_data',
          'rate_limited',
          'network_or_service',
          'unknown'
        )
      ),
      error_summary text,
      primary key (chip_peak_run_id, ts_code),
      foreign key (chip_peak_run_id) references chip_peak_runs(id)
    );
  `);

  return db;
}

function mapRun(row: ChipPeakRunRow): ChipPeakRunRecord {
  return {
    id: row.id,
    screeningRunId: row.screening_run_id,
    status: row.status,
    createdAt: row.created_at,
    totalCandidates: row.total_candidates,
    successCount: row.success_count,
    blockedCount: row.blocked_count,
    failedCount: row.failed_count,
  };
}

function mapResult(row: ChipPeakResultRow): ChipPeakResultRecord {
  return {
    chipPeakRunId: row.chip_peak_run_id,
    screeningRunId: row.screening_run_id,
    tsCode: row.ts_code,
    status: row.status,
    tradeDate: row.trade_date,
    chipPeakPrice: row.chip_peak_price,
    peakPercent: row.peak_percent,
    source: row.source,
    errorCategory: row.error_category,
    errorSummary: row.error_summary,
  };
}

export function writeChipPeakRun({
  screeningRunId,
  status,
  totalCandidates,
  successCount,
  blockedCount,
  failedCount,
  results,
  now = new Date(),
}: WriteChipPeakRunInput): ChipPeakRunRecord {
  const db = openDatabase();

  try {
    db.exec("begin");
    const createdAt = toIsoString(now);
    const insertRun = db
      .prepare(
        `
        insert into chip_peak_runs
          (
            screening_run_id,
            status,
            created_at,
            total_candidates,
            success_count,
            blocked_count,
            failed_count
          )
        values (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        screeningRunId,
        status,
        createdAt,
        totalCandidates,
        successCount,
        blockedCount,
        failedCount,
      );
    const chipPeakRunId = Number(insertRun.lastInsertRowid);
    const insertResult = db.prepare(
      `
      insert into chip_peak_results
        (
          chip_peak_run_id,
          screening_run_id,
          ts_code,
          status,
          trade_date,
          chip_peak_price,
          peak_percent,
          source,
          error_category,
          error_summary
        )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    for (const result of results) {
      insertResult.run(
        chipPeakRunId,
        result.screeningRunId,
        result.tsCode,
        result.status,
        result.tradeDate,
        result.chipPeakPrice,
        result.peakPercent,
        result.source,
        result.errorCategory,
        result.errorSummary,
      );
    }

    db.exec("commit");

    return {
      id: chipPeakRunId,
      screeningRunId,
      status,
      createdAt,
      totalCandidates,
      successCount,
      blockedCount,
      failedCount,
    };
  } catch (error) {
    db.exec("rollback");
    throw error;
  } finally {
    db.close();
  }
}

export function readLatestChipPeakRun(): ChipPeakRunRecord | null {
  const db = openDatabase();

  try {
    const row = db
      .prepare("select * from chip_peak_runs order by id desc limit 1")
      .get() as ChipPeakRunRow | undefined;

    return row ? mapRun(row) : null;
  } finally {
    db.close();
  }
}

export function readLatestChipPeakResults(): ChipPeakResultRecord[] {
  const latestRun = readLatestChipPeakRun();

  if (!latestRun) {
    return [];
  }

  const db = openDatabase();

  try {
    return (
      db
        .prepare(
          `
          select *
          from chip_peak_results
          where chip_peak_run_id = ?
          order by ts_code asc
          `,
        )
        .all(latestRun.id) as ChipPeakResultRow[]
    ).map(mapResult);
  } finally {
    db.close();
  }
}
