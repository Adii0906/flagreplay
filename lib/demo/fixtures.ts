import type { HistoryDetail, NormalizedConfig, NormalizedFeature, NormalizedRule } from "../types";

/**
 * DEMO FIXTURES. Everything in this file is sample data, clearly labelled in the
 * UI as "Demo fixture". It is never mixed with live Flagsmith data.
 */

export type DemoScenarioId = "checkout-beta" | "feature-disabled" | "env-drift";

export interface DemoStep {
  timestamp: string;
  actor: string;
  title: string;
  objectType: "FEATURE_STATE" | "SEGMENT";
  details: HistoryDetail[];
  mutate: (c: NormalizedConfig) => void;
}

export interface DemoScenario {
  id: DemoScenarioId;
  label: string;
  incident: string;
  initial: NormalizedConfig;
  steps: DemoStep[];
  /** For env-drift: the other environment's configuration. */
  compare?: NormalizedConfig;
}

const PROJECT = { projectId: 4211, projectName: "Acme Storefront" };
const PROD = { id: 9301, apiKey: "demo_env_production", name: "Production", versioningV2: false };
const STAGING = { id: 9302, apiKey: "demo_env_staging", name: "Staging", versioningV2: false };

const anyIn = (property: string, operator: string, value: string): NormalizedRule[] => [
  { type: "ALL", conditions: [], rules: [{ type: "ANY", conditions: [{ property, operator, value, description: null }], rules: [] }] },
];

function f(
  id: number,
  name: string,
  enabled: boolean,
  value: string | number | boolean | null,
  overrides: NormalizedFeature["overrides"] = [],
): NormalizedFeature {
  return { id, name, type: "STANDARD", featureStateId: id * 10, enabled, value, overrides };
}

function feature(c: NormalizedConfig, name: string): NormalizedFeature {
  const x = c.features.find((ft) => ft.name === name);
  if (!x) throw new Error(`fixture feature ${name} missing`);
  return x;
}

function sortConfig(c: NormalizedConfig): NormalizedConfig {
  c.features.sort((a, b) => a.name.localeCompare(b.name));
  c.segments.sort((a, b) => a.id - b.id);
  return c;
}

/* ---------------- Scenario 1: beta users lost checkout access ---------------- */

const checkoutInitial: NormalizedConfig = sortConfig({
  mode: "demo",
  ...PROJECT,
  environment: PROD,
  capturedAt: "2026-11-19T09:00:00.000Z",
  segments: [
    { id: 101, name: "beta_users", rules: anyIn("cohort", "IN", "beta,early_access") },
    { id: 102, name: "internal_staff", rules: anyIn("email", "CONTAINS", "@acme.dev") },
  ],
  features: [
    f(501, "new_checkout", false, null, [
      { segmentId: 101, segmentName: "beta_users", featureSegmentId: 7001, featureStateId: 8001, priority: 0, enabled: true, value: null },
      { segmentId: 102, segmentName: "internal_staff", featureSegmentId: 7002, featureStateId: 8002, priority: 1, enabled: true, value: null },
    ]),
    f(502, "checkout_upsell", false, null),
    f(503, "search_v2", true, "control"),
    f(504, "promo_banner", true, "Black Friday"),
    f(505, "dark_mode", true, null),
  ],
});

const checkoutSteps: DemoStep[] = [
  {
    timestamp: "2026-11-20T10:12:00.000Z",
    actor: "alex.morgan@acme.dev",
    title: "Flag state / Remote config value updated for feature: promo_banner",
    objectType: "FEATURE_STATE",
    details: [{ field: "feature_state_value", old: "Black Friday", new: "Cyber Monday" }],
    mutate: (c) => void (feature(c, "promo_banner").value = "Cyber Monday"),
  },
  {
    timestamp: "2026-11-21T14:03:00.000Z",
    actor: "release-bot (API key)",
    title: "Flag state / Remote config value updated for feature: search_v2",
    objectType: "FEATURE_STATE",
    details: [{ field: "feature_state_value", old: "control", new: "variant_b" }],
    mutate: (c) => void (feature(c, "search_v2").value = "variant_b"),
  },
  {
    timestamp: "2026-11-22T16:47:00.000Z",
    actor: "priya.shah@acme.dev",
    title: "Segment updated: beta_users",
    objectType: "SEGMENT",
    details: [{ field: "rules[ALL][ANY].condition[cohort IN]", old: "beta,early_access", new: "early_access" }],
    mutate: (c) => {
      const s = c.segments.find((x) => x.id === 101)!;
      s.rules = anyIn("cohort", "IN", "early_access");
    },
  },
  {
    timestamp: "2026-11-23T09:05:00.000Z",
    actor: "release-bot (API key)",
    title: "Flag state updated for feature: checkout_upsell",
    objectType: "FEATURE_STATE",
    details: [{ field: "enabled", old: false, new: true }],
    mutate: (c) => void (feature(c, "checkout_upsell").enabled = true),
  },
];

/* ---------------- Scenario 2: a feature unexpectedly became disabled ---------------- */

const disabledInitial: NormalizedConfig = sortConfig({
  mode: "demo",
  ...PROJECT,
  environment: PROD,
  capturedAt: "2026-11-19T09:00:00.000Z",
  segments: [{ id: 102, name: "internal_staff", rules: anyIn("email", "CONTAINS", "@acme.dev") }],
  features: [
    f(601, "invoice_export", true, null),
    f(602, "bulk_edit", true, null),
    f(603, "onboarding_tour", true, "v3"),
    f(604, "rate_limit_rps", true, 100),
    f(605, "audit_trail_ui", false, null, [
      { segmentId: 102, segmentName: "internal_staff", featureSegmentId: 7101, featureStateId: 8101, priority: 0, enabled: true, value: null },
    ]),
  ],
});

