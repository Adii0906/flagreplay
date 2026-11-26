import { randomUUID } from "node:crypto";
import { flagsmithEnv } from "@/lib/env";
import { jsonError } from "@/lib/errors";
import { getLiveSource } from "@/lib/flagsmith/client";
import { recordSnapshot } from "@/lib/snapshot/service";
import { storeWebhook } from "@/lib/webhook-store";
import { verifyFlagsmithSignature, webhookEnvironmentKey, type FlagsmithWebhookBody } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Flagsmith environment / audit webhook receiver. Stores the event as native
 * history and captures a FlagReplay snapshot (deduplicated by content hash).
 */
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    const cfg = flagsmithEnv();
    if (cfg?.webhookSecret) {
      if (!verifyFlagsmithSignature(raw, req.headers.get("x-flagsmith-signature"), cfg.webhookSecret)) {
        return Response.json({ error: { code: "unauthorized", message: "Invalid webhook signature" } }, { status: 401 });
      }
    }
    let body: FlagsmithWebhookBody;
    try {
      body = JSON.parse(raw);
    } catch {
      return Response.json({ error: { code: "validation", message: "Invalid JSON" } }, { status: 400 });
    }
    const id = randomUUID();
    storeWebhook(id, body, webhookEnvironmentKey(body));

    let snapshot: { created: boolean; id: string } | null = null;
    const live = getLiveSource();
    if (live) {
      try {
        const config = await live.fetchConfig({ fresh: true });
        const r = recordSnapshot(live.environmentKey(), config, "webhook");
        snapshot = { created: r.created, id: r.snapshot.id };
      } catch (err) {
        console.error("[flagreplay] webhook snapshot failed", err);
      }
    }
    return Response.json({ received: true, id, snapshot });
  } catch (err) {
    return jsonError(err);
  }
}
