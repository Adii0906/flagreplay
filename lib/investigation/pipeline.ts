import "server-only";
import { randomUUID } from "node:crypto";
import { AppError } from "../errors";
import { llmEnv } from "../env";
import type { ConfigSource } from "../source";
import type { ConfigChange, HistoryEvent, NormalizedConfig, Snapshot } from "../types";
import { compareConfigs, fmt } from "../diff/compare";
import { configHash } from "../snapshot/normalize";
import { listSnapshots, recordSnapshot, getSnapshot } from "../snapshot/service";
import { linkEvents, scoreChanges, snapshotEvents, sortTimeline } from "../history/timeline";
import { buildRecoveryCandidates } from "../recovery/candidates";
import { openAiCompatible } from "../agent/provider";
import { runInvestigationAgent } from "../agent/investigate";
import { validateAgentReport, type EvidenceIds } from "../agent/schema";
import { RECORDED_REPORTS } from "../agent/recorded";
import { DemoSource } from "../demo/simulator";
import { resetDemo } from "../demo/simulator";
import type { DemoScenarioId } from "../demo/fixtures";
import { webhookEventsFor } from "../webhook-store";
import { saveInvestigation } from "./store";
import { toView, type InvestigationRecord, type PipelineEvent, type ReportState } from "./types";

const LOOKBACK_DAYS = 7;
const DRIFT_RE = /(staging|production|\bprod\b|across environments|between environments|environment drift|different configuration)/i;

export interface InvestigateInput {
  incident: string;
  source: ConfigSource;
  comparison?: "history" | "environment" | "auto";
  baselineSnapshotId?: string | null;
}

export function resolveComparison(input: InvestigateInput): "history" | "environment" {
  if (input.comparison === "history" || input.comparison === "environment") return input.comparison;
  return DRIFT_RE.test(input.incident) && input.source.hasCompareEnvironment() ? "environment" : "history";
}

function pickBaseline(snapshots: Snapshot[], current: NormalizedConfig, requested?: string | null): Snapshot | null {
  const curHash = configHash(current);
  if (requested) {
    const s = snapshots.find((x) => x.id === requested) ?? getSnapshot(requested);
    if (!s) throw new AppError("not_found", "Requested baseline snapshot not found", 404);
    return s;
  }
  const older = snapshots.filter((s) => s.capturedAt < current.capturedAt);
  if (older.length === 0) return null;
  const cutoff = new Date(Date.parse(current.capturedAt) - LOOKBACK_DAYS * 86400_000).toISOString();
  const inWindow = older.filter((s) => s.capturedAt >= cutoff);
  const pick = inWindow[0] ?? [...older].reverse().find((s) => s.hash !== curHash) ?? older[older.length - 1];
  return pick ?? null;
}

function relabelForEnvironments(changes: ConfigChange[], baseName: string, curName: string): ConfigChange[] {
  return changes.map((c) => {
    const subject = c.segmentName && c.kind.startsWith("segment") ? `Segment "${c.segmentName}"` : c.segmentName ? `"${c.featureName}" override "${c.segmentName}"` : `"${c.featureName}"`;
    const what = c.kind.endsWith("enabled") ? "enabled" : c.kind.endsWith("value") ? "value" : c.kind.replace(/_/g, " ");
    if (c.kind.endsWith("added") || c.kind.endsWith("removed") || c.kind === "segment_rules") {
      return { ...c, summary: `${c.summary.replace(/ was (added|removed|created|deleted)$/, "")} differs between ${baseName} and ${curName}` };
    }
    return { ...c, summary: `${subject} ${what} differs: ${baseName} ${fmt(c.before)}, ${curName} ${fmt(c.after)}` };
  });
}

function evidencePackage(r: InvestigationRecord) {
  return {
    incident: r.incident,
    mode: r.mode,
    project: r.projectName,
    environment: r.environment.name,
    comparison:
      r.comparison === "environment"
        ? { type: "environment", baseline_environment: r.baseline?.label, current_environment: r.environment.name }
        : { type: "history", baseline_captured_at: r.baseline?.capturedAt ?? null, current_captured_at: r.current.capturedAt },
    current_configuration: {
      features: r.currentConfig.features.map((f) => ({
        evidence_id: configurationEvidenceId("feature", f.name),
        name: f.name,
        enabled: f.enabled,
        value: f.value,
        segment_overrides: f.overrides.map((o) => ({ segment: o.segmentName, priority: o.priority, enabled: o.enabled, value: o.value })),
      })),
      segments: r.currentConfig.segments
        .filter((s) => r.currentConfig.features.some((f) => f.overrides.some((o) => o.segmentId === s.id)) || r.changes.some((c) => c.segmentId === s.id))
        .map((s) => ({ evidence_id: configurationEvidenceId("segment", s.name), name: s.name, rules: s.rules })),
    },
    detected_changes: r.changes.map((c) => ({
      change_id: c.id,
      kind: c.kind,
      summary: c.summary,
      feature: c.featureName,
      segment: c.segmentName,
      before: c.before,
      after: c.after,
      condition_diffs: c.conditionDiffs,
      affected_features: c.affectedFeatures,
      keyword_relevance: c.relevance,
    })),
    timeline: r.timeline.slice(-40).map((e) => ({
      event_id: e.id,
      timestamp: e.timestamp,
      window_start: e.windowStart ?? null,
      source: e.source,
      actor: e.actor,
      title: e.title,
      details: e.details.slice(0, 6),
      related_change_ids: e.relatedChangeIds,
    })),
    recovery_candidates: r.candidates.map((a) => ({
      action_id: a.id,
      title: a.title,
      type: a.type,
      change_ids: a.changeIds,
      available: a.available,
      unavailable_reason: a.unavailableReason,
    })),
    data_limitations: r.limitations,
  };
}

