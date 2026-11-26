import type { AgentReport } from "../agent/schema";
import type { RecoveryAction, VerificationResult } from "../recovery/types";
import type { AuditAvailability, ConfigChange, EnvironmentInfo, HistoryEvent, Mode, NormalizedConfig } from "../types";

export type StageId = "retrieve" | "compare" | "correlate" | "report";
export type StageStatus = "running" | "done" | "error" | "skipped";

export interface ReportState {
  kind: "ai" | "recorded" | "unavailable";
  provider: string | null;
  model: string | null;
  durationMs: number | null;
  attempts: number | null;
  data: AgentReport | null;
  error: string | null;
}

export interface RecoveryRecord {
  id: string;
  actionId: string;
  status: "verified" | "failed" | "aborted";
  createdAt: string;
  preSnapshotId: string | null;
  postSnapshotId: string | null;
  verification: VerificationResult | null;
  error: string | null;
}

export interface InvestigationRecord {
  id: string;
  mode: Mode;
  createdAt: string;
  incident: string;
  scenarioId: string | null;
  comparison: "history" | "environment";
  environmentKey: string;
  projectName: string;
  environment: EnvironmentInfo;
  baseline: { label: string; capturedAt: string; snapshotId: string | null } | null;
  current: { capturedAt: string; snapshotId: string | null; hash: string };
  snapshotsConsidered: { id: string; capturedAt: string; source: string; hash: string }[];
  changes: ConfigChange[];
  timeline: HistoryEvent[];
  audit: AuditAvailability;
  limitations: string[];
  candidates: RecoveryAction[];
  affectedFeature: string | null;
  report: ReportState | null;
  status: "investigating" | "report_ready" | "recovered" | "recovery_failed" | "failed";
  recoveries: RecoveryRecord[];
  baselineConfig: NormalizedConfig | null;
  currentConfig: NormalizedConfig;
}

/** What the browser receives (configs omitted to keep payloads light). */
export type InvestigationView = Omit<InvestigationRecord, "baselineConfig" | "currentConfig">;

export type PipelineEvent =
  | { type: "stage"; stage: StageId; status: StageStatus; detail?: string }
  | { type: "evidence"; investigation: InvestigationView }
  | { type: "report"; report: ReportState; status: InvestigationRecord["status"] }
  | { type: "error"; error: { code: string; message: string } }
  | { type: "done"; investigationId: string };

export function toView(r: InvestigationRecord): InvestigationView {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { baselineConfig, currentConfig, ...view } = r;
  return view;
}
