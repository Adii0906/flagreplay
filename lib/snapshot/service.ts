import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import type { Mode, NormalizedConfig, Snapshot, SnapshotSource } from "../types";
import { configHash } from "./normalize";

interface Row {
  id: string;
  mode: Mode;
  env_key: string;
  captured_at: string;
  hash: string;
  source: SnapshotSource;
  config: string;
}

const toSnapshot = (r: Row): Snapshot => ({
  id: r.id,
  mode: r.mode,
  environmentKey: r.env_key,
  capturedAt: r.captured_at,
  hash: r.hash,
  source: r.source,
  config: JSON.parse(r.config),
});

/**
 * Stores a snapshot unless the latest snapshot for the environment already has
 * the same content hash (no meaningful change). Recovery bookkeeping snapshots
 * (pre/post) are always stored because they are audit records.
 */
export function recordSnapshot(
  envKey: string,
  config: NormalizedConfig,
  source: SnapshotSource,
): { snapshot: Snapshot; created: boolean } {
  const hash = configHash(config);
  const latest = latestSnapshot(envKey);
  const force = source === "pre_recovery" || source === "post_recovery";
  if (!force && latest && latest.hash === hash) return { snapshot: latest, created: false };
  const snap: Snapshot = {
    id: randomUUID(),
    mode: config.mode,
    environmentKey: envKey,
    capturedAt: config.capturedAt,
    hash,
    source,
    config,
  };
  db()
    .prepare("INSERT INTO snapshots (id, mode, env_key, captured_at, hash, source, config) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(snap.id, snap.mode, envKey, snap.capturedAt, hash, source, JSON.stringify(config));
  return { snapshot: snap, created: true };
}

export function latestSnapshot(envKey: string): Snapshot | null {
  const r = db().prepare("SELECT * FROM snapshots WHERE env_key = ? ORDER BY captured_at DESC LIMIT 1").get(envKey) as Row | undefined;
  return r ? toSnapshot(r) : null;
}

export function listSnapshots(envKey: string, limit = 200): Snapshot[] {
  const rows = db()
    .prepare("SELECT * FROM snapshots WHERE env_key = ? ORDER BY captured_at DESC LIMIT ?")
    .all(envKey, limit) as Row[];
  return rows.map(toSnapshot).reverse();
}

export function getSnapshot(id: string): Snapshot | null {
  const r = db().prepare("SELECT * FROM snapshots WHERE id = ?").get(id) as Row | undefined;
  return r ? toSnapshot(r) : null;
}