const disabledSteps: DemoStep[] = [
  {
    timestamp: "2026-11-21T11:20:00.000Z",
    actor: "sam.okafor@acme.dev",
    title: "Flag state / Remote config value updated for feature: rate_limit_rps",
    objectType: "FEATURE_STATE",
    details: [{ field: "feature_state_value", old: 100, new: 150 }],
    mutate: (c) => void (feature(c, "rate_limit_rps").value = 150),
  },
  {
    timestamp: "2026-11-23T07:42:00.000Z",
    actor: "jordan.lee@acme.dev",
    title: "Flag state updated for feature: invoice_export",
    objectType: "FEATURE_STATE",
    details: [{ field: "enabled", old: true, new: false }],
    mutate: (c) => void (feature(c, "invoice_export").enabled = false),
  },
  {
    timestamp: "2026-11-23T08:10:00.000Z",
    actor: "jordan.lee@acme.dev",
    title: "Flag state / Remote config value updated for feature: onboarding_tour",
    objectType: "FEATURE_STATE",
    details: [{ field: "feature_state_value", old: "v3", new: "v4" }],
    mutate: (c) => void (feature(c, "onboarding_tour").value = "v4"),
  },
];

/* ---------------- Scenario 3: staging and production differ ---------------- */

const driftProduction: NormalizedConfig = sortConfig({
  mode: "demo",
  ...PROJECT,
  environment: PROD,
  capturedAt: "2026-11-23T09:30:00.000Z",
  segments: [{ id: 101, name: "beta_users", rules: anyIn("cohort", "IN", "beta,early_access") }],
  features: [
    f(501, "new_checkout", false, null, [
      { segmentId: 101, segmentName: "beta_users", featureSegmentId: 7001, featureStateId: 8001, priority: 0, enabled: true, value: null },
    ]),
    f(701, "payments_provider", true, "stripe_v1"),
    f(604, "rate_limit_rps", true, 100),
    f(505, "dark_mode", true, null),
  ],
});

const driftStaging: NormalizedConfig = sortConfig({
  ...structuredClone(driftProduction),
  environment: STAGING,
  features: [
    f(501, "new_checkout", false, null, [
      { segmentId: 101, segmentName: "beta_users", featureSegmentId: 7201, featureStateId: 8201, priority: 0, enabled: true, value: null },
    ]),
    f(701, "payments_provider", true, "stripe_v2"),
    f(604, "rate_limit_rps", true, 250),
    f(505, "dark_mode", true, null),
  ].map((x) => ({ ...x, featureStateId: (x.featureStateId ?? 0) + 1 })),
});

const driftSteps: DemoStep[] = [
  {
    timestamp: "2026-11-21T15:30:00.000Z",
    actor: "maria.chen@acme.dev",
    title: "Flag state / Remote config value updated for feature: payments_provider (Staging)",
    objectType: "FEATURE_STATE",
    details: [{ field: "feature_state_value", old: "stripe_v1", new: "stripe_v2" }],
    mutate: () => undefined,
  },
  {
    timestamp: "2026-11-22T10:05:00.000Z",
    actor: "maria.chen@acme.dev",
    title: "Flag state / Remote config value updated for feature: rate_limit_rps (Staging)",
    objectType: "FEATURE_STATE",
    details: [{ field: "feature_state_value", old: 100, new: 250 }],
    mutate: () => undefined,
  },
];

export const DEMO_SCENARIOS: Record<DemoScenarioId, DemoScenario> = {
  "checkout-beta": {
    id: "checkout-beta",
    label: "Beta users lost checkout access",
    incident: "Beta users suddenly cannot access the new checkout.",
    initial: checkoutInitial,
    steps: checkoutSteps,
  },
  "feature-disabled": {
    id: "feature-disabled",
    label: "A feature unexpectedly became disabled",
    incident: "Customers report the invoice export button disappeared this morning.",
    initial: disabledInitial,
    steps: disabledSteps,
  },
  "env-drift": {
    id: "env-drift",
    label: "Staging and production have different configurations",
    incident: "Payments work in staging but production behaves differently.",
    initial: driftProduction,
    steps: driftSteps,
    compare: driftStaging,
  },
};

/** Picks a scenario deterministically from free text when no scenario was chosen explicitly. */
export function matchScenario(text: string): DemoScenarioId {
  const t = text.toLowerCase();
  if (/(staging|production|prod\b|environment|drift|differ)/.test(t)) return "env-drift";
  if (/(disabled|disappeared|turned off|switched off|missing|invoice|export|gone)/.test(t)) return "feature-disabled";
  return "checkout-beta";
}

/** Replays the fixture steps and returns the config after each step (index 0 = initial). */
export function replay(s: DemoScenario): NormalizedConfig[] {
  const out: NormalizedConfig[] = [structuredClone(s.initial)];
  let cur = structuredClone(s.initial);
  for (const step of s.steps) {
    cur = structuredClone(cur);
    step.mutate(cur);
    cur.capturedAt = step.timestamp;
    out.push(structuredClone(cur));
  }
  return out;
}
