import "server-only";
import { z } from "zod";
import { AppError, FlagsmithApiError } from "../errors";
import { flagsmithEnv, llmEnv, type FlagsmithEnv } from "../env";
import type { AuditAvailability, ConnectionInfo, EnvironmentInfo, FlagValue, HistoryEvent, NormalizedConfig, NormalizedRule } from "../types";
import type { ConfigSource, EnvTarget } from "../source";
import type { RecoveryAction } from "../recovery/types";
import { normalizeConfig } from "../snapshot/normalize";
import { FlagsmithHttp } from "./http";
import {
  AuditLogDetailSchema,
  AuditLogSchema,
  EnvironmentSchema,
  FeatureSchema,
  FeatureSegmentSchema,
  FeatureStateSchema,
  ProjectSchema,
  SegmentSchema,
  type FsAuditLog,
  type FsEnvironment,
} from "./schemas";

function parse<T>(schema: z.ZodType<T>, data: unknown, path: string): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new FlagsmithApiError("bad_response", `Unexpected response shape from ${path}: ${r.error.issues[0]?.message ?? "invalid"}`, 200, path);
  }
  return r.data;
}

function parseList<T>(schema: z.ZodType<T>, data: unknown[], path: string): T[] {
  return data.map((d) => parse(schema, d, path));
}

async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Flagsmith Management API client. Server-side only; the token never leaves this module. */
export class LiveFlagsmithSource implements ConfigSource {
  readonly mode = "live" as const;
  readonly http: FlagsmithHttp;
  private envCache = new Map<string, FsEnvironment>();

  constructor(private cfg: FlagsmithEnv, fetchImpl?: typeof fetch) {
    this.http = new FlagsmithHttp({
      apiUrl: cfg.apiUrl,
      token: cfg.token,
      timeoutMs: cfg.timeoutMs,
      cacheTtlMs: cfg.cacheTtlMs,
      fetchImpl,
    });
  }

  hasCompareEnvironment(): boolean {
    return !!this.cfg.compareEnvironment;
  }

  environmentKey(target: EnvTarget = "primary"): string {
    const ref = target === "compare" ? this.cfg.compareEnvironment : this.cfg.environment;
    return `live:${this.cfg.apiUrl}:${this.cfg.projectId}:${ref}`;
  }

  async getProject() {
    const path = `/projects/${this.cfg.projectId}/`;
    return parse(ProjectSchema, await this.http.request(path), path);
  }

  /** Resolves FLAGSMITH_ENVIRONMENT_ID given as a numeric ID or an environment API key. */
  async resolveEnvironment(ref: string, fresh = false): Promise<FsEnvironment> {
    const cached = this.envCache.get(ref);
    if (cached && !fresh) return cached;
    const listPath = `/environments/`;
    const all = parseList(EnvironmentSchema, await this.http.getAll(listPath, { project: this.cfg.projectId }, !fresh), listPath);
    const match = all.find((e) => String(e.id) === ref || e.api_key === ref);
    if (!match) {
      throw new AppError(
        "not_found",
        `Environment "${ref}" was not found in project ${this.cfg.projectId}. Available: ${all.map((e) => `${e.name} (id ${e.id})`).join(", ") || "none visible to this token"}.`,
        404,
      );
    }
    const detailPath = `/environments/${encodeURIComponent(match.api_key)}/`;
    const detail = parse(EnvironmentSchema, await this.http.request(detailPath, { cache: !fresh }), detailPath);
    this.envCache.set(ref, detail);
    return detail;
  }

