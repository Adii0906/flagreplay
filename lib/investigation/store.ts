import "server-only";
import { db } from "../db";
import type { Mode } from "../types";
import type { InvestigationRecord } from "./types";

export function saveInvestigation(r: InvestigationRecord): void {
  db()
    .prepare(
      `INSERT INTO investigations (id, mode, env_key, created_at, incident, status, payload)
       VALUES (@id, @mode, @env_key, @created_at, @incident, @status, @payload)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, payload = excluded.payload`,
    )
    .run({
      id: r.id,
      mode: r.mode,
      env_key: r.environmentKey,
      created_at: r.createdAt,
      incident: r.incident,
      status: r.status,
      payload: JSON.stringify(r),
    });
}

export function getInvestigation(id: string): InvestigationRecord | null {
  const row = db().prepare("SELECT payload FROM investigations WHERE id = ?").get(id) as { payload: string } | undefined;
  return row ? (JSON.parse(row.payload) as InvestigationRecord) : null;
}

export interface InvestigationSummary {
  id: string;
  mode: Mode;
  createdAt: string;
  incident: string;
  status: string;
  environmentName: string;
  affectedFeature: string | null;
}

export function listInvestigations(mode: Mode, limit = 8): InvestigationSummary[] {
  const rows = db()
    .prepare("SELECT payload FROM investigations WHERE mode = ? ORDER BY created_at DESC LIMIT ?")
    .all(mode, limit) as { payload: string }[];
  return rows.map((r) => {
    const p = JSON.parse(r.payload) as InvestigationRecord;
    return {
      id: p.id,
      mode: p.mode,
      createdAt: p.createdAt,
      incident: p.incident,
      status: p.status,
      environmentName: p.environment.name,
      affectedFeature: p.affectedFeature,
    };
  });
}