function configurationEvidenceId(kind: "feature" | "segment", name: string): string {
  return `config:${kind}:${encodeURIComponent(name)}`;
}

/** Runs the four real investigation stages, emitting progress as each completes. */
export async function runInvestigation(input: InvestigateInput, emit: (e: PipelineEvent) => void): Promise<InvestigationRecord> {
  const { source } = input;
  const demo = source instanceof DemoSource ? source : null;
  if (demo) resetDemo(demo.scenarioId);
  const comparison = resolveComparison(input);
  const limitations: string[] = [];

  // 1. Retrieve configuration
  emit({ type: "stage", stage: "retrieve", status: "running" });
  const envKey = source.environmentKey();
  const [current, compareCfg] = await Promise.all([
    source.fetchConfig({ fresh: true }),
    comparison === "environment" ? source.fetchConfig({ fresh: true, target: "compare" }) : Promise.resolve(null),
  ]);
  let currentSnapshotId: string | null = null;
  if (!demo) currentSnapshotId = recordSnapshot(envKey, current, "investigation").snapshot.id;
  emit({
    type: "stage",
    stage: "retrieve",
    status: "done",
    detail: `${current.features.length} features, ${current.segments.length} segments from ${current.environment.name}${compareCfg ? ` and ${compareCfg.environment.name}` : ""}`,
  });

  // 2. Compare historical changes
  emit({ type: "stage", stage: "compare", status: "running" });
  const historyPromise = source.fetchHistory(current);
  let baseline: InvestigationRecord["baseline"] = null;
  let baselineConfig: NormalizedConfig | null = null;
  let snapshots: Snapshot[] = [];
  let changes: ConfigChange[] = [];

  if (comparison === "environment" && compareCfg) {
    baselineConfig = compareCfg;
    baseline = { label: compareCfg.environment.name, capturedAt: compareCfg.capturedAt, snapshotId: null };
    changes = relabelForEnvironments(compareConfigs(compareCfg, current), compareCfg.environment.name, current.environment.name);
  } else {
    snapshots = demo ? demo.snapshots() : listSnapshots(envKey);
    const chosen = demo && !input.baselineSnapshotId ? snapshots[0] : pickBaseline(snapshots, current, input.baselineSnapshotId);
    if (chosen) {
      baselineConfig = chosen.config;
      baseline = { label: `${chosen.source === "demo_fixture" ? "Fixture snapshot" : "Snapshot"} ${chosen.capturedAt}`, capturedAt: chosen.capturedAt, snapshotId: chosen.id };
      changes = compareConfigs(chosen.config, current);
    } else {
      limitations.push(
        "No earlier FlagReplay snapshot exists for this environment, so no configuration diff is possible yet. This investigation stored the first baseline snapshot; take snapshots regularly or connect the Flagsmith webhook so future incidents can be compared.",
      );
    }
  }

  const history = await historyPromise;
  if (!history.availability.available && history.availability.reason) limitations.push(history.availability.reason);
  if (history.availability.available && !demo) {
    limitations.push("Flagsmith audit log retention depends on your plan; older events may not be visible.");
  }
  let events: HistoryEvent[] = [...history.events];
  if (!demo) {
    events.push(...webhookEventsFor(current.environment.apiKey));
    if (comparison === "history") events.push(...snapshotEvents(snapshots, changes));
    if (snapshots.length > 1) limitations.push("Snapshot-derived changes show the window between two snapshots, not the exact time of the change.");
  }
  if (current.environment.versioningV2) {
    limitations.push("This environment uses v2 feature versioning. FlagReplay can read it, but direct feature state writes are rejected by Flagsmith.");
  }
  emit({ type: "stage", stage: "compare", status: "done", detail: `${changes.length} configuration change${changes.length === 1 ? "" : "s"} detected, ${events.length} history events` });

  // 3. Correlate incident evidence
  emit({ type: "stage", stage: "correlate", status: "running" });
  changes = scoreChanges(input.incident, changes);
  const timeline = sortTimeline(linkEvents(events.filter((e) => e.source !== "flagreplay_snapshot"), changes).concat(events.filter((e) => e.source === "flagreplay_snapshot")));
  const candidates = baselineConfig ? buildRecoveryCandidates(changes, baselineConfig, current) : [];
  if (comparison === "environment" && baselineConfig) {
    for (const a of candidates) a.title = a.title.replace("to its previous state", `to match ${baselineConfig.environment.name}`).replace("Restore", "Align");
  }
  const top = changes.find((c) => (c.relevance ?? 0) > 0) ?? changes[0];

  const record: InvestigationRecord = {
    id: randomUUID(),
    mode: source.mode,
    createdAt: new Date().toISOString(),
    incident: input.incident,
    scenarioId: demo?.scenarioId ?? null,
    comparison,
    environmentKey: envKey,
    projectName: current.projectName,
    environment: current.environment,
    baseline,
    current: { capturedAt: current.capturedAt, snapshotId: currentSnapshotId, hash: configHash(current) },
    snapshotsConsidered: snapshots.slice(-20).map((s) => ({ id: s.id, capturedAt: s.capturedAt, source: s.source, hash: s.hash })),
    changes,
    timeline,
    audit: history.availability,
    limitations,
    candidates,
    affectedFeature: top?.featureName ?? top?.affectedFeatures[0] ?? null,
    report: null,
    status: "investigating",
    recoveries: [],
    baselineConfig,
    currentConfig: current,
  };
  saveInvestigation(record);
  emit({ type: "stage", stage: "correlate", status: "done", detail: `${candidates.length} recovery option${candidates.length === 1 ? "" : "s"} prepared` });
  emit({ type: "evidence", investigation: toView(record) });

  // 4. Prepare investigation report
  emit({ type: "stage", stage: "report", status: "running" });
  record.report = await buildReport(record, demo?.scenarioId ?? null);
  record.status = record.report.kind === "unavailable" && record.changes.length === 0 ? "report_ready" : "report_ready";
  saveInvestigation(record);
  emit({
    type: "stage",
    stage: "report",
    status: record.report.kind === "unavailable" ? "error" : "done",
    detail: record.report.kind === "ai" ? `${record.report.provider} ${record.report.model} in ${record.report.durationMs} ms` : record.report.kind === "recorded" ? "Recorded agent output (demo fixture)" : record.report.error ?? undefined,
  });
  emit({ type: "report", report: record.report, status: record.status });
  return record;
}

