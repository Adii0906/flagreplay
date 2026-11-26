import { describe, expect, it } from "vitest";
import { validateAgentReport, type EvidenceIds } from "@/lib/agent/schema";
import { RECORDED_REPORTS } from "@/lib/agent/recorded";
import { runInvestigationAgent } from "@/lib/agent/investigate";
import type { LlmProvider } from "@/lib/agent/provider";
import { compareConfigs } from "@/lib/diff/compare";
import { buildRecoveryCandidates } from "@/lib/recovery/candidates";
import { DEMO_SCENARIOS, replay, type DemoScenarioId } from "@/lib/demo/fixtures";

function idsFor(id: DemoScenarioId): EvidenceIds {
  const s = DEMO_SCENARIOS[id];
  const configs = replay(s);
  const baseline = s.compare ?? configs[0];
  const current = configs[configs.length - 1];
  const changes = compareConfigs(baseline, current);
  const actions = buildRecoveryCandidates(changes, baseline, current);
  return {
    changeIds: new Set(changes.map((c) => c.id)),
    eventIds: new Set(s.steps.map((_, i) => `demo-audit:${id}:${i}`)),
    configurationIds: new Set(),
    actionIds: new Set(actions.map((a) => a.id)),
    availableActionIds: new Set(actions.filter((a) => a.available).map((a) => a.id)),
  };
}

describe("agent response validation", () => {
  it.each(["checkout-beta", "feature-disabled", "env-drift"] as DemoScenarioId[])("recorded report for %s matches the real evidence ids", (id) => {
    const r = validateAgentReport(RECORDED_REPORTS[id], idsFor(id));
    expect(r.ok, r.ok ? "" : r.errors.join("\n")).toBe(true);
  });

  it("rejects invented change ids and actions", () => {
    const bad = structuredClone(RECORDED_REPORTS["checkout-beta"]);
    bad.suspected_root_cause.change_id = "chg:made_up";
    bad.recommended_action.action_id = "act:delete_everything";
    bad.recovery_payload.action_id = "act:delete_everything";
    const r = validateAgentReport(bad, idsFor("checkout-beta"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join(" ")).toMatch(/unknown change_id/);
      expect(r.errors.join(" ")).toMatch(/unknown action_id/);
    }
  });

  it("rejects mismatched recovery payload and uncited confirmed evidence", () => {
    const bad = structuredClone(RECORDED_REPORTS["checkout-beta"]);
    bad.recovery_payload.action_id = null;
    bad.evidence[0].references = [];
    const r = validateAgentReport(bad, idsFor("checkout-beta"));
    expect(r.ok).toBe(false);
  });

  it("accepts confirmed configuration evidence only with a known configuration id", () => {
    const report = structuredClone(RECORDED_REPORTS["checkout-beta"]);
    const ids = idsFor("checkout-beta");
    ids.configurationIds.add("config:feature:new_checkout");
    report.evidence[0].references = ["config:feature:new_checkout"];
    expect(validateAgentReport(report, ids).ok).toBe(true);

    report.evidence[0].references = ["config:feature:invented"];
    const invalid = validateAgentReport(report, ids);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.errors.join(" ")).toMatch(/unknown id/);
  });

  it("rejects unavailable recovery actions", () => {
    const bad = structuredClone(RECORDED_REPORTS["checkout-beta"]);
    const ids = idsFor("checkout-beta");
    const unavailableId = ids.actionIds.values().next().value as string | undefined;
    if (unavailableId) {
      ids.availableActionIds.delete(unavailableId);
      bad.recommended_action.action_id = unavailableId;
      bad.recovery_payload.action_id = unavailableId;
    }
    const r = validateAgentReport(bad, ids);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/unavailable action_id/);
  });

  it("requires an undetermined cause when no changes exist", () => {
    const r = validateAgentReport(RECORDED_REPORTS["checkout-beta"], { changeIds: new Set(), eventIds: new Set(), configurationIds: new Set(), actionIds: new Set(), availableActionIds: new Set() });
    expect(r.ok).toBe(false);
  });

  it("rejects schema-invalid output", () => {
    expect(validateAgentReport({ incident_summary: "x" }, idsFor("checkout-beta")).ok).toBe(false);
    expect(validateAgentReport("not json", idsFor("checkout-beta")).ok).toBe(false);
  });
});

describe("runInvestigationAgent", () => {
  it("repairs once after an invalid response", async () => {
    const replies = [{ incident_summary: "broken" }, RECORDED_REPORTS["checkout-beta"]];
    const calls: number[] = [];
    const provider: LlmProvider = { name: "fake", model: "fake", completeJson: async (m) => (calls.push(m.length), replies.shift()) };
    const r = await runInvestigationAgent(provider, { incident: "x" }, idsFor("checkout-beta"));
    expect(r.attempts).toBe(2);
    expect(calls).toEqual([2, 4]);
  });

  it("fails clearly after two invalid responses", async () => {
    const provider: LlmProvider = { name: "fake", model: "fake", completeJson: async () => ({}) };
    await expect(runInvestigationAgent(provider, { incident: "x" }, idsFor("checkout-beta"))).rejects.toThrow(/failed validation twice/);
  });
});
