import type { z } from "zod";

import { inferDefaultModelDiscoveryConfig } from "@/lib/services/upstream-model-types";
import type { RouteCapability, Upstream, UpstreamModelRuleType } from "@/types/api";

import {
  DEFAULT_QUEUE_POLICY_TIMEOUT_MS,
  ROLLING_DEFAULT_PERIOD_HOURS,
  type UpstreamFormValues,
  upstreamSectionSchemas,
} from "./section-schemas";

/**
 * Form-value builders shared by the upstream detail-page section forms. These
 * convert a persisted {@link Upstream} into the per-section react-hook-form
 * default values so the create dialog and the section forms initialize
 * identically.
 */

type SectionInput<K extends keyof typeof upstreamSectionSchemas> = z.input<
  (typeof upstreamSectionSchemas)[K]
>;

// ── Shared sub-value converters (verbatim from the dialog) ─────────────────────

export function buildQueuePolicyFormValue(
  queuePolicy: Upstream["queue_policy"] | null | undefined
): UpstreamFormValues["queue_policy"] {
  return {
    enabled: queuePolicy?.enabled ?? false,
    timeout_ms: queuePolicy?.timeout_ms ?? DEFAULT_QUEUE_POLICY_TIMEOUT_MS,
    max_queue_length: queuePolicy?.max_queue_length ?? null,
  };
}

export function toFormModelDiscoveryValue(
  modelDiscovery: Upstream["model_discovery"] | null | undefined,
  routeCapabilities: RouteCapability[] | null | undefined
): UpstreamFormValues["model_discovery"] {
  const inferred = inferDefaultModelDiscoveryConfig(routeCapabilities);

  return {
    mode: modelDiscovery?.mode ?? inferred?.mode ?? "openai_compatible",
    custom_endpoint: modelDiscovery?.custom_endpoint ?? inferred?.customEndpoint ?? "",
    enable_lite_llm_fallback:
      modelDiscovery?.enable_lite_llm_fallback ?? inferred?.enableLiteLlmFallback ?? false,
    auto_refresh_enabled:
      modelDiscovery?.auto_refresh_enabled ?? inferred?.autoRefreshEnabled ?? false,
  };
}

export function toFormModelRulesValue(
  modelRules: Upstream["model_rules"] | null | undefined
): UpstreamFormValues["model_rules"] {
  return (modelRules ?? []).map((rule) => ({
    type: rule.type,
    value: rule.value,
    target_model: rule.target_model ?? null,
    source: rule.source,
    display_label: rule.display_label ?? null,
  }));
}

export function createEmptyModelRule(
  type: UpstreamModelRuleType = "exact"
): UpstreamFormValues["model_rules"][number] {
  return {
    type,
    value: "",
    target_model: type === "alias" ? "" : null,
    source: "manual",
    display_label: null,
  };
}

// ── Per-section default-value builders ─────────────────────────────────────────

export function basicNameDefaults(upstream: Upstream): SectionInput<"basic-name"> {
  return { name: upstream.name ?? "" };
}

export function basicProfileDefaults(upstream: Upstream): SectionInput<"basic-profile"> {
  return { official_website_url: upstream.official_website_url ?? "" };
}

export function routeEndpointDefaults(upstream: Upstream): SectionInput<"basic-route-endpoint"> {
  return {
    base_url: upstream.base_url ?? "",
    route_capabilities: upstream.route_capabilities ?? [],
  };
}

export function apiKeyDefaults(): SectionInput<"basic-api-key"> {
  return { api_key: "" };
}

export function priorityWeightDefaults(upstream: Upstream): SectionInput<"priority-weight"> {
  return {
    priority: upstream.priority ?? 0,
    weight: upstream.weight ?? 1,
  };
}

export function modelRoutingDefaults(upstream: Upstream): SectionInput<"model-routing"> {
  return {
    model_discovery: toFormModelDiscoveryValue(
      upstream.model_discovery ?? null,
      upstream.route_capabilities ?? []
    ),
    model_rules: toFormModelRulesValue(upstream.model_rules),
  };
}

export function billingMultipliersDefaults(
  upstream: Upstream
): SectionInput<"billing-multipliers"> {
  return {
    billing_input_multiplier: upstream.billing_input_multiplier ?? 1,
    billing_output_multiplier: upstream.billing_output_multiplier ?? 1,
  };
}

export function spendingQuotaDefaults(upstream: Upstream): SectionInput<"spending-quota"> {
  return {
    spending_rules: (upstream.spending_rules ?? []).map((rule) => ({
      period_type: rule.period_type as "daily" | "monthly" | "rolling",
      limit: rule.limit,
      period_hours:
        rule.period_type === "rolling" ? (rule.period_hours ?? ROLLING_DEFAULT_PERIOD_HOURS) : null,
    })),
  };
}

export function capacityControlDefaults(upstream: Upstream): SectionInput<"capacity-control"> {
  return {
    max_concurrency: upstream.max_concurrency ?? null,
    queue_policy: buildQueuePolicyFormValue(upstream.queue_policy ?? null),
  };
}

export function circuitBreakerDefaults(upstream: Upstream): SectionInput<"circuit-breaker"> {
  return {
    circuit_breaker_config: upstream.circuit_breaker?.config
      ? {
          failure_threshold: upstream.circuit_breaker.config.failure_threshold,
          success_threshold: upstream.circuit_breaker.config.success_threshold,
          open_duration: upstream.circuit_breaker.config.open_duration,
          probe_interval: upstream.circuit_breaker.config.probe_interval,
          first_byte_timeout: upstream.circuit_breaker.config.first_byte_timeout,
          stream_idle_timeout: upstream.circuit_breaker.config.stream_idle_timeout,
        }
      : null,
  };
}

export function failureRulesDefaults(upstream: Upstream): SectionInput<"failure-rules"> {
  return {
    failure_rule_config: upstream.failure_rule_config ?? { use_global_rules: true },
  };
}

export function affinityMigrationDefaults(upstream: Upstream): SectionInput<"affinity-migration"> {
  return { affinity_migration: upstream.affinity_migration ?? null };
}
