import type { FlagValue, NormalizedRule } from "../types";

export interface StateValue {
  enabled: boolean;
  value: FlagValue;
}

interface Base {
  id: string;
  title: string;
  changeIds: string[];
  affectedFeatures: string[];
  available: boolean;
  unavailableReason: string | null;
}

export interface SetFeatureStateAction extends Base {
  type: "set_feature_state";
  featureName: string;
  featureId: number;
  featureStateId: number;
  from: StateValue;
  to: StateValue;
}

export interface SetOverrideStateAction extends Base {
  type: "set_override_state";
  featureName: string;
  featureId: number;
  segmentId: number;
  segmentName: string;
  featureStateId: number;
  from: StateValue;
  to: StateValue;
}

export interface RestoreSegmentRulesAction extends Base {
  type: "restore_segment_rules";
  segmentId: number;
  segmentName: string;
  from: NormalizedRule[];
  to: NormalizedRule[];
}

export type RecoveryAction = SetFeatureStateAction | SetOverrideStateAction | RestoreSegmentRulesAction;

export interface VerificationCheck {
  label: string;
  expected: string;
  actual: string;
  passed: boolean;
}

export interface VerificationResult {
  status: "verified" | "failed";
  checkedAt: string;
  checks: VerificationCheck[];
  unrelatedChanges: string[];
  message: string;
}