async function buildReport(record: InvestigationRecord, scenarioId: string | null): Promise<ReportState> {
  const llm = llmEnv();
  const ids: EvidenceIds = {
    changeIds: new Set(record.changes.map((c) => c.id)),
    eventIds: new Set(record.timeline.map((e) => e.id)),
    configurationIds: new Set([
      ...record.currentConfig.features.map((f) => configurationEvidenceId("feature", f.name)),
      ...record.currentConfig.segments
        .filter((s) => record.currentConfig.features.some((f) => f.overrides.some((o) => o.segmentId === s.id)) || record.changes.some((c) => c.segmentId === s.id))
        .map((s) => configurationEvidenceId("segment", s.name)),
    ]),
    actionIds: new Set(record.candidates.map((a) => a.id)),
    availableActionIds: new Set(record.candidates.filter((a) => a.available).map((a) => a.id)),
  };
  const empty = { provider: null, model: null, durationMs: null, attempts: null };

  if (llm.apiKey) {
    try {
      const result = await runInvestigationAgent(openAiCompatible(llm), evidencePackage(record), ids);
      return { kind: "ai", provider: llm.provider, model: llm.model, durationMs: result.durationMs, attempts: result.attempts, data: result.report, error: null };
    } catch (err) {
      return { kind: "unavailable", ...empty, data: null, error: `AI analysis failed: ${err instanceof Error ? err.message : "unknown error"}. The deterministic evidence above is complete and recovery options remain available.` };
    }
  }
  if (record.mode === "demo" && scenarioId) {
    const recorded = RECORDED_REPORTS[scenarioId as DemoScenarioId];
    const v = validateAgentReport(recorded, ids);
    if (v.ok) return { kind: "recorded", ...empty, data: v.report, error: null };
    return { kind: "unavailable", ...empty, data: null, error: `Recorded demo output failed validation: ${v.errors[0]}` };
  }
  return {
    kind: "unavailable",
    ...empty,
    data: null,
    error: "AI analysis is off because LLM_API_KEY is not set. The detected changes, timeline and recovery options above come from deterministic analysis and are complete.",
  };
}
