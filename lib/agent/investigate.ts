import { AppError } from "../errors";
import type { LlmProvider } from "./provider";
import { SYSTEM_PROMPT } from "./prompt";
import { validateAgentReport, type AgentReport, type EvidenceIds } from "./schema";

export interface AgentEvidence {
  incident: string;
  [key: string]: unknown;
}

export interface AgentResult {
  report: AgentReport;
  attempts: number;
  durationMs: number;
}

/**
 * One model call, validated against the schema and the evidence ids.
 * A single repair attempt is made if validation fails.
 */
export async function runInvestigationAgent(provider: LlmProvider, evidence: AgentEvidence, ids: EvidenceIds): Promise<AgentResult> {
  const started = Date.now();
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: `Evidence package (JSON):\n${JSON.stringify(evidence)}` },
  ];
  const first = await provider.completeJson(messages);
  const v1 = validateAgentReport(first, ids);
  if (v1.ok) return { report: v1.report, attempts: 1, durationMs: Date.now() - started };

  const second = await provider.completeJson([
    ...messages,
    { role: "assistant", content: JSON.stringify(first) },
    {
      role: "user",
      content: `Your JSON failed validation:\n- ${v1.errors.join("\n- ")}\nReturn a corrected JSON object. Copy evidence_id values from current_configuration and change_id, event_id, and action_id values from their respective evidence sections. Every confirmed evidence item needs at least one valid reference. If detected_changes is empty, use an undetermined root cause and no confirmed changes. Only recommend an action_id whose available field is true.`,
    },
  ]);
  const v2 = validateAgentReport(second, ids);
  if (v2.ok) return { report: v2.report, attempts: 2, durationMs: Date.now() - started };
  throw new AppError("llm_error", `AI response failed validation twice: ${v2.errors.slice(0, 3).join("; ")}`, 502, v2.errors);
}
