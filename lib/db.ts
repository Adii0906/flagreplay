import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { dbPath } from "./env";

const g = globalThis as unknown as { __flagreplayDb?: Database.Database };

export function db(): Database.Database {
  if (g.__flagreplayDb) return g.__flagreplayDb;
  const file = path.resolve(/*turbopackIgnore: true*/ process.cwd(), dbPath());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new Database(file);
  conn.pragma("journal_mode = WAL");
  conn.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      env_key TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      hash TEXT NOT NULL,
      source TEXT NOT NULL,
      config TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_env ON snapshots(env_key, captured_at);
    CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      env_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      incident TEXT NOT NULL,
      status TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_investigations_mode ON investigations(mode, created_at);
    CREATE TABLE IF NOT EXISTS recoveries (
      id TEXT PRIMARY KEY,
      investigation_id TEXT NOT NULL,
      action_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      pre_snapshot_id TEXT,
      post_snapshot_id TEXT,
      result TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      received_at TEXT NOT NULL,
      event_type TEXT NOT NULL,
      environment_api_key TEXT,
      payload TEXT NOT NULL
    );
  `);
  g.__flagreplayDb = conn;
  return conn;
}
