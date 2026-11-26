import type {
  ConditionDiff,
  ConfigChange,
  FlagValue,
  NormalizedCondition,
  NormalizedConfig,
  NormalizedRule,
} from "../types";
import { stableStringify } from "../snapshot/normalize";

/** Deterministic comparison of two normalized configurations (baseline -> current). */
export function compareConfigs(baseline: NormalizedConfig, current: NormalizedConfig): ConfigChange[] {
  const changes: ConfigChange[] = [];
  const baseFeatures = new Map(baseline.features.map((f) => [f.name, f]));
  const curFeatures = new Map(current.features.map((f) => [f.name, f]));

  for (const [name, cur] of curFeatures) {
    const base = baseFeatures.get(name);
    if (!base) {
      changes.push(mk("feature_added", { featureName: name, before: null, after: { enabled: cur.enabled, value: cur.value }, summary: `Feature "${name}" was added`, affectedFeatures: [name] }));
      continue;
    }
    if (base.enabled !== cur.enabled) {
      changes.push(mk("feature_enabled", { featureName: name, before: base.enabled, after: cur.enabled, summary: `"${name}" was ${cur.enabled ? "enabled" : "disabled"} in ${current.environment.name}`, affectedFeatures: [name] }));
    }
    if (!sameValue(base.value, cur.value)) {
      changes.push(mk("feature_value", { featureName: name, before: base.value, after: cur.value, summary: `"${name}" value changed from ${fmt(base.value)} to ${fmt(cur.value)}`, affectedFeatures: [name] }));
    }

    const baseOv = new Map(base.overrides.map((o) => [o.segmentId, o]));
    const curOv = new Map(cur.overrides.map((o) => [o.segmentId, o]));
    for (const [segId, o] of curOv) {
      const b = baseOv.get(segId);
      const seg = { featureName: name, segmentId: segId, segmentName: o.segmentName, affectedFeatures: [name] };
      if (!b) {
        changes.push(mk("override_added", { ...seg, before: null, after: { enabled: o.enabled, value: o.value }, summary: `Segment override "${o.segmentName}" added to "${name}"` }));
        continue;
      }
      if (b.enabled !== o.enabled) {
        changes.push(mk("override_enabled", { ...seg, before: b.enabled, after: o.enabled, summary: `Override "${o.segmentName}" on "${name}" was ${o.enabled ? "enabled" : "disabled"}` }));
      }
      if (!sameValue(b.value, o.value)) {
        changes.push(mk("override_value", { ...seg, before: b.value, after: o.value, summary: `Override "${o.segmentName}" on "${name}" value changed from ${fmt(b.value)} to ${fmt(o.value)}` }));
      }
      if ((b.priority ?? null) !== (o.priority ?? null)) {
        changes.push(mk("override_priority", { ...seg, before: b.priority, after: o.priority, summary: `Override "${o.segmentName}" on "${name}" priority changed from ${b.priority} to ${o.priority}` }));
      }
    }
    for (const [segId, b] of baseOv) {
      if (!curOv.has(segId)) {
        changes.push(mk("override_removed", { featureName: name, segmentId: segId, segmentName: b.segmentName, before: { enabled: b.enabled, value: b.value }, after: null, summary: `Segment override "${b.segmentName}" removed from "${name}"`, affectedFeatures: [name] }));
      }
    }
  }
  for (const [name, base] of baseFeatures) {
    if (!curFeatures.has(name)) {
      changes.push(mk("feature_removed", { featureName: name, before: { enabled: base.enabled, value: base.value }, after: null, summary: `Feature "${name}" was removed`, affectedFeatures: [name] }));
    }
  }

  const baseSeg = new Map(baseline.segments.map((s) => [s.id, s]));
  const curSeg = new Map(current.segments.map((s) => [s.id, s]));
  const usersOf = (segId: number) =>
    current.features.filter((f) => f.overrides.some((o) => o.segmentId === segId)).map((f) => f.name);

  for (const [id, cur] of curSeg) {
    const base = baseSeg.get(id);
    if (!base) {
      changes.push(mk("segment_added", { segmentId: id, segmentName: cur.name, before: null, after: cur.rules, summary: `Segment "${cur.name}" was created`, affectedFeatures: usersOf(id) }));
      continue;
    }
    if (stableStringify(base.rules) !== stableStringify(cur.rules)) {
      const conditionDiffs = diffRules(base.rules, cur.rules);
      changes.push(
        mk("segment_rules", {
          segmentId: id,
          segmentName: cur.name,
          before: base.rules,
          after: cur.rules,
          conditionDiffs,
          summary: `Segment "${cur.name}" rules changed (${describeConditionDiffs(conditionDiffs)})`,
          affectedFeatures: usersOf(id),
        }),
      );
    }
  }
  for (const [id, base] of baseSeg) {
    if (!curSeg.has(id)) {
      changes.push(mk("segment_removed", { segmentId: id, segmentName: base.name, before: base.rules, after: null, summary: `Segment "${base.name}" was deleted`, affectedFeatures: baseline.features.filter((f) => f.overrides.some((o) => o.segmentId === id)).map((f) => f.name) }));
    }
  }
  return changes;
}

