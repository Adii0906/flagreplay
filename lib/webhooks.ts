import { createHmac, timingSafeEqual } from "node:crypto";
import type { HistoryEvent } from "./types";

/** Flagsmith signs webhook bodies with HMAC-SHA256 (hex) in the X-Flagsmith-Signature header. */
export function verifyFlagsmithSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

interface WebhookState {
  enabled?: boolean;
  feature_state_value?: unknown;
  feature?: { name?: string } | null;
  environment?: { api_key?: string; name?: string } | null;
  feature_segment?: { segment?: { name?: string } | null } | null;
}

export interface FlagsmithWebhookBody {
  event_type?: string;
  data?: {
    changed_by?: string;
    timestamp?: string;
    new_state?: WebhookState | null;
    previous_state?: WebhookState | null;
    log?: string;
    created_date?: string;
    author?: { email?: string } | null;
  };
}

/** Converts a received FLAG_UPDATED webhook into a timeline event. Only fields present are used. */
export function webhookToEvent(id: string, receivedAt: string, body: FlagsmithWebhookBody): HistoryEvent | null {
  const d = body.data;
  if (!d) return null;
  if (body.event_type === "FLAG_UPDATED" || body.event_type === "FLAG_DELETED") {
    const st = d.new_state ?? d.previous_state;
    const featureName = st?.feature?.name ?? "unknown feature";
    const segment = st?.feature_segment?.segment?.name;
    const details = [];
    if (d.previous_state && d.new_state) {
      if (d.previous_state.enabled !== d.new_state.enabled) details.push({ field: "enabled", old: d.previous_state.enabled, new: d.new_state.enabled });
      if (JSON.stringify(d.previous_state.feature_state_value) !== JSON.stringify(d.new_state.feature_state_value)) {
        details.push({ field: "feature_state_value", old: d.previous_state.feature_state_value ?? null, new: d.new_state.feature_state_value ?? null });
      }
    }
    return {
      id: `webhook:${id}`,
      timestamp: d.timestamp ?? receivedAt,
      source: "flagsmith_webhook",
      title: `${body.event_type === "FLAG_DELETED" ? "Flag deleted" : "Flag updated"}: ${featureName}${segment ? ` (segment override ${segment})` : ""}`,
      actor: d.changed_by ?? null,
      objectType: segment ? "FEATURE_STATE" : "FEATURE_STATE",
      objectId: null,
      details,
      relatedChangeIds: [],
      relevant: false,
    };
  }
  if (body.event_type === "AUDIT_LOG_CREATED" && d.log) {
    return {
      id: `webhook:${id}`,
      timestamp: d.created_date ?? receivedAt,
      source: "flagsmith_webhook",
      title: d.log,
      actor: d.author?.email ?? null,
      objectType: null,
      objectId: null,
      details: [],
      relatedChangeIds: [],
      relevant: false,
    };
  }
  return null;
}

export function webhookEnvironmentKey(body: FlagsmithWebhookBody): string | null {
  const d = body.data;
  return d?.new_state?.environment?.api_key ?? d?.previous_state?.environment?.api_key ?? null;
}
