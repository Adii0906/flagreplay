import type { NormalizedConfig } from "../types";
import { compareConfigs, fmt } from "../diff/compare";
import { conditionText } from "../diff/compare";
import { stableStringify } from "../snapshot/normalize";
import type { RecoveryAction, StateValue, VerificationCheck, VerificationResult } from "./types";

type Target = { kind: "state"; value: StateValue } | { kind: "rules"; value: unknown } | { kind: "missing" };

/** Reads the object a recovery action targets out of a configuration. */
export function readTarget(config: NormalizedConfig, action: RecoveryAction): Target {
  if (action.type === "set_feature_state") {
    const f = config.features.find((x) => x.name === action.featureName);
    if (!f || f.featureStateId !== action.featureStateId) return { kind: "missing" };
    return { kind: "state", value: { enabled: f.enabled, value: f.value } };
  }
  if (action.type === "set_override_state") {
    const o = config.features.find((x) => x.name === action.featureName)?.overrides.find((x) => x.segmentId === action.segmentId);
    if (!o || o.featureStateId !== action.featureStateId) return { kind: "missing" };
    return { kind: "state", value: { enabled: o.enabled, value: o.value } };
  }
  const s = config.segments.find((x) => x.id === action.segmentId);
  return s ? { kind: "rules", value: s.rules } : { kind: "missing" };
}

function same(a: unknown, b: unknown) {
  return stableStringify(a) === stableStringify(b);
}

/**
 * Safeguard: the target must still be exactly as it was when the investigation
 * ran. If someone changed it since, the recovery is aborted.
 */
export function detectDrift(action: RecoveryAction, fresh: NormalizedConfig): { drifted: boolean; message: string | null } {
  const t = readTarget(fresh, action);
  if (t.kind === "missing") return { drifted: true, message: "The target object no longer exists in Flagsmith (it may have been deleted or recreated)." };
  if (!same(t.value, action.from)) {
    return {
      drifted: true,
      message: "The target configuration changed after the investigation ran. Recovery was aborted to avoid overwriting newer changes. Re-run the investigation.",
    };
  }
  if (same(action.from, action.to)) return { drifted: true, message: "The target is already in the intended state; nothing to apply." };
  return { drifted: false, message: null };
}

/** Compares the re-fetched configuration with the intended recovery state. */
export function verifyRecovery(action: RecoveryAction, before: NormalizedConfig, after: NormalizedConfig): VerificationResult {
  const checks: VerificationCheck[] = [];
  const t = readTarget(after, action);
  if (t.kind === "missing") {
    checks.push({ label: "Target object exists", expected: "present", actual: "missing", passed: false });
  } else if (action.type === "restore_segment_rules") {
    const actual = t.value as typeof action.to;
    const flatten = (rules: typeof action.to): string[] =>
      rules.flatMap((r) => [...r.conditions.map(conditionText), ...flatten(r.rules)]);
    checks.push({
      label: `Segment "${action.segmentName}" rules`,
      expected: flatten(action.to).join("; ") || "(no conditions)",
      actual: flatten(actual).join("; ") || "(no conditions)",
      passed: same(actual, action.to),
    });
  } else {
    const v = t.value as StateValue;
    checks.push({ label: "enabled", expected: String(action.to.enabled), actual: String(v.enabled), passed: v.enabled === action.to.enabled });
    checks.push({ label: "value", expected: fmt(action.to.value), actual: fmt(v.value), passed: same(v.value ?? null, action.to.value ?? null) });
  }

  const targetIds = new Set(
    compareConfigs(before, after)
      .filter((c) =>
        action.type === "restore_segment_rules"
          ? c.kind === "segment_rules" && c.segmentId === action.segmentId
          : action.type === "set_feature_state"
            ? (c.kind === "feature_enabled" || c.kind === "feature_value") && c.featureName === action.featureName
            : (c.kind === "override_enabled" || c.kind === "override_value") && c.featureName === action.featureName && c.segmentId === action.segmentId,
      )
      .map((c) => c.id),
  );
  const unrelated = compareConfigs(before, after).filter((c) => !targetIds.has(c.id)).map((c) => c.summary);
  const passed = checks.every((c) => c.passed);
  return {
    status: passed ? "verified" : "failed",
    checkedAt: new Date().toISOString(),
    checks,
    unrelatedChanges: unrelated,
    message: passed
      ? unrelated.length
        ? "Intended state confirmed. Other configuration also changed during recovery (likely a concurrent edit); review below."
        : "Intended state confirmed by re-reading the configuration. No other configuration changed."
      : "The re-read configuration does not match the intended recovery state.",
  };
}
