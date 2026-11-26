import { jsonError } from "@/lib/errors";
import { listInvestigations } from "@/lib/investigation/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const mode = new URL(req.url).searchParams.get("mode") === "live" ? "live" : "demo";
    return Response.json({ investigations: listInvestigations(mode) });
  } catch (err) {
    return jsonError(err);
  }
}
