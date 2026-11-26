import { z } from "zod";
import { AppError, jsonError } from "@/lib/errors";
import { resetDemo } from "@/lib/demo/simulator";
import { DEMO_SCENARIOS, type DemoScenarioId } from "@/lib/demo/fixtures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ scenario: z.string() });

/** Resets the simulated demo environment to its deterministic incident state. */
export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success || !(parsed.data.scenario in DEMO_SCENARIOS)) throw new AppError("validation", "Unknown demo scenario", 400);
    resetDemo(parsed.data.scenario as DemoScenarioId);
    return Response.json({ reset: true });
  } catch (err) {
    return jsonError(err);
  }
}
