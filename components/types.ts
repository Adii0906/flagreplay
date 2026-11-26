import type { ConnectionInfo, Mode } from "@/lib/types";
import type { InvestigationView, ReportState, StageId } from "@/lib/investigation/types";
import type { InvestigationSummary } from "@/lib/investigation/store";

export type { ConnectionInfo, Mode, InvestigationView, ReportState, StageId, InvestigationSummary };

export interface ConnState {
  config: {
    liveConfigured: boolean;
    missing: string[];
    apiUrl: string;
    projectId: number | null;
    compareConfigured: boolean;
    webhookSecretConfigured: boolean;
    llm: { provider: string; model: string; configured: boolean };
  };
  connection: ConnectionInfo | null;
}

export interface StageView {
  id: StageId;
  label: string;
  status: "pending" | "running" | "done" | "error" | "skipped";
  detail?: string;
  startedAt?: number;
  endedAt?: number;
}

export const STAGE_LABELS: Record<StageId, string> = {
  retrieve: "Retrieving configuration",
  compare: "Comparing historical changes",
  correlate: "Correlating incident evidence",
  report: "Preparing investigation report",
};

export const EXAMPLES: { scenario: string; label: string; incident: string }[] = [
  { scenario: "checkout-beta", label: "Beta users lost checkout access", incident: "Beta users suddenly cannot access the new checkout." },
  { scenario: "feature-disabled", label: "A feature unexpectedly became disabled", incident: "Customers report the invoice export button disappeared this morning." },
  { scenario: "env-drift", label: "Staging and production have different configurations", incident: "Payments work in staging but production behaves differently." },
];
