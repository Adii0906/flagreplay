import { describe, expect, it } from "vitest";
import { compareConfigs } from "@/lib/diff/compare";
import { buildRecoveryCandidates } from "@/lib/recovery/candidates";
import { detectDrift, verifyRecovery } from "@/lib/recovery/verify";
import { DEMO_SCENARIOS, replay } from "@/lib/demo/fixtures";
import type { NormalizedConfig } from "@/lib/types";

function setup() {
  const configs = replay(DEMO_SCENARIOS["checkout-beta"]);
  const baseline = configs[0];
  const current = configs[configs.length - 1];
  const changes = compareConfigs(baseline, current);
  const actions = buildRecoveryCandidates(changes, baseline, current);
  return { baseline, current, actions };
}

function applyLocally(c: NormalizedConfig, a: ReturnType<typeof setup>["actions"][number]): NormalizedConfig {
  const out = structuredClone(c);
  if (a.type === "restore_segment_rules") out.segments.find((s) => s.id === a.segmentId)!.rules = structuredClone(a.to);
  else if (a.type === "set_feature_state") Object.assign(out.features.find((f) => f.name === a.featureName)!, a.to);
  return out;
}

describe("recovery candidates", () => {
  it("builds a targeted revert for each reversible change", () => {
    const { actions } = setup();
    expect(actions.map((a) => a.id).sort()).toEqual([
      "act:feature_state:checkout_upsell",
      "act:feature_state:promo_banner",
      "act:feature_state:search_v2",
      "act:segment_rules:101",
    ]);
    const seg = actions.find((a) => a.id === "act:segment_rules:101")!;
    expect(seg.type).toBe("restore_segment_rules");
  });

  it("marks feature state writes unavailable under v2 feature versioning", () => {
    const configs = replay(DEMO_SCENARIOS["feature-disabled"]);
    const cur = structuredClone(configs[configs.length - 1]);
    cur.environment.versioningV2 = true;
    const actions = buildRecoveryCandidates(compareConfigs(configs[0], cur), configs[0], cur);
    expect(actions.every((a) => !a.available && a.unavailableReason)).toBe(true);
  });
});

describe("recovery safety", () => {
  it("aborts when the target changed after the investigation", () => {
    const { current, actions } = setup();
    const seg = actions.find((a) => a.id === "act:segment_rules:101")!;
    expect(detectDrift(seg, current).drifted).toBe(false);
    const moved = structuredClone(current);
    moved.segments.find((s) => s.id === 101)!.rules[0].rules[0].conditions[0].value = "someone-else";
    const d = detectDrift(seg, moved);
    expect(d.drifted).toBe(true);
    expect(d.message).toMatch(/changed after the investigation/);
  });

  it("aborts when the target object no longer exists", () => {
    const { current, actions } = setup();
    const a = actions.find((x) => x.id === "act:feature_state:search_v2")!;
    const gone = structuredClone(current);
    gone.features = gone.features.filter((f) => f.name !== "search_v2");
    expect(detectDrift(a, gone).drifted).toBe(true);
  });

  it("verifies the intended state and confirms unrelated config is untouched", () => {
    const { current, actions } = setup();
    const seg = actions.find((a) => a.id === "act:segment_rules:101")!;
    const after = applyLocally(current, seg);
    const v = verifyRecovery(seg, current, after);
    expect(v.status).toBe("verified");
    expect(v.unrelatedChanges).toEqual([]);
  });

  it("reports unrelated concurrent changes and fails when target not reached", () => {
    const { current, actions } = setup();
    const seg = actions.find((a) => a.id === "act:segment_rules:101")!;
    const after = applyLocally(current, seg);
    after.features.find((f) => f.name === "dark_mode")!.enabled = false;
    expect(verifyRecovery(seg, current, after).unrelatedChanges).toHaveLength(1);
    expect(verifyRecovery(seg, current, structuredClone(current)).status).toBe("failed");
  });
});
