import { describe, expect, it } from "vitest";
import { compareConfigs, diffRules } from "@/lib/diff/compare";
import { DEMO_SCENARIOS, replay } from "@/lib/demo/fixtures";

describe("compareConfigs", () => {
  it("detects the beta segment rule change in the seeded scenario", () => {
    const configs = replay(DEMO_SCENARIOS["checkout-beta"]);
    const changes = compareConfigs(configs[0], configs[configs.length - 1]);
    const seg = changes.find((c) => c.kind === "segment_rules");
    expect(seg).toBeDefined();
    expect(seg!.id).toBe("chg:segment_rules:-:101");
    expect(seg!.affectedFeatures).toEqual(["new_checkout"]);
    expect(seg!.conditionDiffs).toEqual([
      expect.objectContaining({ status: "changed", before: expect.objectContaining({ value: "beta,early_access" }), after: expect.objectContaining({ value: "early_access" }) }),
    ]);
    expect(changes.map((c) => c.kind).sort()).toEqual(["feature_enabled", "feature_value", "feature_value", "segment_rules"]);
  });

  it("returns no changes for identical configurations", () => {
    const c = replay(DEMO_SCENARIOS["feature-disabled"])[0];
    expect(compareConfigs(c, structuredClone(c))).toEqual([]);
  });

  it("detects override add, remove and toggle", () => {
    const base = replay(DEMO_SCENARIOS["checkout-beta"])[0];
    const cur = structuredClone(base);
    const nc = cur.features.find((f) => f.name === "new_checkout")!;
    nc.overrides[0].enabled = false;
    nc.overrides.splice(1, 1);
    cur.features.find((f) => f.name === "dark_mode")!.overrides.push({ segmentId: 101, segmentName: "beta_users", featureSegmentId: 1, featureStateId: 2, priority: 0, enabled: true, value: null });
    const kinds = compareConfigs(base, cur).map((c) => c.kind).sort();
    expect(kinds).toEqual(["override_added", "override_enabled", "override_removed"]);
  });
});

describe("diffRules", () => {
  it("reports added and removed conditions by path", () => {
    const before = [{ type: "ALL", conditions: [{ property: "a", operator: "EQUAL", value: "1", description: null }], rules: [] }];
    const after = [{ type: "ALL", conditions: [], rules: [] }];
    expect(diffRules(before, after)).toEqual([{ path: "ALL[0].condition[0]", status: "removed", before: before[0].conditions[0], after: null }]);
    expect(diffRules(after, before)[0].status).toBe("added");
  });
});
