import { z } from "zod";

/**
 * Response schemas for the Flagsmith Management API (v1), derived from the
 * Flagsmith API serializers. Only fields FlagReplay reads are declared; unknown
 * fields pass through so newer API versions do not break parsing.
 */

export const ProjectSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
});

export const EnvironmentSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  api_key: z.string(),
  project: z.number().optional(),
  use_v2_feature_versioning: z.boolean().optional().default(false),
});

export const FeatureSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  type: z.string().nullable().optional(),
});

const RawFeatureStateValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.looseObject({
    type: z.string().nullable().optional(),
    string_value: z.string().nullable().optional(),
    integer_value: z.number().nullable().optional(),
    boolean_value: z.boolean().nullable().optional(),
  }),
]);

export const FeatureStateSchema = z.looseObject({
  id: z.number(),
  feature: z.number(),
  environment: z.number().nullable().optional(),
  identity: z.unknown().optional(),
  feature_segment: z.number().nullable().optional(),
  enabled: z.boolean(),
  feature_state_value: RawFeatureStateValue.optional(),
  updated_at: z.string().nullable().optional(),
});

export const FeatureSegmentSchema = z.looseObject({
  id: z.number(),
  segment: z.number(),
  priority: z.number().nullable().optional(),
  environment: z.number().optional(),
  segment_name: z.string().optional(),
});

export interface RawCondition {
  operator: string;
  property?: string | null;
  value?: string | number | boolean | null;
  description?: string | null;
}
export interface RawRule {
  type: string;
  rules?: RawRule[];
  conditions?: RawCondition[];
}

const ConditionSchema = z.looseObject({
  operator: z.string(),
  property: z.string().nullable().optional(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  description: z.string().nullable().optional(),
});

export const RuleSchema: z.ZodType<RawRule> = z.lazy(() =>
  z.looseObject({
    type: z.string(),
    rules: z.array(RuleSchema).optional().default([]),
    conditions: z.array(ConditionSchema).optional().default([]),
  }),
) as unknown as z.ZodType<RawRule>;

export const SegmentSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  rules: z.array(RuleSchema).default([]),
});

const AuthorSchema = z
  .looseObject({
    email: z.string().nullable().optional(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

export const AuditLogSchema = z.looseObject({
  id: z.number(),
  created_date: z.string(),
  log: z.string(),
  author: AuthorSchema,
  environment: z.looseObject({ id: z.number(), name: z.string().optional() }).nullable().optional(),
  related_object_id: z.number().nullable().optional(),
  related_object_uuid: z.string().nullable().optional(),
  related_object_type: z.string().nullable().optional(),
  is_system_event: z.boolean().optional(),
});

export const AuditLogDetailSchema = AuditLogSchema.extend({
  change_details: z
    .array(z.looseObject({ field: z.string(), old: z.unknown().optional(), new: z.unknown().optional() }))
    .optional()
    .default([]),
  change_type: z.string().nullable().optional(),
});

export type FsProject = z.infer<typeof ProjectSchema>;
export type FsEnvironment = z.infer<typeof EnvironmentSchema>;
export type FsFeature = z.infer<typeof FeatureSchema>;
export type FsFeatureState = z.infer<typeof FeatureStateSchema>;
export type FsFeatureSegment = z.infer<typeof FeatureSegmentSchema>;
export type FsSegment = z.infer<typeof SegmentSchema>;
export type FsAuditLog = z.infer<typeof AuditLogSchema>;
export type FsAuditLogDetail = z.infer<typeof AuditLogDetailSchema>;
