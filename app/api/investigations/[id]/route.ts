import { AppError, jsonError } from "@/lib/errors";
import { getInvestigation } from "@/lib/investigation/store";
import { toView } from "@/lib/investigation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const r = getInvestigation(id);
    if (!r) throw new AppError("not_found", "Investigation not found", 404);
    return Response.json({ investigation: toView(r) });
  } catch (err) {
    return jsonError(err);
  }
}
