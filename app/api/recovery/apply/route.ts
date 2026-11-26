import { z } from "zod";
import { AppError, jsonError } from "@/lib/errors";
import { getInvestigation } from "@/lib/investigation/store";
import { toView } from "@/lib/investigation/types";
import { applyRecovery } from "@/lib/recovery/service";
import { resolveSource } from "@/lib/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  investigationId: z.string().min(1).max(80),
  actionId: z.string().min(1).max(200),
  confirm: z.literal(true, { message: "Explicit confirmation is required" }),
});

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new AppError("validation", parsed.error.issues[0]?.message ?? "Invalid request", 400);
    const record = getInvestigation(parsed.data.investigationId);
    if (!record) throw new AppError("not_found", "Investigation not found", 404);
    const source = resolveSource(record.mode, { scenario: record.scenarioId });
    const recovery = await applyRecovery({ ...parsed.data, source });
    const updated = getInvestigation(record.id)!;
    return Response.json({ recovery, investigation: toView(updated) });
  } catch (err) {
    return jsonError(err);
  }
}
