import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type {
  CalculatedChipDistributionKey,
  CalculatedChipDistributionWorkItem,
  CalculatedChipDistributionWorkPlan,
  CalculatedChipDistributionWorkTarget,
  CalculatedChipModelRunRecord,
  CalculatedChipModelStatusRecord,
  ChipCalculatedDistributionLevel,
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

type CalculatedLevelRow = {
  price: number;
  percent: number;
};

type CalculatedRunRow = {
  id: number;
  screening_run_id: number;
  status: CalculatedChipModelRunRecord["status"];
  created_at: string;
  total_targets: number;
  success_count: number;
  blocked_count: number;
  failed_count: number;
  missing_count: number;
  skipped_complete_count: number;
};

type CalculatedStatusRow = {
  chip_model_run_id: number;
  screening_run_id: number;
  ts_code: string;
  target_kind: CalculatedChipModelStatusRecord["targetKind"];
  target_trade_date: string | null;
  seed_trade_date: string | null;
  decay_coefficient: number;
  model_version: CalculatedChipModelStatusRecord["modelVersion"];
  status: CalculatedChipModelStatusRecord["status"];
  unavailable_reason: CalculatedChipModelStatusRecord["unavailableReason"];
  error_category: CalculatedChipModelStatusRecord["errorCategory"];
  error_summary: string | null;
  updated_at: string;
};

type CountRow = {
  count: number;
};

export type ReplaceCalculatedChipDistributionInput =
  CalculatedChipDistributionKey & {
    levels: ChipCalculatedDistributionLevel[];
    now?: Date;
  };

export type ReplaceChipModelSeedSnapshotInput = Omit<
  CalculatedChipDistributionKey,
  "decayCoefficient"
> & {
  levels: ChipCalculatedDistributionLevel[];
  now?: Date;
};

export type WriteCalculatedChipModelRunInput = {
  screeningRunId: number;
  status: CalculatedChipModelRunRecord["status"];
  totalTargets: number;
  successCount: number;
  blockedCount: number;
  failedCount: number;
  missingCount: number;
  skippedCompleteCount?: number;
  statuses: Array<
    Omit<CalculatedChipModelStatusRecord, "chipModelRunId" | "updatedAt">
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

function openDatabase() {
  const dbPath = getDatabasePath();
  const dir = path.dirname(dbPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  db.exec(`
    create table if not exists chip_model_runs (
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

    create index if not exists chip_model_runs_screening_run_id
      on chip_model_runs(screening_run_id, id);

    create table if not exists chip_model_statuses (
      id integer primary key autoincrement,
      chip_model_run_id integer not null,
      screening_run_id integer not null,
      ts_code text not null,
      target_kind text not null check (target_kind in ('latest', 'previous')),
      target_trade_date text,
      seed_trade_date text,
      decay_coefficient real not null,
      model_version text not null,
      status text not null check (status in ('succeeded', 'blocked', 'failed', 'missing')),
      unavailable_reason text check (
        unavailable_reason is null or
        unavailable_reason in (
          'missing_seed_distribution',
          'missing_trade_data',
          'missing_turnover_rate',
          'missing_adjustment_factor',
          'invalid_trade_date_range'
        )
      ),
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
      foreign key (chip_model_run_id) references chip_model_runs(id)
    );

    create index if not exists chip_model_status_lookup
      on chip_model_statuses(
        ts_code,
        target_trade_date,
        seed_trade_date,
        decay_coefficient,
        model_version,
        chip_model_run_id
      );

    create table if not exists chip_model_levels (
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

    create index if not exists chip_model_levels_target_lookup
      on chip_model_levels(ts_code, target_trade_date, seed_trade_date);

    create table if not exists chip_model_seed_snapshots (
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

  return db;
}

function mapRun(row: CalculatedRunRow): CalculatedChipModelRunRecord {
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

function mapStatus(row: CalculatedStatusRow): CalculatedChipModelStatusRecord {
  return {
    chipModelRunId: row.chip_model_run_id,
    screeningRunId: row.screening_run_id,
    tsCode: row.ts_code,
    targetKind: row.target_kind,
    targetTradeDate: row.target_trade_date,
    seedTradeDate: row.seed_trade_date,
    decayCoefficient:
      row.decay_coefficient as CalculatedChipModelStatusRecord["decayCoefficient"],
    modelVersion: row.model_version,
    status: row.status,
    unavailableReason: row.unavailable_reason,
    errorCategory: row.error_category,
    errorSummary: row.error_summary,
    updatedAt: row.updated_at,
  };
}

function mapLevel(row: CalculatedLevelRow): ChipCalculatedDistributionLevel {
  return {
    price: row.price,
    percent: row.percent,
  };
}

function assertFiniteLevel(level: ChipCalculatedDistributionLevel) {
  if (!Number.isFinite(level.price)) {
    throw new Error("invalid_calculated_chip_price");
  }

  if (!Number.isFinite(level.percent)) {
    throw new Error("invalid_calculated_chip_percent");
  }
}

function calculatedLevelCountInDatabase(
  db: DatabaseConnection,
  key: CalculatedChipDistributionKey,
) {
  const row = db
    .prepare(
      `
      select count(*) as count
      from chip_model_levels
      where ts_code = ?
        and target_trade_date = ?
        and seed_trade_date = ?
        and decay_coefficient = ?
        and model_version = ?
      `,
    )
    .get(
      key.tsCode,
      key.targetTradeDate,
      key.seedTradeDate,
      key.decayCoefficient,
      key.modelVersion,
    ) as CountRow;

  return Number(row.count ?? 0);
}

function statusKey(
  target: CalculatedChipDistributionWorkTarget,
): CalculatedChipDistributionKey | null {
  if (target.targetTradeDate === null || target.seedTradeDate === null) {
    return null;
  }

  return {
    tsCode: target.tsCode,
    targetTradeDate: target.targetTradeDate,
    seedTradeDate: target.seedTradeDate,
    decayCoefficient: target.decayCoefficient,
    modelVersion: target.modelVersion,
  };
}

function readLatestStatusInDatabase(
  db: DatabaseConnection,
  target: CalculatedChipDistributionWorkTarget,
) {
  const key = statusKey(target);

  if (key === null) {
    return null;
  }

  const row = db
    .prepare(
      `
      select *
      from chip_model_statuses
      where ts_code = ?
        and target_trade_date = ?
        and seed_trade_date = ?
        and decay_coefficient = ?
        and model_version = ?
      order by chip_model_run_id desc, updated_at desc
      limit 1
      `,
    )
    .get(
      key.tsCode,
      key.targetTradeDate,
      key.seedTradeDate,
      key.decayCoefficient,
      key.modelVersion,
    ) as CalculatedStatusRow | undefined;

  return row ? mapStatus(row) : null;
}

function assertSucceededStatusHasLevels(
  db: DatabaseConnection,
  record: Omit<CalculatedChipModelStatusRecord, "chipModelRunId" | "updatedAt">,
) {
  if (record.status !== "succeeded") {
    return;
  }

  const key = statusKey(record);

  if (key === null) {
    throw new Error("succeeded_calculated_chip_requires_target_and_seed");
  }

  if (calculatedLevelCountInDatabase(db, key) === 0) {
    throw new Error("succeeded_calculated_chip_requires_levels");
  }
}

export function replaceCalculatedChipDistribution({
  levels,
  now = new Date(),
  ...key
}: ReplaceCalculatedChipDistributionInput) {
  const db = openDatabase();

  try {
    db.exec("begin");
    const calculatedAt = toIsoString(now);

    db.prepare(
      `
      delete from chip_model_levels
      where ts_code = ?
        and target_trade_date = ?
        and seed_trade_date = ?
        and decay_coefficient = ?
        and model_version = ?
      `,
    ).run(
      key.tsCode,
      key.targetTradeDate,
      key.seedTradeDate,
      key.decayCoefficient,
      key.modelVersion,
    );

    const insertLevel = db.prepare(
      `
      insert into chip_model_levels
        (
          ts_code,
          target_trade_date,
          seed_trade_date,
          decay_coefficient,
          model_version,
          price,
          percent,
          calculated_at
        )
      values (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    for (const level of levels) {
      assertFiniteLevel(level);
      insertLevel.run(
        key.tsCode,
        key.targetTradeDate,
        key.seedTradeDate,
        key.decayCoefficient,
        key.modelVersion,
        level.price,
        level.percent,
        calculatedAt,
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

export function readCalculatedChipDistribution(
  key: CalculatedChipDistributionKey,
): ChipCalculatedDistributionLevel[] {
  const db = openDatabase();

  try {
    return (
      db
        .prepare(
          `
          select price, percent
          from chip_model_levels
          where ts_code = ?
            and target_trade_date = ?
            and seed_trade_date = ?
            and decay_coefficient = ?
            and model_version = ?
          order by price asc
          `,
        )
        .all(
          key.tsCode,
          key.targetTradeDate,
          key.seedTradeDate,
          key.decayCoefficient,
          key.modelVersion,
        ) as CalculatedLevelRow[]
    ).map(mapLevel);
  } finally {
    db.close();
  }
}

export function replaceChipModelSeedSnapshot({
  levels,
  now = new Date(),
  ...key
}: ReplaceChipModelSeedSnapshotInput) {
  const db = openDatabase();

  try {
    db.exec("begin");
    const calculatedAt = toIsoString(now);

    db.prepare(
      `
      delete from chip_model_seed_snapshots
      where ts_code = ?
        and target_trade_date = ?
        and seed_trade_date = ?
        and model_version = ?
      `,
    ).run(
      key.tsCode,
      key.targetTradeDate,
      key.seedTradeDate,
      key.modelVersion,
    );

    const insertLevel = db.prepare(
      `
      insert into chip_model_seed_snapshots
        (
          ts_code,
          target_trade_date,
          seed_trade_date,
          model_version,
          price,
          percent,
          calculated_at
        )
      values (?, ?, ?, ?, ?, ?, ?)
      `,
    );

    for (const level of levels) {
      assertFiniteLevel(level);
      insertLevel.run(
        key.tsCode,
        key.targetTradeDate,
        key.seedTradeDate,
        key.modelVersion,
        level.price,
        level.percent,
        calculatedAt,
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

export function readChipModelSeedSnapshot(
  key: Omit<CalculatedChipDistributionKey, "decayCoefficient">,
): ChipCalculatedDistributionLevel[] {
  const db = openDatabase();

  try {
    return (
      db
        .prepare(
          `
          select price, percent
          from chip_model_seed_snapshots
          where ts_code = ?
            and target_trade_date = ?
            and seed_trade_date = ?
            and model_version = ?
          order by price asc
          `,
        )
        .all(
          key.tsCode,
          key.targetTradeDate,
          key.seedTradeDate,
          key.modelVersion,
        ) as CalculatedLevelRow[]
    ).map(mapLevel);
  } finally {
    db.close();
  }
}

export function writeCalculatedChipModelRun({
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
}: WriteCalculatedChipModelRunInput): CalculatedChipModelRunRecord {
  const db = openDatabase();

  try {
    db.exec("begin");
    const createdAt = toIsoString(now);
    const insertRun = db
      .prepare(
        `
        insert into chip_model_runs
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
    const chipModelRunId = Number(insertRun.lastInsertRowid);
    const insertStatus = db.prepare(
      `
      insert into chip_model_statuses
        (
          chip_model_run_id,
          screening_run_id,
          ts_code,
          target_kind,
          target_trade_date,
          seed_trade_date,
          decay_coefficient,
          model_version,
          status,
          unavailable_reason,
          error_category,
          error_summary,
          updated_at
        )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    for (const statusRecord of statuses) {
      assertSucceededStatusHasLevels(db, statusRecord);
      insertStatus.run(
        chipModelRunId,
        statusRecord.screeningRunId,
        statusRecord.tsCode,
        statusRecord.targetKind,
        statusRecord.targetTradeDate,
        statusRecord.seedTradeDate,
        statusRecord.decayCoefficient,
        statusRecord.modelVersion,
        statusRecord.status,
        statusRecord.unavailableReason,
        statusRecord.errorCategory,
        statusRecord.errorSummary,
        createdAt,
      );
    }

    db.exec("commit");

    return {
      id: chipModelRunId,
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

export function readCalculatedChipModelStatusesForRun(
  chipModelRunId: number,
): CalculatedChipModelStatusRecord[] {
  const db = openDatabase();

  try {
    return (
      db
        .prepare(
          `
          select *
          from chip_model_statuses
          where chip_model_run_id = ?
          order by ts_code asc, target_kind asc, decay_coefficient asc
          `,
        )
        .all(chipModelRunId) as CalculatedStatusRow[]
    ).map(mapStatus);
  } finally {
    db.close();
  }
}

export function readLatestCalculatedChipModelRun(
  screeningRunId?: number,
): CalculatedChipModelRunRecord | null {
  const db = openDatabase();

  try {
    const row =
      screeningRunId === undefined
        ? (db
            .prepare("select * from chip_model_runs order by id desc limit 1")
            .get() as CalculatedRunRow | undefined)
        : (db
            .prepare(
              `
              select *
              from chip_model_runs
              where screening_run_id = ?
              order by id desc
              limit 1
              `,
            )
            .get(screeningRunId) as CalculatedRunRow | undefined);

    return row ? mapRun(row) : null;
  } finally {
    db.close();
  }
}

export function isCalculatedChipDistributionComplete(
  target: CalculatedChipDistributionWorkTarget,
) {
  const db = openDatabase();

  try {
    const key = statusKey(target);
    const latestStatus = readLatestStatusInDatabase(db, target);

    return (
      key !== null &&
      latestStatus?.status === "succeeded" &&
      calculatedLevelCountInDatabase(db, key) > 0
    );
  } finally {
    db.close();
  }
}

export function planCalculatedChipDistributionWork(
  targets: CalculatedChipDistributionWorkTarget[],
): CalculatedChipDistributionWorkPlan {
  const db = openDatabase();
  const items: CalculatedChipDistributionWorkItem[] = [];
  const skippedCompleteTargets: CalculatedChipDistributionWorkTarget[] = [];
  const blockedTargets: CalculatedChipDistributionWorkTarget[] = [];
  const missingTargets: CalculatedChipDistributionWorkTarget[] = [];
  let failedRetryCount = 0;
  let pendingCount = 0;

  try {
    for (const target of targets) {
      const key = statusKey(target);

      if (key === null) {
        missingTargets.push(target);
        continue;
      }

      const latestStatus = readLatestStatusInDatabase(db, target);

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
        if (calculatedLevelCountInDatabase(db, key) > 0) {
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
