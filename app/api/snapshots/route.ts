import { z } from "zod";
import { AppError, jsonError } from "@/lib/errors";
import { getLiveSource } from "@/lib/flagsmith/client";
import { listSnapshots, recordSnapshot } from "@/lib/snapshot/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lists live-mode FlagReplay snapshots (demo snapshots come from fixtures). */
export async function GET() {
  try {
    const live = getLiveSource();
    if (!live) return Response.json({ snapshots: [], configured: false });
    const snaps = listSnapshots(live.environmentKey()).map((s) => ({
      id: s.id,
      capturedAt: s.capturedAt,
      source: s.source,
      hash: s.hash,
      features: s.config.features.length,
      segments: s.config.segments.length,
    }));
    return Response.json({ snapshots: snaps.reverse(), configured: true });
  } catch (err) {
    return jsonError(err);
  }
}

const Body = z.object({ mode: z.literal("live") });

/** Manual snapshot capture (live only). Skipped when nothing changed since the last one. */
export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new AppError("validation", "Snapshots can only be captured in live mode", 400);
    const live = getLiveSource();
    if (!live) throw new AppError("not_configured", "Live mode is not configured. See SETUP.md.", 400);
    const config = await live.fetchConfig({ fresh: true });
    const { snapshot, created } = recordSnapshot(live.environmentKey(), config, "manual");
    return Response.json({ created, snapshot: { id: snapshot.id, capturedAt: snapshot.capturedAt, hash: snapshot.hash, source: snapshot.source } });
  } catch (err) {
    return jsonError(err);
  }
}
