import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type {
  ChipDistributionLevel,
  ChipDistributionRunRecord,
  ChipDistributionStatusRecord,
  ChipDistributionTarget,
  ChipDistributionWorkItem,
  ChipDistributionWorkPlan,
  ChipPeakLevel,
  ChipPeakResultRecord,
  ChipPeakRunRecord,
} from "@/lib/chip/chip-types";

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

type ChipPeakLevelRow = {
  chip_peak_run_id: number;
  ts_code: string;
  peak_rank: number;
  trade_date: string;
  price: number;
  percent: number;
};

type ChipDistributionRunRow = {
  id: number;
  screening_run_id: number;
  status: ChipDistributionRunRecord["status"];
  created_at: string;
  total_targets: number;
  success_count: number;
  blocked_count: number;
  failed_count: number;
  missing_count: number;
  skipped_complete_count: number;
};

type ChipDistributionStatusRow = {
  chip_distribution_run_id: number;
  screening_run_id: number;
  ts_code: string;
  target_kind: ChipDistributionStatusRecord["targetKind"];
  trade_date: string | null;
  status: ChipDistributionStatusRecord["status"];
  source: ChipDistributionStatusRecord["source"];
  error_category: ChipDistributionStatusRecord["errorCategory"];
  error_summary: string | null;
  updated_at: string;
};

type ChipDistributionLevelRow = {
  ts_code: string;
  trade_date: string;
  price: number;
  percent: number;
};

