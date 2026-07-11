import { z } from "zod";

import { ROUTE_CAPABILITY_VALUES, areSingleProviderCapabilities } from "@/lib/route-capabilities";
import type {
  UpstreamModelDiscoveryMode,
  UpstreamModelRuleSource,
  UpstreamModelRuleType,
} from "@/types/api";

import { coerceNumericInput } from "./coerce";

/**
 * Single source of truth for the upstream form validation. The dialog composes
 * the full create/edit schemas from these building blocks; the detail-page
 * section forms (Phase B2) compose their per-section schemas from the same field
 * slices exported below — no forked validation logic.
 */

export const ROLLING_DEFAULT_PERIOD_HOURS = 24;
export const DEFAULT_QUEUE_POLICY_TIMEOUT_MS = 30000;

export const MODEL_DISCOVERY_MODE_VALUES = [
  "openai_compatible",
  "anthropic_native",
  "gemini_native",
  "gemini_openai_compatible",
  "custom",
  "litellm",
] as const satisfies readonly UpstreamModelDiscoveryMode[];

export const MODEL_RULE_TYPE_VALUES = [
  "exact",
  "regex",
  "alias",
] as const satisfies readonly UpstreamModelRuleType[];

export const MODEL_RULE_SOURCE_VALUES = [
  "manual",
  "native",
  "inferred",
  "litellm",
] as const satisfies readonly UpstreamModelRuleSource[];

export const MODEL_RULE_ALIAS_TARGET_REQUIRED_MESSAGE = "modelRuleAliasTargetRequired";

// Circuit breaker config schema
export const circuitBreakerConfigSchema = z
  .object({
    failure_threshold: z.number().int().min(1).max(100).optional(),
    success_threshold: z.number().int().min(1).max(100).optional(),
    open_duration: z.number().int().min(1).max(300).optional(),
    probe_interval: z.number().int().min(1).max(60).optional(),
    first_byte_timeout: z.number().int().min(1).max(300).optional(),
    stream_idle_timeout: z.number().int().min(1).max(300).optional(),
  })
  .nullable();

export const failureRuleConfigSchema = z.object({
  use_global_rules: z.boolean(),
});

// Affinity migration config schema
export const affinityMigrationConfigSchema = z
  .object({
    enabled: z.boolean(),
    metric: z.enum(["tokens", "length"]),
    threshold: z.preprocess(
      (value) => coerceNumericInput(value, undefined),
      z.number().int().min(1).max(10000000)
    ),
  })
  .nullable();

export const spendingRuleSchema = z.object({
  period_type: z.enum(["daily", "monthly", "rolling"]),
  limit: z.coerce.number().positive(),
  period_hours: z.number().int().min(1).max(8760).nullable(),
});

export const queuePolicyFormSchema = z.object({
  enabled: z.boolean(),
  timeout_ms: z.preprocess(
    (value) => coerceNumericInput(value, undefined),
    z.number().int().positive()
  ),
  max_queue_length: z.preprocess(
    (value) => coerceNumericInput(value, null),
    z.number().int().positive().nullable()
  ),
});

export const modelDiscoverySchema = z.object({
  mode: z.enum(MODEL_DISCOVERY_MODE_VALUES),
  custom_endpoint: z.string(),
  enable_lite_llm_fallback: z.boolean(),
  auto_refresh_enabled: z.boolean(),
});

export const modelRuleSchema = z
  .object({
    type: z.enum(MODEL_RULE_TYPE_VALUES),
    value: z.string().trim().min(1),
    target_model: z.string().trim().nullable().optional(),
    source: z.enum(MODEL_RULE_SOURCE_VALUES),
    display_label: z.string().trim().nullable().optional(),
  })
  .refine((rule) => rule.type !== "alias" || Boolean(rule.target_model?.trim()), {
    message: MODEL_RULE_ALIAS_TARGET_REQUIRED_MESSAGE,
    path: ["target_model"],
  });

export function hasValidRollingPeriodHours(rules: z.input<typeof spendingRuleSchema>[]): boolean {
  return rules.every(
    (rule) =>
      rule.period_type !== "rolling" || (rule.period_hours != null && rule.period_hours >= 1)
  );
}

/**
 * Per-field building blocks. The full create/edit schemas and the per-section
 * detail-page schemas both compose from this map so validation stays identical.
 */
export const upstreamFieldSchemas = {
  name: z.string().min(1).max(100),
  base_url: z.string().url(),
  official_website_url: z.union([z.literal(""), z.string().url()]),
  description: z.string().max(500),
  max_concurrency: z.number().int().positive().nullable(),
  priority: z.preprocess(
    (value) => coerceNumericInput(value, undefined),
    z.number().int().min(0).max(100)
  ),
  weight: z.preprocess(
    (value) => coerceNumericInput(value, undefined),
    z.number().int().min(1).max(100)
  ),
  billing_input_multiplier: z.preprocess(
    (value) => coerceNumericInput(value, undefined),
    z.number().min(0).max(100)
  ),
  billing_output_multiplier: z.preprocess(
    (value) => coerceNumericInput(value, undefined),
    z.number().min(0).max(100)
  ),
  queue_policy: queuePolicyFormSchema,
  spending_rules: z.array(spendingRuleSchema),
  route_capabilities: z.array(z.enum(ROUTE_CAPABILITY_VALUES)),
  model_discovery: modelDiscoverySchema,
  model_rules: z.array(modelRuleSchema),
  circuit_breaker_config: circuitBreakerConfigSchema,
  failure_rule_config: failureRuleConfigSchema,
  affinity_migration: affinityMigrationConfigSchema,
} as const;

