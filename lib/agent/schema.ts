import { z } from "zod";

export const AgentReportSchema = z.object({
  incident_summary: z.string().min(1).max(600),
  affected_features: z.array(z.string()).max(20),
  confirmed_changes: z.array(z.object({ change_id: z.string(), statement: z.string().min(1).max(400) })).max(30),
  suspected_root_cause: z.object({
    change_id: z.string().nullable(),
    statement: z.string().min(1).max(800),
    status: z.enum(["likely", "possible", "undetermined"]),
  }),
  evidence: z
    .array(
      z.object({
        statement: z.string().min(1).max(500),
        type: z.enum(["confirmed", "inference"]),
        references: z.array(z.string()).max(10),
      }),
    )
    .max(12),
  confidence: z.enum(["high", "medium", "low"]),
  confidence_rationale: z.string().min(1).max(500),
  alternative_hypotheses: z.array(z.object({ hypothesis: z.string().min(1).max(400), assessment: z.string().min(1).max(400) })).max(6),
  recommended_action: z.object({
    action_id: z.string().nullable(),
    summary: z.string().min(1).max(400),
    rationale: z.string().min(1).max(600),
  }),
  recovery_payload: z.object({ action_id: z.string().nullable() }),
  verification_plan: z.array(z.string().min(1).max(300)).max(8),
});

export type AgentReport = z.infer<typeof AgentReportSchema>;

export interface EvidenceIds {
  changeIds: Set<string>;
  eventIds: Set<string>;
  configurationIds: Set<string>;
  actionIds: Set<string>;
  availableActionIds: Set<string>;
}

/**
 * Schema validation plus referential checks: every change, event and action
 * the model cites must exist in the evidence the backend supplied.
 */
export function validateAgentReport(raw: unknown, ids: EvidenceIds): { ok: true; report: AgentReport } | { ok: false; errors: string[] } {
  const parsed = AgentReportSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
  }
  const r = parsed.data;
  const errors: string[] = [];
  for (const c of r.confirmed_changes) if (!ids.changeIds.has(c.change_id)) errors.push(`confirmed_changes references unknown change_id "${c.change_id}"`);
  if (r.suspected_root_cause.change_id && !ids.changeIds.has(r.suspected_root_cause.change_id)) {
    errors.push(`suspected_root_cause references unknown change_id "${r.suspected_root_cause.change_id}"`);
  }
  for (const e of r.evidence) {
    for (const ref of e.references) {
      if (!ids.changeIds.has(ref) && !ids.eventIds.has(ref) && !ids.configurationIds.has(ref)) errors.push(`evidence references unknown id "${ref}"`);
    }
    if (e.type === "confirmed" && e.references.length === 0) errors.push(`confirmed evidence must cite at least one change_id, event_id, or configuration evidence_id: "${e.statement.slice(0, 60)}"`);
  }
  const act = r.recommended_action.action_id;
  if (act && !ids.actionIds.has(act)) errors.push(`recommended_action references unknown action_id "${act}"`);
  if (act && !ids.availableActionIds.has(act)) errors.push(`recommended_action references unavailable action_id "${act}"`);
  if (r.recovery_payload.action_id !== act) errors.push("recovery_payload.action_id must equal recommended_action.action_id");
  if (ids.changeIds.size === 0 && r.suspected_root_cause.status !== "undetermined") {
    errors.push("no configuration changes were detected, so suspected_root_cause.status must be 'undetermined'");
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, report: r };
}
