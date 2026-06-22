import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import {
  EMPTY_VALIDATION_SNAPSHOT,
  type ValidationSnapshot,
} from "@/lib/validation-types";

type Statement = {
  get: (...params: unknown[]) => unknown;
  run: (...params: unknown[]) => unknown;
};

type DatabaseConnection = {
  exec: (sql: string) => void;
  prepare: (sql: string) => Statement;
  close: () => void;
};

type DatabaseConstructor = new (filePath: string) => DatabaseConnection;

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3") as DatabaseConstructor;

function getDatabasePath() {
  return (
    process.env.VALIDATION_DB_PATH ??
    path.join(process.cwd(), ".data", "validation.sqlite")
  );
}

function openDatabase() {
  const dbPath = getDatabasePath();
  const dir = path.dirname(dbPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.exec(`
    create table if not exists validation_snapshots (
      id integer primary key autoincrement,
      created_at text not null,
      snapshot_json text not null
    )
  `);

  return db;
}

export function readLatestValidationSnapshot(): ValidationSnapshot {
  const db = openDatabase();

  try {
    const row = db
      .prepare(
        "select snapshot_json from validation_snapshots order by id desc limit 1",
      )
      .get() as { snapshot_json?: string } | undefined;

    if (!row?.snapshot_json) {
      return EMPTY_VALIDATION_SNAPSHOT;
    }

    return JSON.parse(row.snapshot_json) as ValidationSnapshot;
  } catch {
    return EMPTY_VALIDATION_SNAPSHOT;
  } finally {
    db.close();
  }
}

export function writeValidationSnapshot(snapshot: ValidationSnapshot) {
  const db = openDatabase();

  try {
    db.prepare(
      "insert into validation_snapshots (created_at, snapshot_json) values (?, ?)",
    ).run(new Date().toISOString(), JSON.stringify(snapshot));

    return snapshot;
  } finally {
    db.close();
  }
}
