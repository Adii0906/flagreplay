import { z } from "zod";
import { AppError, jsonError, toErrorBody } from "@/lib/errors";
import { resolveSource } from "@/lib/sources";
import { runInvestigation } from "@/lib/investigation/pipeline";
import type { PipelineEvent } from "@/lib/investigation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  incident: z.string().trim().min(5, "Describe the incident in a few words").max(1000),
  mode: z.enum(["live", "demo"]),
  scenario: z.string().max(40).nullable().optional(),
  comparison: z.enum(["auto", "history", "environment"]).optional(),
  baselineSnapshotId: z.string().max(80).nullable().optional(),
});

/** Streams real pipeline stages as newline-delimited JSON. */
export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) throw new AppError("validation", parsed.error.issues[0]?.message ?? "Invalid request", 400);
    body = parsed.data;
  } catch (err) {
    return jsonError(err instanceof SyntaxError ? new AppError("validation", "Invalid JSON", 400) : err);
  }

  let source;
  try {
    source = resolveSource(body.mode, { scenario: body.scenario, incident: body.incident });
  } catch (err) {
    return jsonError(err);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: PipelineEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        const record = await runInvestigation(
          { incident: body.incident, source, comparison: body.comparison ?? "auto", baselineSnapshotId: body.baselineSnapshotId },
          send,
        );
        send({ type: "done", investigationId: record.id });
      } catch (err) {
        if (!(err instanceof AppError)) console.error("[flagreplay] investigation failed", err);
        send({ type: "error", error: toErrorBody(err).error });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
