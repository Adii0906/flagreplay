import { describe, expect, it } from "vitest";
import { LiveFlagsmithSource } from "@/lib/flagsmith/client";
import { compareConfigs } from "@/lib/diff/compare";
import { buildRecoveryCandidates } from "@/lib/recovery/candidates";
import { verifyRecovery } from "@/lib/recovery/verify";
import { mockFetch, seedState } from "./mock-flagsmith";

const cfg = (environment = "10") => ({
  apiUrl: "https://mock.flagsmith.test",
  token: "test-token",
  projectId: 1,
  environment,
  compareEnvironment: "stgKey456",
  webhookSecret: null,
  timeoutMs: 1000,
  cacheTtlMs: 0,
});

describe("LiveFlagsmithSource against a mock Flagsmith API", () => {
  it("builds a normalized configuration from the Management API", async () => {
    const state = seedState();
    const src = new LiveFlagsmithSource(cfg(), mockFetch(state));
    const c = await src.fetchConfig({ fresh: true });
    expect(c.environment).toMatchObject({ id: 10, apiKey: "prodKey123", name: "Production" });
    const nc = c.features.find((f) => f.name === "new_checkout")!;
    expect(nc.enabled).toBe(false);
    expect(nc.overrides).toEqual([expect.objectContaining({ segmentId: 900, segmentName: "beta_users", featureStateId: 1001, enabled: true })]);
    expect(c.features.find((f) => f.name === "banner_text")!.value).toBe("hello");
    expect(c.segments[0].rules[0].rules[0].conditions[0].value).toBe("beta,early_access");
  });

  it("accepts the environment API key instead of the numeric id", async () => {
    const src = new LiveFlagsmithSource(cfg("prodKey123"), mockFetch(seedState()));
    expect((await src.fetchConfig()).environment.id).toBe(10);
  });

  it("explains a missing environment", async () => {
    const src = new LiveFlagsmithSource(cfg("999"), mockFetch(seedState()));
    await expect(src.fetchConfig()).rejects.toThrow(/not found in project 1/);
  });

  it("reports a bad token as unauthorized", async () => {
    const src = new LiveFlagsmithSource({ ...cfg(), token: "wrong" }, mockFetch(seedState()));
    await expect(src.fetchConfig()).rejects.toMatchObject({ code: "unauthorized" });
    const conn = await src.connection();
    expect(conn.ok).toBe(false);
    expect(conn.message).toMatch(/401/);
  });

  it("reads audit history with change details, or reports it unavailable on 403", async () => {
    const state = seedState();
    const src = new LiveFlagsmithSource(cfg(), mockFetch(state));
    const c = await src.fetchConfig();
    const h = await src.fetchHistory(c);
    expect(h.availability.available).toBe(true);
    expect(h.events[0]).toMatchObject({ source: "flagsmith_audit", actor: "dev@example.com", title: "Segment updated: beta_users" });
    expect(h.events[0].details[0]).toMatchObject({ field: "rules" });

    state.auditForbidden = true;
    const h2 = await src.fetchHistory(c);
    expect(h2.availability.available).toBe(false);
    expect(h2.events).toEqual([]);
    expect(h2.availability.reason).toMatch(/not accessible/);
  });

  it("restores a segment rule with a rules-only PATCH and verifies by re-reading", async () => {
    const state = seedState();
    const src = new LiveFlagsmithSource(cfg(), mockFetch(state));
    const baseline = await src.fetchConfig({ fresh: true });
    // Someone breaks the segment in Flagsmith.
    (state.segments[0].rules[0] as { rules: { conditions: { value: string }[] }[] }).rules[0].conditions[0].value = "early_access";
    const current = await src.fetchConfig({ fresh: true });
    const changes = compareConfigs(baseline, current);
    const action = buildRecoveryCandidates(changes, baseline, current).find((a) => a.type === "restore_segment_rules")!;

    await src.applyAction(action, current);
    const patch = state.requests.find((r) => r.method === "PATCH")!;
    expect(patch.path).toBe("/projects/1/segments/900/");
    expect(Object.keys(patch.body as object)).toEqual(["rules"]);

    const after = await src.fetchConfig({ fresh: true });
    const v = verifyRecovery(action, current, after);
    expect(v.status).toBe("verified");
    expect(v.unrelatedChanges).toEqual([]);
  });

  it("restores an environment feature state and a segment override with the documented endpoints", async () => {
    const state = seedState();
    const src = new LiveFlagsmithSource(cfg(), mockFetch(state));
    const baseline = await src.fetchConfig({ fresh: true });
    state.featureStates.find((s) => s.id === 1002)!.enabled = false;
    state.featureStates.find((s) => s.id === 1001)!.enabled = false;
    const current = await src.fetchConfig({ fresh: true });
    const actions = buildRecoveryCandidates(compareConfigs(baseline, current), baseline, current);
    for (const a of actions) await src.applyAction(a, current);
    const patches = state.requests.filter((r) => r.method === "PATCH");
    expect(patches.map((p) => p.path).sort()).toEqual(["/environments/prodKey123/featurestates/1002/", "/features/featurestates/1001/"]);
    expect(patches.find((p) => p.path.startsWith("/features/"))!.body).toEqual({ enabled: true, feature_state_value: { type: "unicode", string_value: null } });
    const after = await src.fetchConfig({ fresh: true });
    expect(compareConfigs(baseline, after)).toEqual([]);
  });
});
