import { AppError } from "../errors";
import { llmEnv } from "../env";
import type { ConfigSource, EnvTarget } from "../source";
import type { ConnectionInfo, HistoryEvent, NormalizedConfig, Snapshot } from "../types";
import type { RecoveryAction } from "../recovery/types";
import { configHash } from "../snapshot/normalize";
import { DEMO_SCENARIOS, replay, type DemoScenarioId } from "./fixtures";

/**
 * In-memory simulated Flagsmith environment for demo mode. Recovery actions
 * really mutate this simulated state, so verification re-reads and compares
 * genuinely, but nothing ever touches a real Flagsmith project.
 */
const g = globalThis as unknown as { __flagreplayDemo?: Map<DemoScenarioId, NormalizedConfig> };
const state: Map<DemoScenarioId, NormalizedConfig> = (g.__flagreplayDemo ??= new Map());

/** Optional fault injection so the drift-abort safeguard can be demonstrated. */
const faults = new Map<DemoScenarioId, (c: NormalizedConfig) => void>();

export function resetDemo(id: DemoScenarioId): void {
  const configs = replay(DEMO_SCENARIOS[id]);
  state.set(id, structuredClone(configs[configs.length - 1]));
  faults.delete(id);
}

export function injectDemoDrift(id: DemoScenarioId, mutate: (c: NormalizedConfig) => void): void {
  faults.set(id, mutate);
}

export class DemoSource implements ConfigSource {
  readonly mode = "demo" as const;
  constructor(readonly scenarioId: DemoScenarioId) {
    if (!state.has(scenarioId)) resetDemo(scenarioId);
  }

  get scenario() {
    return DEMO_SCENARIOS[this.scenarioId];
  }

  hasCompareEnvironment(): boolean {
    return !!this.scenario.compare;
  }

  environmentKey(target: EnvTarget = "primary"): string {
    return `demo:${this.scenarioId}:${target}`;
  }

  async connection(): Promise<ConnectionInfo> {
    const llm = llmEnv();
    const c = this.scenario.initial;
    return {
      mode: "demo",
      ok: true,
      projectId: c.projectId,
      projectName: c.projectName,
      environmentName: c.environment.name,
      environmentId: c.environment.id,
      versioningV2: false,
      auditLog: "available",
      compareEnvironmentName: this.scenario.compare?.environment.name ?? null,
      message: "Demo mode uses deterministic sample data and a simulated environment.",
      llmConfigured: !!llm.apiKey,
      llmProvider: llm.provider,
      llmModel: llm.model,
    };
  }

  async fetchConfig(opts: { fresh?: boolean; target?: EnvTarget } = {}): Promise<NormalizedConfig> {
    if (opts.target === "compare") {
      if (!this.scenario.compare) throw new AppError("not_configured", "This demo scenario has no comparison environment.", 400);
      return { ...structuredClone(this.scenario.compare), capturedAt: new Date().toISOString() };
    }
    const fault = faults.get(this.scenarioId);
    if (fault) {
      fault(state.get(this.scenarioId)!);
      faults.delete(this.scenarioId);
    }
    return { ...structuredClone(state.get(this.scenarioId)!), capturedAt: new Date().toISOString() };
  }

  /** Fixture audit events, labelled demo_fixture. */
  async fetchHistory(): Promise<{ events: HistoryEvent[]; availability: { available: boolean; reason: string | null; retrieved: number } }> {
    const events: HistoryEvent[] = this.scenario.steps.map((s, i) => ({
      id: `demo-audit:${this.scenarioId}:${i}`,
      timestamp: s.timestamp,
      source: "demo_fixture",
      title: s.title,
      actor: s.actor,
      objectType: s.objectType,
      objectId: null,
      details: s.details,
      relatedChangeIds: [],
      relevant: false,
    }));
    return { events, availability: { available: true, reason: null, retrieved: events.length } };
  }

  /** Fixture snapshots, one per replayed step. */
  snapshots(): Snapshot[] {
    return replay(this.scenario).map((config, i) => ({
      id: `demo-snap:${this.scenarioId}:${i}`,
      mode: "demo",
      environmentKey: this.environmentKey(),
      capturedAt: config.capturedAt,
      hash: configHash(config),
      source: "demo_fixture",
      config,
    }));
  }

  async applyAction(action: RecoveryAction): Promise<void> {
    if (!action.available) throw new AppError("recovery_unavailable", action.unavailableReason ?? "Recovery unavailable", 409);
    const cur = state.get(this.scenarioId)!;
    if (action.type === "set_feature_state") {
      const ft = cur.features.find((x) => x.featureStateId === action.featureStateId);
      if (!ft) throw new AppError("not_found", "Simulated feature state not found", 404);
      ft.enabled = action.to.enabled;
      ft.value = action.to.value;
    } else if (action.type === "set_override_state") {
      const ov = cur.features.flatMap((x) => x.overrides).find((o) => o.featureStateId === action.featureStateId);
      if (!ov) throw new AppError("not_found", "Simulated override not found", 404);
      ov.enabled = action.to.enabled;
      ov.value = action.to.value;
    } else {
      const seg = cur.segments.find((s) => s.id === action.segmentId);
      if (!seg) throw new AppError("not_found", "Simulated segment not found", 404);
      seg.rules = structuredClone(action.to);
    }
  }
}