  async fetchConfig(opts: { fresh?: boolean; target?: EnvTarget } = {}): Promise<NormalizedConfig> {
    const fresh = opts.fresh ?? false;
    const ref = opts.target === "compare" ? this.cfg.compareEnvironment : this.cfg.environment;
    if (!ref) throw new AppError("not_configured", "FLAGSMITH_COMPARE_ENVIRONMENT_ID is not set.", 400);
    const pid = this.cfg.projectId;

    const [project, env, featuresRaw, segmentsRaw] = await Promise.all([
      this.getProject(),
      this.resolveEnvironment(ref, fresh),
      this.http.getAll(`/projects/${pid}/features/`, undefined, !fresh),
      this.http.getAll(`/projects/${pid}/segments/`, undefined, !fresh),
    ]);
    const features = parseList(FeatureSchema, featuresRaw, "features");
    const segments = parseList(SegmentSchema, segmentsRaw, "segments");

    const statesPath = `/features/featurestates/`;
    const featureStates = parseList(
      FeatureStateSchema,
      await this.http.getAll(statesPath, { environment: env.id }, !fresh),
      statesPath,
    );

    const featuresWithOverrides = [...new Set(featureStates.filter((s) => s.feature_segment != null).map((s) => s.feature))];
    const featureSegments = (
      await pool(featuresWithOverrides, 6, async (featureId) => {
        const p = `/features/feature-segments/`;
        return parseList(FeatureSegmentSchema, await this.http.getAll(p, { environment: env.id, feature: featureId }, !fresh), p);
      })
    ).flat();

    const environment: EnvironmentInfo = {
      id: env.id,
      apiKey: env.api_key,
      name: env.name,
      versioningV2: !!env.use_v2_feature_versioning,
    };

    return normalizeConfig({
      mode: "live",
      project: { id: project.id, name: project.name },
      environment,
      features,
      featureStates,
      featureSegments,
      segments,
    });
  }

  /**
   * Reads the project audit log for this environment plus project-level events
   * (segments are project-scoped). Plan retention limits apply; when the endpoint
   * is not accessible the limitation is reported instead of guessing.
   */
  async fetchHistory(config: NormalizedConfig): Promise<{ events: HistoryEvent[]; availability: AuditAvailability }> {
    const pid = this.cfg.projectId;
    const path = `/projects/${pid}/audit/`;
    let rows: FsAuditLog[];
    try {
      const first = await this.http.request<unknown>(path, { query: { page_size: 100 }, cache: false });
      const results = Array.isArray(first) ? first : (first as { results?: unknown[] })?.results;
      if (!Array.isArray(results)) throw new FlagsmithApiError("bad_response", "Unexpected audit log shape", 200, path);
      rows = parseList(AuditLogSchema, results, path);
    } catch (err) {
      if (err instanceof FlagsmithApiError && ["forbidden", "not_found", "unauthorized", "validation"].includes(err.code)) {
        return {
          events: [],
          availability: {
            available: false,
            reason: `Flagsmith audit log is not accessible with this token or plan (${err.httpStatus ?? err.code}). FlagReplay will rely on its own snapshots.`,
            retrieved: 0,
          },
        };
      }
      throw err;
    }

    const relevant = rows
      .filter((r) => r.environment == null || r.environment.id === config.environment.id)
      .filter((r) => !r.related_object_type || ["FEATURE", "FEATURE_STATE", "SEGMENT", "ENVIRONMENT", "EF_VERSION"].includes(r.related_object_type))
      .slice(0, 60);

    // Retrieve change details for the most recent flag/segment events (bounded fan-out).
    const detailTargets = relevant
      .filter((r) => r.related_object_type === "FEATURE_STATE" || r.related_object_type === "SEGMENT" || r.related_object_type === "FEATURE")
      .slice(0, 15);
    const details = new Map<number, { field: string; old: unknown; new: unknown }[]>();
    await pool(detailTargets, 5, async (r) => {
      const dp = `/projects/${pid}/audit/${r.id}/`;
      try {
        const d = parse(AuditLogDetailSchema, await this.http.request(dp), dp);
        details.set(r.id, d.change_details.map((c) => ({ field: c.field, old: c.old ?? null, new: c.new ?? null })));
      } catch {
        // Detail is optional enrichment; the list entry still stands on its own.
      }
    });

    const events: HistoryEvent[] = relevant.map((r) => ({
      id: `audit:${r.id}`,
      timestamp: r.created_date,
      source: "flagsmith_audit",
      title: r.log,
      actor: authorName(r.author),
      objectType: r.related_object_type ?? null,
      objectId: r.related_object_id != null ? String(r.related_object_id) : null,
      details: details.get(r.id) ?? [],
      relatedChangeIds: [],
      relevant: false,
    }));
    return { events, availability: { available: true, reason: null, retrieved: events.length } };
  }

