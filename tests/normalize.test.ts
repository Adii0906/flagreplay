import { describe, expect, it } from "vitest";
import { configHash, normalizeConfig, normalizeRules, normalizeValue } from "@/lib/snapshot/normalize";

const env = { id: 10, apiKey: "k", name: "Production", versioningV2: false };

describe("normalizeValue", () => {
  it("handles raw values and Flagsmith nested value objects", () => {
    expect(normalizeValue("x")).toBe("x");
    expect(normalizeValue(5)).toBe(5);
    expect(normalizeValue(null)).toBeNull();
    expect(normalizeValue(undefined)).toBeNull();
    expect(normalizeValue({ type: "int", integer_value: 42, string_value: null })).toBe(42);
    expect(normalizeValue({ type: "bool", boolean_value: false })).toBe(false);
    expect(normalizeValue({ type: "unicode", string_value: "hello" })).toBe("hello");
    expect(normalizeValue({ type: "unicode", string_value: null })).toBeNull();
  });
});

describe("normalizeRules", () => {
  it("stringifies condition values and keeps nesting", () => {
    const r = normalizeRules([{ type: "ALL", rules: [{ type: "ANY", conditions: [{ operator: "EQUAL", property: "age", value: 30 }] }], conditions: [] }]);
    expect(r[0].rules[0].conditions[0]).toEqual({ property: "age", operator: "EQUAL", value: "30", description: null });
  });
});

describe("normalizeConfig", () => {
  const input = {
    mode: "live" as const,
    project: { id: 1, name: "P" },
    environment: env,
    features: [
      { id: 2, name: "zeta" },
      { id: 1, name: "alpha" },
    ],
    featureStates: [
      { id: 10, feature: 1, enabled: true, feature_segment: null, feature_state_value: { type: "unicode", string_value: "v" } },
      { id: 11, feature: 1, enabled: false, feature_segment: 50, feature_state_value: null },
      { id: 12, feature: 1, enabled: true, feature_segment: null, identity: 99, feature_state_value: "identity" },
      { id: 13, feature: 2, enabled: false, feature_segment: null },
    ],
    featureSegments: [{ id: 50, segment: 7, priority: 0 }],
    segments: [{ id: 7, name: "beta", rules: [] }],
  };

  it("separates environment defaults, segment overrides and ignores identity overrides", () => {
    const c = normalizeConfig(input);
    expect(c.features.map((f) => f.name)).toEqual(["alpha", "zeta"]);
    const alpha = c.features[0];
    expect(alpha.featureStateId).toBe(10);
    expect(alpha.enabled).toBe(true);
    expect(alpha.value).toBe("v");
    expect(alpha.overrides).toHaveLength(1);
    expect(alpha.overrides[0]).toMatchObject({ segmentId: 7, segmentName: "beta", featureStateId: 11, enabled: false });
  });

  it("produces a hash that ignores capture time and row ids", () => {
    const a = normalizeConfig({ ...input, capturedAt: "2026-01-01T00:00:00Z" });
    const b = normalizeConfig({ ...input, capturedAt: "2026-02-01T00:00:00Z" });
    b.features[0].featureStateId = 999;
    expect(configHash(a)).toBe(configHash(b));
    b.features[0].enabled = false;
    expect(configHash(a)).not.toBe(configHash(b));
  });
});
