import "server-only";
import { db } from "./db";
import type { HistoryEvent } from "./types";
import { webhookToEvent, type FlagsmithWebhookBody } from "./webhooks";

export function storeWebhook(id: string, body: FlagsmithWebhookBody, envApiKey: string | null): void {
  db()
    .prepare("INSERT INTO webhook_events (id, received_at, event_type, environment_api_key, payload) VALUES (?, ?, ?, ?, ?)")
    .run(id, new Date().toISOString(), body.event_type ?? "unknown", envApiKey, JSON.stringify(body));
}

export function webhookEventsFor(envApiKey: string, limit = 100): HistoryEvent[] {
  const rows = db()
    .prepare("SELECT id, received_at, payload FROM webhook_events WHERE environment_api_key = ? OR environment_api_key IS NULL ORDER BY received_at DESC LIMIT ?")
    .all(envApiKey, limit) as { id: string; received_at: string; payload: string }[];
  return rows.map((r) => webhookToEvent(r.id, r.received_at, JSON.parse(r.payload))).filter((e): e is HistoryEvent => e !== null);
}