  async applyAction(action: RecoveryAction, config: NormalizedConfig): Promise<void> {
    if (!action.available) throw new AppError("recovery_unavailable", action.unavailableReason ?? "Recovery unavailable", 409);
    switch (action.type) {
      case "set_feature_state":
        await this.http.request(
          `/environments/${encodeURIComponent(config.environment.apiKey)}/featurestates/${action.featureStateId}/`,
          { method: "PATCH", body: { enabled: action.to.enabled, feature_state_value: action.to.value } },
        );
        return;
      case "set_override_state":
        await this.http.request(`/features/featurestates/${action.featureStateId}/`, {
          method: "PATCH",
          body: { enabled: action.to.enabled, feature_state_value: typedValue(action.to.value) },
        });
        return;
      case "restore_segment_rules":
        // PATCH with only `rules` so name, description and metadata are left untouched.
        await this.http.request(`/projects/${this.cfg.projectId}/segments/${action.segmentId}/`, {
          method: "PATCH",
          body: { rules: denormalizeRules(action.to) },
        });
        return;
    }
  }

  async connection(): Promise<ConnectionInfo> {
    const llm = llmEnv();
    const base: ConnectionInfo = {
      mode: "live",
      ok: false,
      projectId: this.cfg.projectId,
      projectName: null,
      environmentName: null,
      environmentId: null,
      versioningV2: false,
      auditLog: "unknown",
      compareEnvironmentName: null,
      message: null,
      llmConfigured: !!llm.apiKey,
      llmProvider: llm.provider,
      llmModel: llm.model,
    };
    try {
      const [project, env] = await Promise.all([this.getProject(), this.resolveEnvironment(this.cfg.environment)]);
      let compareName: string | null = null;
      if (this.cfg.compareEnvironment) {
        compareName = (await this.resolveEnvironment(this.cfg.compareEnvironment).catch(() => null))?.name ?? null;
      }
      let audit: ConnectionInfo["auditLog"] = "unknown";
      try {
        await this.http.request(`/projects/${this.cfg.projectId}/audit/`, { query: { page_size: 1 } });
        audit = "available";
      } catch (e) {
        audit = e instanceof FlagsmithApiError && (e.code === "forbidden" || e.code === "not_found") ? "unavailable" : "unknown";
      }
      return {
        ...base,
        ok: true,
        projectName: project.name,
        environmentName: env.name,
        environmentId: env.id,
        versioningV2: !!env.use_v2_feature_versioning,
        auditLog: audit,
        compareEnvironmentName: compareName,
      };
    } catch (err) {
      return { ...base, message: err instanceof Error ? err.message : "Connection failed" };
    }
  }
}

export function typedValue(v: FlagValue): Record<string, unknown> {
  if (typeof v === "number" && Number.isInteger(v)) return { type: "int", integer_value: v };
  if (typeof v === "boolean") return { type: "bool", boolean_value: v };
  return { type: "unicode", string_value: v === null ? null : String(v) };
}

export function denormalizeRules(rules: NormalizedRule[]): unknown[] {
  return rules.map((r) => ({
    type: r.type,
    rules: denormalizeRules(r.rules),
    conditions: r.conditions.map((c) => ({
      property: c.property,
      operator: c.operator,
      value: c.value,
      ...(c.description ? { description: c.description } : {}),
    })),
  }));
}

function authorName(a: FsAuditLog["author"]): string | null {
  if (!a) return null;
  const full = [a.first_name, a.last_name].filter(Boolean).join(" ").trim();
  return a.email ? (full ? `${full} <${a.email}>` : a.email) : full || null;
}

let singleton: LiveFlagsmithSource | null = null;
let singletonKey = "";

export function getLiveSource(): LiveFlagsmithSource | null {
  const cfg = flagsmithEnv();
  if (!cfg) return null;
  const key = JSON.stringify(cfg);
  if (!singleton || key !== singletonKey) {
    singleton = new LiveFlagsmithSource(cfg);
    singletonKey = key;
  }
  return singleton;
}