type Partial2 = Omit<ConfigChange, "id" | "kind" | "featureName" | "segmentId" | "segmentName"> &
  Partial<Pick<ConfigChange, "featureName" | "segmentId" | "segmentName">>;

function mk(kind: ConfigChange["kind"], p: Partial2): ConfigChange {
  const featureName = p.featureName ?? null;
  const segmentId = p.segmentId ?? null;
  const id = ["chg", kind, featureName ?? "-", segmentId ?? "-"].join(":");
  return { id, kind, featureName, segmentId, segmentName: p.segmentName ?? null, ...p } as ConfigChange;
}

export function sameValue(a: FlagValue, b: FlagValue): boolean {
  return (a ?? null) === (b ?? null);
}

export function fmt(v: unknown): string {
  if (v === null || v === undefined) return "empty";
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}

interface FlatCondition {
  path: string;
  condition: NormalizedCondition;
}

function flatten(rules: NormalizedRule[], prefix = ""): FlatCondition[] {
  const out: FlatCondition[] = [];
  rules.forEach((r, i) => {
    const p = `${prefix}${r.type}[${i}]`;
    r.conditions.forEach((c, j) => out.push({ path: `${p}.condition[${j}]`, condition: c }));
    out.push(...flatten(r.rules, `${p}/`));
  });
  return out;
}

/** Path-addressed condition diff, so the UI can show exactly which condition moved. */
export function diffRules(before: NormalizedRule[], after: NormalizedRule[]): ConditionDiff[] {
  const a = new Map(flatten(before).map((f) => [f.path, f.condition]));
  const b = new Map(flatten(after).map((f) => [f.path, f.condition]));
  const diffs: ConditionDiff[] = [];
  for (const [path, c] of b) {
    const old = a.get(path);
    if (!old) diffs.push({ path, status: "added", before: null, after: c });
    else if (stableStringify(old) !== stableStringify(c)) diffs.push({ path, status: "changed", before: old, after: c });
  }
  for (const [path, c] of a) if (!b.has(path)) diffs.push({ path, status: "removed", before: c, after: null });
  return diffs;
}

export function conditionText(c: NormalizedCondition | null): string {
  if (!c) return "none";
  return `${c.property || "(identity)"} ${c.operator} ${c.value ?? ""}`.trim();
}

function describeConditionDiffs(d: ConditionDiff[]): string {
  if (d.length === 0) return "rule structure changed";
  return d
    .slice(0, 3)
    .map((x) =>
      x.status === "changed"
        ? `${conditionText(x.before)} -> ${conditionText(x.after)}`
        : x.status === "added"
          ? `added ${conditionText(x.after)}`
          : `removed ${conditionText(x.before)}`,
    )
    .join("; ");
}
