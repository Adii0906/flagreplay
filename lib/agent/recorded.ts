import type { DemoScenarioId } from "../demo/fixtures";
import type { AgentReport } from "./schema";

/**
 * RECORDED AGENT OUTPUT for demo fixtures, used only in demo mode when no
 * LLM_API_KEY is configured. The UI labels it "Recorded agent output". It is
 * validated against the same schema and evidence ids as a live model response.
 */
export const RECORDED_REPORTS: Record<DemoScenarioId, AgentReport> = {
  "checkout-beta": {
    incident_summary:
      "Beta users lost access to the new checkout in Production. new_checkout is off by default and is only served to users through segment overrides, so any change to those segments changes who sees it.",
    affected_features: ["new_checkout"],
    confirmed_changes: [
      { change_id: "chg:segment_rules:-:101", statement: "Segment beta_users condition changed from cohort IN \"beta,early_access\" to cohort IN \"early_access\"." },
      { change_id: "chg:feature_enabled:checkout_upsell:-", statement: "checkout_upsell was enabled in Production." },
      { change_id: "chg:feature_value:search_v2:-", statement: "search_v2 value changed from \"control\" to \"variant_b\"." },
      { change_id: "chg:feature_value:promo_banner:-", statement: "promo_banner value changed from \"Black Friday\" to \"Cyber Monday\"." },
    ],
    suspected_root_cause: {
      change_id: "chg:segment_rules:-:101",
      statement:
        "The beta_users segment no longer matches users whose cohort trait is \"beta\". new_checkout is disabled at environment level and enabled only through the beta_users and internal_staff overrides, so users with cohort=beta now fall through to the disabled default.",
      status: "likely",
    },
    evidence: [
      { statement: "The beta_users rule dropped the value \"beta\" from its cohort IN condition.", type: "confirmed", references: ["chg:segment_rules:-:101", "demo-audit:checkout-beta:2"] },
      { statement: "The segment change was made by priya.shah@acme.dev at 2026-11-22 16:47 UTC.", type: "confirmed", references: ["demo-audit:checkout-beta:2"] },
      { statement: "new_checkout is disabled by default in Production and enabled for beta_users via a segment override.", type: "confirmed", references: ["chg:segment_rules:-:101"] },
      { statement: "Users with cohort=beta who are not in early_access or internal_staff would now evaluate new_checkout as disabled.", type: "inference", references: ["chg:segment_rules:-:101"] },
      { statement: "The other changes do not touch new_checkout or its segments.", type: "inference", references: ["chg:feature_enabled:checkout_upsell:-", "chg:feature_value:search_v2:-"] },
    ],
    confidence: "high",
    confidence_rationale:
      "The change directly removes the beta cohort from the only segment that grants beta users access, and the mechanism follows from the override configuration. User impact is inferred, not measured.",
    alternative_hypotheses: [
      {
        hypothesis: "Enabling checkout_upsell broke the checkout flow.",
        assessment: "Less likely. It is a separate flag that adds behaviour and does not gate access to new_checkout. Worth checking if beta users report errors rather than missing access.",
      },
      {
        hypothesis: "The application stopped sending the cohort trait.",
        assessment: "Not visible in Flagsmith configuration. Check SDK identify calls if restoring the segment does not resolve it.",
      },
    ],
    recommended_action: {
      action_id: "act:segment_rules:101",
      summary: "Restore the beta_users segment rule to cohort IN \"beta,early_access\".",
      rationale: "This reverts only the segment rule change and leaves every flag and override untouched.",
    },
    recovery_payload: { action_id: "act:segment_rules:101" },
    verification_plan: [
      "Re-read segment beta_users from Flagsmith and confirm the condition is cohort IN \"beta,early_access\".",
      "Confirm the new_checkout overrides and all other configuration are unchanged.",
      "Evaluate flags for a test identity with cohort=beta and confirm new_checkout is enabled.",
    ],
  },
  "feature-disabled": {
    incident_summary: "The invoice export feature is unavailable in Production because its flag was switched off this morning.",
    affected_features: ["invoice_export"],
    confirmed_changes: [
      { change_id: "chg:feature_enabled:invoice_export:-", statement: "invoice_export was disabled in Production." },
      { change_id: "chg:feature_value:onboarding_tour:-", statement: "onboarding_tour value changed from \"v3\" to \"v4\"." },
      { change_id: "chg:feature_value:rate_limit_rps:-", statement: "rate_limit_rps changed from 100 to 150." },
    ],
    suspected_root_cause: {
      change_id: "chg:feature_enabled:invoice_export:-",
      statement: "invoice_export was toggled from enabled to disabled at environment level with no segment overrides, so it is off for every user in Production.",
      status: "likely",
    },
    evidence: [
      { statement: "invoice_export enabled changed from true to false.", type: "confirmed", references: ["chg:feature_enabled:invoice_export:-", "demo-audit:feature-disabled:1"] },
      { statement: "The change was made by jordan.lee@acme.dev at 2026-11-23 07:42 UTC.", type: "confirmed", references: ["demo-audit:feature-disabled:1"] },
      { statement: "The same author changed onboarding_tour 28 minutes later, which suggests a batch of edits where the toggle may have been accidental.", type: "inference", references: ["demo-audit:feature-disabled:2"] },
    ],
    confidence: "high",
    confidence_rationale: "The disabled flag name matches the missing feature directly and has no overrides that could keep it on for anyone.",
    alternative_hypotheses: [
      { hypothesis: "The disable was intentional (for example an incident kill switch).", assessment: "Possible. Confirm with jordan.lee@acme.dev before restoring." },
    ],
    recommended_action: {
      action_id: "act:feature_state:invoice_export",
      summary: "Re-enable invoice_export in Production.",
      rationale: "Reverts only the toggle; the flag value and other features are untouched.",
    },
    recovery_payload: { action_id: "act:feature_state:invoice_export" },
    verification_plan: [
      "Re-read invoice_export from Flagsmith and confirm enabled is true.",
      "Confirm no other configuration changed.",
    ],
  },
  "env-drift": {
    incident_summary: "Production and Staging differ in two remote config values, including the payments provider.",
    affected_features: ["payments_provider", "rate_limit_rps"],
    confirmed_changes: [
      { change_id: "chg:feature_value:payments_provider:-", statement: "payments_provider is \"stripe_v2\" in Staging and \"stripe_v1\" in Production." },
      { change_id: "chg:feature_value:rate_limit_rps:-", statement: "rate_limit_rps is 250 in Staging and 100 in Production." },
    ],
    suspected_root_cause: {
      change_id: "chg:feature_value:payments_provider:-",
      statement:
        "Staging was moved to stripe_v2 on 2026-11-21 but Production still uses stripe_v1. If the code being tested in Staging expects stripe_v2, Production will behave differently.",
      status: "likely",
    },
    evidence: [
      { statement: "payments_provider values differ between the two environments.", type: "confirmed", references: ["chg:feature_value:payments_provider:-"] },
      { statement: "Staging was changed to stripe_v2 by maria.chen@acme.dev.", type: "confirmed", references: ["demo-audit:env-drift:0"] },
      { statement: "The rate_limit_rps difference is less likely to explain a payments behaviour difference.", type: "inference", references: ["chg:feature_value:rate_limit_rps:-"] },
    ],
    confidence: "medium",
    confidence_rationale: "The drift is confirmed, but whether Production should match Staging is a release decision Flagsmith data cannot answer.",
    alternative_hypotheses: [
      { hypothesis: "The difference is an intentional staged rollout.", assessment: "Plausible. Align only if stripe_v2 is approved for Production." },
    ],
    recommended_action: {
      action_id: "act:feature_state:payments_provider",
      summary: "Set payments_provider in Production to \"stripe_v2\" to match Staging.",
      rationale: "Aligns only the payments value; rate_limit_rps and all other flags stay as they are.",
    },
    recovery_payload: { action_id: "act:feature_state:payments_provider" },
    verification_plan: ["Re-read payments_provider in Production and confirm it equals \"stripe_v2\".", "Confirm no other Production configuration changed."],
  },
};
