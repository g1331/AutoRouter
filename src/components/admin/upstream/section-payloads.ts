import type { z } from "zod";

import type {
  UpstreamModelDiscoveryConfig,
  UpstreamModelRule,
  UpstreamQueuePolicy,
  UpstreamUpdate,
} from "@/types/api";

import { resolveEndpointPreview } from "./endpoint-preview";
import {
  ROLLING_DEFAULT_PERIOD_HOURS,
  type UpstreamFormData,
  upstreamSectionSchemas,
} from "./section-schemas";

/**
 * Per-section partial-PUT payload builders for the upstream detail page (Phase
 * B2). Each builder is a pure function taking the section's validated (zod
 * output) values and returning a partial {@link UpstreamUpdate} that contains
 * ONLY that section's fields — the request never leaks fields owned by other
 * sections.
 */

type SectionOutput<K extends keyof typeof upstreamSectionSchemas> = z.output<
  (typeof upstreamSectionSchemas)[K]
>;

// ── Shared field mappers (verbatim from the dialog's submit assembly) ──────────

export function normalizeQueuePolicyForSubmit(
  queuePolicy: UpstreamFormData["queue_policy"]
): UpstreamQueuePolicy | null {
  if (!queuePolicy.enabled) {
    return null;
  }

  return {
    enabled: true,
    timeout_ms: queuePolicy.timeout_ms,
    max_queue_length: queuePolicy.max_queue_length ?? null,
  };
}

export function toApiModelDiscoveryValue(
  modelDiscovery: UpstreamFormData["model_discovery"]
): UpstreamModelDiscoveryConfig {
  return {
    mode: modelDiscovery.mode,
    custom_endpoint: modelDiscovery.custom_endpoint.trim() || null,
    enable_lite_llm_fallback: modelDiscovery.enable_lite_llm_fallback,
    auto_refresh_enabled: modelDiscovery.auto_refresh_enabled,
  };
}

export function toApiModelRulesValue(
  modelRules: UpstreamFormData["model_rules"]
): UpstreamModelRule[] | null {
  const normalizedRules = modelRules
    .map((rule) => ({
      type: rule.type,
      value: rule.value.trim(),
      target_model: rule.type === "alias" ? rule.target_model?.trim() || null : null,
      source: rule.source,
      display_label: rule.display_label?.trim() || null,
    }))
    .filter((rule) => rule.value.length > 0);

  return normalizedRules.length > 0 ? normalizedRules : null;
}

export function spendingRulesToApi(
  rules: UpstreamFormData["spending_rules"]
): { period_type: "daily" | "monthly" | "rolling"; limit: number; period_hours?: number }[] | null {
  if (!rules || rules.length === 0) return null;
  return rules.map((rule) => ({
    period_type: rule.period_type,
    limit: rule.limit,
    ...(rule.period_type === "rolling"
      ? { period_hours: rule.period_hours ?? ROLLING_DEFAULT_PERIOD_HOURS }
      : {}),
  }));
}

// ── Per-section payload builders ──────────────────────────────────────────────

export function buildBasicNamePayload(values: SectionOutput<"basic-name">): UpstreamUpdate {
  return { name: values.name };
}

export function buildBasicProfilePayload(values: SectionOutput<"basic-profile">): UpstreamUpdate {
  const trimmed = values.official_website_url.trim();
  return { official_website_url: trimmed ? trimmed : null };
}

export function buildRouteEndpointPayload(
  values: SectionOutput<"basic-route-endpoint">
): UpstreamUpdate {
  const preview = resolveEndpointPreview(values.base_url, values.route_capabilities);
  return {
    base_url: preview?.normalizedBaseUrl ?? values.base_url.trim(),
    route_capabilities: values.route_capabilities,
  };
}

/**
 * Write-only API key. An empty (or whitespace-only) field means "keep the
 * current key" and omits `api_key` from the payload entirely.
 */
export function buildApiKeyPayload(values: SectionOutput<"basic-api-key">): UpstreamUpdate {
  const key = values.api_key.trim();
  return key.length > 0 ? { api_key: key } : {};
}

export function buildPriorityWeightPayload(
  values: SectionOutput<"priority-weight">
): UpstreamUpdate {
  return { priority: values.priority, weight: values.weight };
}

export function buildModelRoutingPayload(values: SectionOutput<"model-routing">): UpstreamUpdate {
  return {
    model_discovery: toApiModelDiscoveryValue(values.model_discovery),
    model_rules: toApiModelRulesValue(values.model_rules),
  };
}

export function buildBillingMultipliersPayload(
  values: SectionOutput<"billing-multipliers">
): UpstreamUpdate {
  return {
    billing_input_multiplier: values.billing_input_multiplier,
    billing_output_multiplier: values.billing_output_multiplier,
  };
}

export function buildSpendingQuotaPayload(values: SectionOutput<"spending-quota">): UpstreamUpdate {
  return { spending_rules: spendingRulesToApi(values.spending_rules) };
}

export function buildCapacityControlPayload(
  values: SectionOutput<"capacity-control">
): UpstreamUpdate {
  return {
    max_concurrency: values.max_concurrency ?? null,
    queue_policy: normalizeQueuePolicyForSubmit(values.queue_policy),
  };
}

export function buildCircuitBreakerPayload(
  values: SectionOutput<"circuit-breaker">
): UpstreamUpdate {
  return { circuit_breaker_config: values.circuit_breaker_config };
}

export function buildFailureRulesPayload(values: SectionOutput<"failure-rules">): UpstreamUpdate {
  return { failure_rule_config: values.failure_rule_config };
}

export function buildAffinityMigrationPayload(
  values: SectionOutput<"affinity-migration">
): UpstreamUpdate {
  return { affinity_migration: values.affinity_migration };
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

type SectionPayloadBuilders = {
  [K in keyof typeof upstreamSectionSchemas]: (values: SectionOutput<K>) => UpstreamUpdate;
};

export const upstreamSectionPayloadBuilders: SectionPayloadBuilders = {
  "basic-name": buildBasicNamePayload,
  "basic-profile": buildBasicProfilePayload,
  "basic-route-endpoint": buildRouteEndpointPayload,
  "basic-api-key": buildApiKeyPayload,
  "priority-weight": buildPriorityWeightPayload,
  "model-routing": buildModelRoutingPayload,
  "billing-multipliers": buildBillingMultipliersPayload,
  "spending-quota": buildSpendingQuotaPayload,
  "capacity-control": buildCapacityControlPayload,
  "circuit-breaker": buildCircuitBreakerPayload,
  "failure-rules": buildFailureRulesPayload,
  "affinity-migration": buildAffinityMigrationPayload,
};

/**
 * Build the partial PUT payload for a single detail-page section. The result
 * carries only the fields owned by `sectionId`.
 */
export function buildUpstreamSectionPayload<K extends keyof typeof upstreamSectionSchemas>(
  sectionId: K,
  values: SectionOutput<K>
): UpstreamUpdate {
  const builder = upstreamSectionPayloadBuilders[sectionId] as (
    values: SectionOutput<K>
  ) => UpstreamUpdate;
  return builder(values);
}