type CountRow = {
  count: number;
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

export type ReplaceChipDistributionInput = {
  tsCode: string;
  tradeDate: string;
  levels: Array<Pick<ChipDistributionLevel, "price" | "percent">>;
  now?: Date;
};

export type UpsertChipDistributionStatusInput = Omit<
  ChipDistributionStatusRecord,
  "updatedAt"
> & {
  now?: Date;
};

export type WriteChipDistributionRunInput = {
  screeningRunId: number;
  status: ChipDistributionRunRecord["status"];
  totalTargets: number;
  successCount: number;
  blockedCount: number;
  failedCount: number;
  missingCount: number;
  skippedCompleteCount?: number;
  statuses: Array<
    Omit<ChipDistributionStatusRecord, "chipDistributionRunId" | "updatedAt">
  >;
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

function assertFiniteNumber(value: number, errorCode: string) {
  if (!Number.isFinite(value)) {
    throw new Error(errorCode);
  }
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

    create table if not exists chip_peak_levels (
      chip_peak_run_id integer not null,
      ts_code text not null,
      peak_rank integer not null check (peak_rank between 1 and 3),
      trade_date text not null,
      price real not null,
      percent real not null,
      primary key (chip_peak_run_id, ts_code, peak_rank),
      foreign key (chip_peak_run_id) references chip_peak_runs(id)
    );

    create table if not exists chip_distribution_runs (
      id integer primary key autoincrement,
      screening_run_id integer not null,
      status text not null check (status in ('succeeded', 'partial', 'blocked', 'failed')),
      created_at text not null,
      total_targets integer not null,
      success_count integer not null,
      blocked_count integer not null,
      failed_count integer not null,
      missing_count integer not null,
      skipped_complete_count integer not null default 0
    );

    create index if not exists chip_distribution_runs_screening_run_id
      on chip_distribution_runs(screening_run_id, id);

    create table if not exists chip_distribution_statuses (
      chip_distribution_run_id integer not null,
      screening_run_id integer not null,
      ts_code text not null,
      target_kind text not null check (target_kind in ('latest', 'previous')),
      trade_date text,
      status text not null check (status in ('succeeded', 'blocked', 'failed', 'missing')),
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
      updated_at text not null,
      primary key (chip_distribution_run_id, ts_code, target_kind)
    );

    create index if not exists chip_distribution_statuses_target_lookup
      on chip_distribution_statuses(ts_code, trade_date, chip_distribution_run_id);

    create table if not exists chip_distribution_levels (
      ts_code text not null,
      trade_date text not null,
      price real not null,
      percent real not null,
      fetched_at text not null,
      primary key (ts_code, trade_date, price)
    );

    create index if not exists chip_distribution_levels_target_lookup
      on chip_distribution_levels(ts_code, trade_date);
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

function mapResult(
  row: ChipPeakResultRow,
  peaks: ChipPeakLevel[],
): ChipPeakResultRecord {
  return {
    chipPeakRunId: row.chip_peak_run_id,
    screeningRunId: row.screening_run_id,
    tsCode: row.ts_code,
    status: row.status,
    tradeDate: row.trade_date,
    chipPeakPrice: row.chip_peak_price,
    peakPercent: row.peak_percent,
    source: row.source,
    peaks,
    errorCategory: row.error_category,
    errorSummary: row.error_summary,
  };
}

function mapDistributionRun(
  row: ChipDistributionRunRow,
): ChipDistributionRunRecord {
  return {
    id: row.id,
    screeningRunId: row.screening_run_id,
    status: row.status,
    createdAt: row.created_at,
    totalTargets: row.total_targets,
    successCount: row.success_count,
    blockedCount: row.blocked_count,
    failedCount: row.failed_count,
    missingCount: row.missing_count,
    skippedCompleteCount: row.skipped_complete_count,
  };
}

function mapDistributionStatus(
  row: ChipDistributionStatusRow,
): ChipDistributionStatusRecord {
  return {
    chipDistributionRunId: row.chip_distribution_run_id,
    screeningRunId: row.screening_run_id,
    tsCode: row.ts_code,
    targetKind: row.target_kind,
    tradeDate: row.trade_date,
    status: row.status,
    source: row.source,
    errorCategory: row.error_category,
    errorSummary: row.error_summary,
    updatedAt: row.updated_at,
  };
}

function mapDistributionLevel(
  row: ChipDistributionLevelRow,
): ChipDistributionLevel {
  return {
    tsCode: row.ts_code,
    tradeDate: row.trade_date,
    price: row.price,
    percent: row.percent,
  };
}

function countDistributionLevelsInDatabase(
  db: DatabaseConnection,
  tsCode: string,
  tradeDate: string,
) {
  const row = db
    .prepare(
      `
      select count(*) as count
      from chip_distribution_levels
      where ts_code = ? and trade_date = ?
      `,
    )
    .get(tsCode, tradeDate) as CountRow;

  return Number(row.count ?? 0);
}

function readLatestDistributionStatusInDatabase(
  db: DatabaseConnection,
  target: Pick<ChipDistributionTarget, "tsCode" | "tradeDate">,
) {
  if (target.tradeDate === null) {
    return null;
  }

  const row = db
    .prepare(
      `
      select *
      from chip_distribution_statuses
      where ts_code = ? and trade_date = ?
      order by chip_distribution_run_id desc, updated_at desc
      limit 1
      `,
    )
    .get(target.tsCode, target.tradeDate) as
    | ChipDistributionStatusRow
    | undefined;

  return row ? mapDistributionStatus(row) : null;
}

function assertSucceededStatusHasLevels(
  db: DatabaseConnection,
  record: Omit<ChipDistributionStatusRecord, "updatedAt">,
) {
  if (record.status !== "succeeded") {
    return;
  }

  if (record.tradeDate === null) {
    throw new Error("succeeded_chip_distribution_requires_trade_date");
  }

  if (
    countDistributionLevelsInDatabase(db, record.tsCode, record.tradeDate) === 0
  ) {
    throw new Error("succeeded_chip_distribution_requires_levels");
  }
}

function upsertChipDistributionStatusInDatabase(
  db: DatabaseConnection,
  record: Omit<ChipDistributionStatusRecord, "updatedAt">,
  updatedAt: string,
) {
  assertSucceededStatusHasLevels(db, record);
  db.prepare(
    `
    insert into chip_distribution_statuses
      (
        chip_distribution_run_id,
        screening_run_id,
        ts_code,
        target_kind,
        trade_date,
        status,
        source,
        error_category,
        error_summary,
        updated_at
      )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(chip_distribution_run_id, ts_code, target_kind) do update set
      screening_run_id = excluded.screening_run_id,
      trade_date = excluded.trade_date,
      status = excluded.status,
      source = excluded.source,
      error_category = excluded.error_category,
      error_summary = excluded.error_summary,
      updated_at = excluded.updated_at
    `,
  ).run(
    record.chipDistributionRunId,
    record.screeningRunId,
    record.tsCode,
    record.targetKind,
    record.tradeDate,
    record.status,
    record.source,
    record.errorCategory,
    record.errorSummary,
    updatedAt,
  );
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
    const insertLevel = db.prepare(
      `
      insert into chip_peak_levels
        (chip_peak_run_id, ts_code, peak_rank, trade_date, price, percent)
      values (?, ?, ?, ?, ?, ?)
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

      for (const peak of result.peaks) {
        insertLevel.run(
          chipPeakRunId,
          result.tsCode,
          peak.rank,
          peak.tradeDate,
          peak.price,
          peak.percent,
        );
      }
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

export function readChipPeakResultsForRun(
  chipPeakRunId: number,
): ChipPeakResultRecord[] {
  const db = openDatabase();

  try {
    const resultRows = db
      .prepare(
        `
        select *
        from chip_peak_results
          where chip_peak_run_id = ?
          order by ts_code asc
          `,
      )
      .all(chipPeakRunId) as ChipPeakResultRow[];
    const levelRows = db
      .prepare(
        `
        select *
        from chip_peak_levels
          where chip_peak_run_id = ?
          order by ts_code asc, peak_rank asc
          `,
      )
      .all(chipPeakRunId) as ChipPeakLevelRow[];
    const levelsByCode = new Map<string, ChipPeakLevel[]>();

    for (const level of levelRows) {
      const peaks = levelsByCode.get(level.ts_code) ?? [];
      peaks.push({
        rank: level.peak_rank,
        tradeDate: level.trade_date,
        price: level.price,
        percent: level.percent,
      });
      levelsByCode.set(level.ts_code, peaks);
    }

    return resultRows.map((row) => {
      const storedPeaks = levelsByCode.get(row.ts_code) ?? [];
      const fallbackPeaks =
        storedPeaks.length === 0 &&
        row.status === "succeeded" &&
        row.trade_date !== null &&
        row.chip_peak_price !== null &&
        row.peak_percent !== null
          ? [
              {
                rank: 1,
                tradeDate: row.trade_date,
                price: row.chip_peak_price,
                percent: row.peak_percent,
              },
            ]
          : storedPeaks;

      return mapResult(row, fallbackPeaks);
    });
  } finally {
    db.close();
  }
}

export function readLatestChipPeakResults(): ChipPeakResultRecord[] {
  const latestRun = readLatestChipPeakRun();

  return latestRun ? readChipPeakResultsForRun(latestRun.id) : [];
}

export function replaceChipDistribution({
  tsCode,
  tradeDate,
  levels,
  now = new Date(),
}: ReplaceChipDistributionInput) {
  const db = openDatabase();

  try {
    db.exec("begin");
    const fetchedAt = toIsoString(now);

    db.prepare(
      `
      delete from chip_distribution_levels
      where ts_code = ? and trade_date = ?
      `,
    ).run(tsCode, tradeDate);

    const insertLevel = db.prepare(
      `
      insert into chip_distribution_levels
        (ts_code, trade_date, price, percent, fetched_at)
      values (?, ?, ?, ?, ?)
      `,
    );

    for (const level of levels) {
      assertFiniteNumber(level.price, "invalid_chip_distribution_price");
      assertFiniteNumber(level.percent, "invalid_chip_distribution_percent");
      insertLevel.run(tsCode, tradeDate, level.price, level.percent, fetchedAt);
    }

    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  } finally {
    db.close();
  }
}

export function readChipDistributionForDate(
  tsCode: string,
  tradeDate: string,
): ChipDistributionLevel[] {
  const db = openDatabase();

  try {
    return (
      db
        .prepare(
          `
          select ts_code, trade_date, price, percent
          from chip_distribution_levels
          where ts_code = ? and trade_date = ?
          order by price asc
          `,
        )
        .all(tsCode, tradeDate) as ChipDistributionLevelRow[]
    ).map(mapDistributionLevel);
  } finally {
    db.close();
  }
}

export function isChipDistributionComplete(
  target: Pick<ChipDistributionTarget, "tsCode" | "tradeDate">,
) {
  if (target.tradeDate === null) {
    return false;
  }

  const db = openDatabase();

  try {
    const status = readLatestDistributionStatusInDatabase(db, target);

    return (
      status?.status === "succeeded" &&
      countDistributionLevelsInDatabase(db, target.tsCode, target.tradeDate) > 0
    );
  } finally {
    db.close();
  }
}

export function upsertChipDistributionStatus({
  now = new Date(),
  ...record
}: UpsertChipDistributionStatusInput): ChipDistributionStatusRecord {
  const db = openDatabase();

  try {
    const updatedAt = toIsoString(now);
    upsertChipDistributionStatusInDatabase(db, record, updatedAt);

    return {
      ...record,
      updatedAt,
    };
  } finally {
    db.close();
  }
}

export function writeChipDistributionRun({
  screeningRunId,
  status,
  totalTargets,
  successCount,
  blockedCount,
  failedCount,
  missingCount,
  skippedCompleteCount = 0,
  statuses,
  now = new Date(),
}: WriteChipDistributionRunInput): ChipDistributionRunRecord {
  const db = openDatabase();

  try {
    db.exec("begin");
    const createdAt = toIsoString(now);
    const insertRun = db
      .prepare(
        `
        insert into chip_distribution_runs
          (
            screening_run_id,
            status,
            created_at,
            total_targets,
            success_count,
            blocked_count,
            failed_count,
            missing_count,
            skipped_complete_count
          )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        screeningRunId,
        status,
        createdAt,
        totalTargets,
        successCount,
        blockedCount,
        failedCount,
        missingCount,
        skippedCompleteCount,
      );
    const chipDistributionRunId = Number(insertRun.lastInsertRowid);

    for (const statusRecord of statuses) {
      upsertChipDistributionStatusInDatabase(
        db,
        {
          chipDistributionRunId,
          ...statusRecord,
        },
        createdAt,
      );
    }

    db.exec("commit");

    return {
      id: chipDistributionRunId,
      screeningRunId,
      status,
      createdAt,
      totalTargets,
      successCount,
      blockedCount,
      failedCount,
      missingCount,
      skippedCompleteCount,
    };
  } catch (error) {
    db.exec("rollback");
    throw error;
  } finally {
    db.close();
  }
}

export function readLatestChipDistributionRun(
  screeningRunId?: number,
): ChipDistributionRunRecord | null {
  const db = openDatabase();

  try {
    const row =
      screeningRunId === undefined
        ? (db
            .prepare("select * from chip_distribution_runs order by id desc limit 1")
            .get() as ChipDistributionRunRow | undefined)
        : (db
            .prepare(
              `
              select *
              from chip_distribution_runs
              where screening_run_id = ?
              order by id desc
              limit 1
              `,
            )
            .get(screeningRunId) as ChipDistributionRunRow | undefined);

    return row ? mapDistributionRun(row) : null;
  } finally {
    db.close();
  }
}

export function readChipDistributionStatusesForRun(
  chipDistributionRunId: number,
): ChipDistributionStatusRecord[] {
  const db = openDatabase();

  try {
    return (
      db
        .prepare(
          `
          select *
          from chip_distribution_statuses
          where chip_distribution_run_id = ?
          order by ts_code asc, target_kind asc
          `,
        )
        .all(chipDistributionRunId) as ChipDistributionStatusRow[]
    ).map(mapDistributionStatus);
  } finally {
    db.close();
  }
}

export function planChipDistributionWork(
  targets: ChipDistributionTarget[],
): ChipDistributionWorkPlan {
  const db = openDatabase();
  const items: ChipDistributionWorkItem[] = [];
  const skippedCompleteTargets: ChipDistributionTarget[] = [];
  const blockedTargets: ChipDistributionTarget[] = [];
  const missingTargets: ChipDistributionTarget[] = [];
  let failedRetryCount = 0;
  let pendingCount = 0;

  try {
    for (const target of targets) {
      if (target.tradeDate === null) {
        missingTargets.push(target);
        continue;
      }

      const latestStatus = readLatestDistributionStatusInDatabase(db, target);

      if (!latestStatus) {
        pendingCount += 1;
        items.push({
          ...target,
          currentStatus: null,
          reason: "not_seen",
        });
        continue;
      }

      if (latestStatus.status === "succeeded") {
        if (
          countDistributionLevelsInDatabase(
            db,
            target.tsCode,
            target.tradeDate,
          ) > 0
        ) {
          skippedCompleteTargets.push(target);
          continue;
        }

        pendingCount += 1;
        items.push({
          ...target,
          currentStatus: "succeeded",
          reason: "incomplete_succeeded",
        });
        continue;
      }

      if (latestStatus.status === "failed") {
        failedRetryCount += 1;
        items.push({
          ...target,
          currentStatus: "failed",
          reason: "retry_failed",
        });
        continue;
      }

      if (latestStatus.status === "blocked") {
        blockedTargets.push(target);
        continue;
      }

      missingTargets.push(target);
    }

    return {
      totalTargets: targets.length,
      items,
      skippedCompleteTargets,
      blockedTargets,
      missingTargets,
      skippedCompleteCount: skippedCompleteTargets.length,
      blockedCount: blockedTargets.length,
      missingCount: missingTargets.length,
      failedRetryCount,
      pendingCount,
    };
  } finally {
    db.close();
  }
}
