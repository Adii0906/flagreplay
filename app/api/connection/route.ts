import { jsonError } from "@/lib/errors";
import { flagsmithEnv, llmEnv, missingFlagsmithVars } from "@/lib/env";
import { getLiveSource } from "@/lib/flagsmith/client";
import { DemoSource } from "@/lib/demo/simulator";
import { latestSnapshot, recordSnapshot } from "@/lib/snapshot/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Connection status for the header and settings panel. Never returns secrets. */
export async function GET(req: Request) {
  try {
    const mode = new URL(req.url).searchParams.get("mode") === "live" ? "live" : "demo";
    const cfg = flagsmithEnv();
    const llm = llmEnv();
    const config = {
      liveConfigured: !!cfg,
      missing: missingFlagsmithVars(),
      apiUrl: cfg?.apiUrl ?? (process.env.FLAGSMITH_API_URL || "https://api.flagsmith.com"),
      projectId: cfg?.projectId ?? null,
      compareConfigured: !!cfg?.compareEnvironment,
      webhookSecretConfigured: !!cfg?.webhookSecret,
      llm: { provider: llm.provider, model: llm.model, configured: !!llm.apiKey },
    };
    if (mode === "live") {
      const live = getLiveSource();
      const connection = live ? await live.connection() : null;
      let baselineCaptured = false;
      // First successful live connection: store a baseline snapshot so the next incident has something to diff against.
      if (live && connection?.ok && !latestSnapshot(live.environmentKey())) {
        try {
          recordSnapshot(live.environmentKey(), await live.fetchConfig({ fresh: true }), "manual");
          baselineCaptured = true;
        } catch {
          /* reported on the next investigation */
        }
      }
      return Response.json({ config, connection, baselineCaptured });
    }
    const connection = await new DemoSource("checkout-beta").connection();
    return Response.json({ config, connection });
  } catch (err) {
    return jsonError(err);
  }
}
