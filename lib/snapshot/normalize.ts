import { createHash } from "node:crypto";
import type {
  EnvironmentInfo,
  FlagValue,
  Mode,
  NormalizedConfig,
  NormalizedFeature,
  NormalizedRule,
  NormalizedSegment,
} from "../types";
import type { FsFeature, FsFeatureSegment, FsFeatureState, FsSegment, RawRule } from "../flagsmith/schemas";

/** Converts either a raw value or Flagsmith's nested {type, *_value} object into a plain value. */
export function normalizeValue(raw: unknown): FlagValue {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return raw;
  if (typeof raw === "object") {
    const o = raw as { type?: string | null; string_value?: unknown; integer_value?: unknown; boolean_value?: unknown };
    if (o.type === "int") return typeof o.integer_value === "number" ? o.integer_value : null;
    if (o.type === "bool") return typeof o.boolean_value === "boolean" ? o.boolean_value : null;
    if (typeof o.string_value === "string") return o.string_value;
    if (typeof o.integer_value === "number") return o.integer_value;
    if (typeof o.boolean_value === "boolean") return o.boolean_value;
  }
  return null;
}

export function normalizeRules(rules: RawRule[] | undefined): NormalizedRule[] {
  return (rules ?? []).map((r) => ({
    type: r.type,
    conditions: (r.conditions ?? []).map((c) => ({
      property: c.property ?? "",
      operator: c.operator,
      value: c.value === undefined || c.value === null ? null : String(c.value),
      description: c.description ?? null,
    })),
    rules: normalizeRules(r.rules),
  }));
}

export interface RawConfigInput {
  mode: Mode;
  project: { id: number; name: string };
  environment: EnvironmentInfo;
  features: FsFeature[];
  featureStates: FsFeatureState[];
  featureSegments: FsFeatureSegment[];
  segments: FsSegment[];
  capturedAt?: string;
}

/** Builds the canonical, order-stable configuration model FlagReplay compares. */
export function normalizeConfig(input: RawConfigInput): NormalizedConfig {
  const segmentsById = new Map<number, NormalizedSegment>();
  for (const s of input.segments) {
    segmentsById.set(s.id, { id: s.id, name: s.name, rules: normalizeRules(s.rules as RawRule[]) });
  }
  const featureSegmentsById = new Map(input.featureSegments.map((fs) => [fs.id, fs]));

  const features: NormalizedFeature[] = input.features.map((f) => {
    const states = input.featureStates.filter((s) => s.feature === f.id && !hasIdentity(s));
    const envState = states.find((s) => s.feature_segment == null) ?? null;
    const overrides = states
      .filter((s) => s.feature_segment != null)
      .map((s) => {
        const fseg = featureSegmentsById.get(s.feature_segment as number);
        const segmentId = fseg?.segment ?? -1;
        return {
          segmentId,
          segmentName: segmentsById.get(segmentId)?.name ?? fseg?.segment_name ?? `segment #${segmentId}`,
          featureSegmentId: s.feature_segment ?? null,
          featureStateId: s.id,
          priority: fseg?.priority ?? null,
          enabled: s.enabled,
          value: normalizeValue(s.feature_state_value),
        };
      })
      .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999) || a.segmentId - b.segmentId);
    return {
      id: f.id,
      name: f.name,
      type: f.type ?? null,
      featureStateId: envState?.id ?? null,
      enabled: envState?.enabled ?? false,
      value: normalizeValue(envState?.feature_state_value),
      overrides,
    };
  });

  return {
    mode: input.mode,
    projectId: input.project.id,
    projectName: input.project.name,
    environment: input.environment,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    features: features.sort((a, b) => a.name.localeCompare(b.name)),
    segments: [...segmentsById.values()].sort((a, b) => a.id - b.id),
  };
}

function hasIdentity(s: FsFeatureState): boolean {
  return s.identity !== undefined && s.identity !== null;
}

/**
 * Content hash of the meaningful configuration. Excludes capture time and
 * Flagsmith row IDs so identical configuration yields the same hash.
 */
export function configHash(config: NormalizedConfig): string {
  const canonical = {
    env: config.environment.id,
    features: config.features.map((f) => ({
      n: f.name,
      e: f.enabled,
      v: f.value,
      o: f.overrides.map((o) => ({ s: o.segmentId, p: o.priority, e: o.enabled, v: o.value })),
    })),
    segments: config.segments.map((s) => ({ i: s.id, n: s.name, r: s.rules })),
  };
  return createHash("sha256").update(stableStringify(canonical)).digest("hex").slice(0, 16);
}

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const keys = Object.keys(v as object).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(",")}}`;
}