// Fields shared by both create and edit forms (api_key differs by mode).
const sharedFormShape = {
  name: upstreamFieldSchemas.name,
  base_url: upstreamFieldSchemas.base_url,
  official_website_url: upstreamFieldSchemas.official_website_url,
  description: upstreamFieldSchemas.description,
  max_concurrency: upstreamFieldSchemas.max_concurrency,
  priority: upstreamFieldSchemas.priority,
  weight: upstreamFieldSchemas.weight,
  billing_input_multiplier: upstreamFieldSchemas.billing_input_multiplier,
  billing_output_multiplier: upstreamFieldSchemas.billing_output_multiplier,
  queue_policy: upstreamFieldSchemas.queue_policy,
  spending_rules: upstreamFieldSchemas.spending_rules,
  route_capabilities: upstreamFieldSchemas.route_capabilities,
  model_discovery: upstreamFieldSchemas.model_discovery,
  model_rules: upstreamFieldSchemas.model_rules,
  circuit_breaker_config: upstreamFieldSchemas.circuit_breaker_config,
  failure_rule_config: upstreamFieldSchemas.failure_rule_config,
  affinity_migration: upstreamFieldSchemas.affinity_migration,
};

// Schema for create mode - api_key is required
export const createUpstreamFormSchema = z
  .object({ ...sharedFormShape, api_key: z.string().min(1) })
  .refine((data) => hasValidRollingPeriodHours(data.spending_rules), {
    message: "period_hours is required when period_type is 'rolling'",
    path: ["spending_rules"],
  })
  .refine((data) => areSingleProviderCapabilities(data.route_capabilities), {
    message: "All route capabilities must belong to the same provider",
    path: ["route_capabilities"],
  });

// Schema for edit mode - api_key is optional (leave empty to keep unchanged)
export const editUpstreamFormSchema = z
  .object({ ...sharedFormShape, api_key: z.string() })
  .refine((data) => hasValidRollingPeriodHours(data.spending_rules), {
    message: "period_hours is required when period_type is 'rolling'",
    path: ["spending_rules"],
  })
  .refine((data) => areSingleProviderCapabilities(data.route_capabilities), {
    message: "All route capabilities must belong to the same provider",
    path: ["route_capabilities"],
  });

export type UpstreamFormValues = z.input<typeof editUpstreamFormSchema>;
export type UpstreamFormData = z.output<typeof editUpstreamFormSchema>;

/**
 * Per-section schema slices for the detail-page section forms (Phase B2). Each
 * slice is built from the same {@link upstreamFieldSchemas} so a section form and
 * the full dialog validate identically. Cross-field refinements are attached to
 * the section that owns those fields.
 */
export const upstreamSectionSchemas = {
  "basic-name": z.object({ name: upstreamFieldSchemas.name }),
  "basic-profile": z.object({ official_website_url: upstreamFieldSchemas.official_website_url }),
  "basic-route-endpoint": z
    .object({
      base_url: upstreamFieldSchemas.base_url,
      route_capabilities: upstreamFieldSchemas.route_capabilities,
    })
    .refine((data) => areSingleProviderCapabilities(data.route_capabilities), {
      message: "All route capabilities must belong to the same provider",
      path: ["route_capabilities"],
    }),
  "basic-api-key": z.object({ api_key: z.string() }),
  "priority-weight": z.object({
    priority: upstreamFieldSchemas.priority,
    weight: upstreamFieldSchemas.weight,
  }),
  "model-routing": z.object({
    model_discovery: upstreamFieldSchemas.model_discovery,
    model_rules: upstreamFieldSchemas.model_rules,
  }),
  "billing-multipliers": z.object({
    billing_input_multiplier: upstreamFieldSchemas.billing_input_multiplier,
    billing_output_multiplier: upstreamFieldSchemas.billing_output_multiplier,
  }),
  "spending-quota": z
    .object({ spending_rules: upstreamFieldSchemas.spending_rules })
    .refine((data) => hasValidRollingPeriodHours(data.spending_rules), {
      message: "period_hours is required when period_type is 'rolling'",
      path: ["spending_rules"],
    }),
  "capacity-control": z.object({
    max_concurrency: upstreamFieldSchemas.max_concurrency,
    queue_policy: upstreamFieldSchemas.queue_policy,
  }),
  "circuit-breaker": z.object({
    circuit_breaker_config: upstreamFieldSchemas.circuit_breaker_config,
  }),
  "failure-rules": z.object({ failure_rule_config: upstreamFieldSchemas.failure_rule_config }),
  "affinity-migration": z.object({ affinity_migration: upstreamFieldSchemas.affinity_migration }),
} as const;
