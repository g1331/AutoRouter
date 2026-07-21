import type { z } from "zod";

import type { APIKeyResponse } from "@/types/api";

import { KEY_ROLLING_DEFAULT_PERIOD_HOURS, apiKeySectionSchemas } from "./section-schemas";

/**
 * Form-value builders shared by the API-key detail-page section forms. These
 * convert a persisted {@link APIKeyResponse} into the per-section
 * react-hook-form default values so every section initializes from the same
 * source.
 */

type SectionInput<K extends keyof typeof apiKeySectionSchemas> = z.input<
  (typeof apiKeySectionSchemas)[K]
>;

export function basicDefaults(apiKey: APIKeyResponse): SectionInput<"basic"> {
  return {
    name: apiKey.name ?? "",
    description: apiKey.description ?? "",
    is_active: apiKey.is_active,
  };
}

export function accessGrantsDefaults(apiKey: APIKeyResponse): SectionInput<"access-grants"> {
  return {
    access_mode: apiKey.access_mode,
    upstream_ids: apiKey.upstream_ids ?? [],
  };
}

export function spendingRulesDefaults(apiKey: APIKeyResponse): SectionInput<"spending-rules"> {
  return {
    spending_rules: (apiKey.spending_rules ?? []).map((rule) => ({
      period_type: rule.period_type,
      limit: rule.limit,
      period_hours:
        rule.period_type === "rolling"
          ? (rule.period_hours ?? KEY_ROLLING_DEFAULT_PERIOD_HOURS)
          : null,
    })),
  };
}

export function rateLimitsDefaults(apiKey: APIKeyResponse): SectionInput<"rate-limits"> {
  return {
    rpm_limit: apiKey.rpm_limit ?? null,
    tpm_limit: apiKey.tpm_limit ?? null,
  };
}

export function modelAllowlistDefaults(apiKey: APIKeyResponse): SectionInput<"model-allowlist"> {
  return { allowed_models: apiKey.allowed_models ?? [] };
}

export function expiryDefaults(apiKey: APIKeyResponse): SectionInput<"expiry"> {
  return { expires_at: apiKey.expires_at ? new Date(apiKey.expires_at) : null };
}
