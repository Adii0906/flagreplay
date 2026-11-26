import type { ConfigChange, NormalizedConfig } from "../types";
import type { RecoveryAction } from "./types";

/**
 * Deterministically derives "revert to baseline" recovery actions from the
 * detected changes. The AI may only choose among these by id; it never
 * authors a payload.
 */
export function buildRecoveryCandidates(
  changes: ConfigChange[],
  baseline: NormalizedConfig,
  current: NormalizedConfig,
): RecoveryAction[] {
  const actions: RecoveryAction[] = [];
  const v2 = current.environment.versioningV2;
  const v2Reason =
    "This environment uses Flagsmith v2 feature versioning, which rejects direct feature state writes. Publish a new version from the Flagsmith dashboard instead.";

  const featureChanges = new Map<string, ConfigChange[]>();
  const overrideChanges = new Map<string, ConfigChange[]>();

  for (const c of changes) {
    if ((c.kind === "feature_enabled" || c.kind === "feature_value") && c.featureName) {
      featureChanges.set(c.featureName, [...(featureChanges.get(c.featureName) ?? []), c]);
    } else if ((c.kind === "override_enabled" || c.kind === "override_value") && c.featureName && c.segmentId != null) {
      const key = `${c.featureName}::${c.segmentId}`;
      overrideChanges.set(key, [...(overrideChanges.get(key) ?? []), c]);
    } else if (c.kind === "segment_rules" && c.segmentId != null) {
      const base = baseline.segments.find((s) => s.id === c.segmentId);
      const cur = current.segments.find((s) => s.id === c.segmentId);
      if (!base || !cur) continue;
      actions.push({
        id: `act:segment_rules:${c.segmentId}`,
        type: "restore_segment_rules",
        title: `Restore the previous rules of segment "${cur.name}"`,
        segmentId: c.segmentId,
        segmentName: cur.name,
        from: cur.rules,
        to: base.rules,
        changeIds: [c.id],
        affectedFeatures: c.affectedFeatures,
        available: true,
        unavailableReason: null,
      });
    }
  }

  for (const [name, list] of featureChanges) {
    const base = baseline.features.find((f) => f.name === name);
    const cur = current.features.find((f) => f.name === name);
    if (!base || !cur || cur.featureStateId == null) continue;
    actions.push({
      id: `act:feature_state:${name}`,
      type: "set_feature_state",
      title: `Restore "${name}" to its previous state in ${current.environment.name}`,
      featureName: name,
      featureId: cur.id,
      featureStateId: cur.featureStateId,
      from: { enabled: cur.enabled, value: cur.value },
      to: { enabled: base.enabled, value: base.value },
      changeIds: list.map((c) => c.id),
      affectedFeatures: [name],
      available: !v2,
      unavailableReason: v2 ? v2Reason : null,
    });
  }

  for (const [key, list] of overrideChanges) {
    const [name, segIdRaw] = key.split("::");
    const segmentId = Number(segIdRaw);
    const base = baseline.features.find((f) => f.name === name)?.overrides.find((o) => o.segmentId === segmentId);
    const curFeature = current.features.find((f) => f.name === name);
    const cur = curFeature?.overrides.find((o) => o.segmentId === segmentId);
    if (!base || !cur || !curFeature || cur.featureStateId == null) continue;
    actions.push({
      id: `act:override_state:${name}:${segmentId}`,
      type: "set_override_state",
      title: `Restore the "${cur.segmentName}" override on "${name}"`,
      featureName: name,
      featureId: curFeature.id,
      segmentId,
      segmentName: cur.segmentName,
      featureStateId: cur.featureStateId,
      from: { enabled: cur.enabled, value: cur.value },
      to: { enabled: base.enabled, value: base.value },
      changeIds: list.map((c) => c.id),
      affectedFeatures: [name],
      available: !v2,
      unavailableReason: v2 ? v2Reason : null,
    });
  }

  return actions;
}
