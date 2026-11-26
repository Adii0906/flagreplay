export type Mode = "live" | "demo";
export type FlagValue = string | number | boolean | null;

export interface NormalizedCondition {
  property: string;
  operator: string;
  value: string | null;
  description: string | null;
}

export interface NormalizedRule {
  type: string;
  conditions: NormalizedCondition[];
  rules: NormalizedRule[];
}

export interface NormalizedSegment {
  id: number;
  name: string;
  rules: NormalizedRule[];
}

export interface NormalizedOverride {
  segmentId: number;
  segmentName: string;
  featureSegmentId: number | null;
  featureStateId: number | null;
  priority: number | null;
  enabled: boolean;
  value: FlagValue;
}

export interface NormalizedFeature {
  id: number;
  name: string;
  type: string | null;
  featureStateId: number | null;
  enabled: boolean;
  value: FlagValue;
  overrides: NormalizedOverride[];
}

export interface EnvironmentInfo {
  id: number;
  apiKey: string;
  name: string;
  versioningV2: boolean;
}

export interface NormalizedConfig {
  mode: Mode;
  projectId: number;
  projectName: string;
  environment: EnvironmentInfo;
  capturedAt: string;
  features: NormalizedFeature[];
  segments: NormalizedSegment[];
}

export type SnapshotSource =
  | "manual"
  | "investigation"
  | "webhook"
  | "pre_recovery"
  | "post_recovery"
  | "demo_fixture";

export interface Snapshot {
  id: string;
  mode: Mode;
  environmentKey: string;
  capturedAt: string;
  hash: string;
  source: SnapshotSource;
  config: NormalizedConfig;
}

export type ChangeKind =
  | "feature_added"
  | "feature_removed"
  | "feature_enabled"
  | "feature_value"
  | "override_added"
  | "override_removed"
  | "override_enabled"
  | "override_value"
  | "override_priority"
  | "segment_added"
  | "segment_removed"
  | "segment_rules";

export interface ConditionDiff {
  path: string;
  status: "changed" | "added" | "removed";
  before: NormalizedCondition | null;
  after: NormalizedCondition | null;
}

export interface ConfigChange {
  id: string;
  kind: ChangeKind;
  featureName: string | null;
  segmentId: number | null;
  segmentName: string | null;
  before: unknown;
  after: unknown;
  summary: string;
  affectedFeatures: string[];
  conditionDiffs?: ConditionDiff[];
  relevance?: number;
  matchedTerms?: string[];
}

export type HistorySource =
  | "flagsmith_audit"
  | "flagsmith_webhook"
  | "flagreplay_snapshot"
  | "demo_fixture";

export interface HistoryDetail {
  field: string;
  old: unknown;
  new: unknown;
}

export interface HistoryEvent {
  id: string;
  timestamp: string;
  /** For snapshot-derived events, the change happened between windowStart and timestamp. */
  windowStart?: string | null;
  source: HistorySource;
  title: string;
  actor: string | null;
  objectType: string | null;
  objectId: string | null;
  details: HistoryDetail[];
  relatedChangeIds: string[];
  relevant: boolean;
}

export interface AuditAvailability {
  available: boolean;
  reason: string | null;
  retrieved: number;
}

export interface ConnectionInfo {
  mode: Mode;
  ok: boolean;
  projectId: number | null;
  projectName: string | null;
  environmentName: string | null;
  environmentId: number | null;
  versioningV2: boolean;
  auditLog: "available" | "unavailable" | "unknown";
  compareEnvironmentName: string | null;
  message: string | null;
  llmConfigured: boolean;
  llmProvider: string;
  llmModel: string;
}
