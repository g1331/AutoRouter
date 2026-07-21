import type { z } from "zod";

import type { APIKeySpendingRule, APIKeyUpdate } from "@/types/api";

import { KEY_ROLLING_DEFAULT_PERIOD_HOURS, apiKeySectionSchemas } from "./section-schemas";

/**
 * Per-section partial-PUT payload builders for the API-key detail page. Each
 * builder is a pure function taking the section's validated (zod output) values
 * and returning a partial {@link APIKeyUpdate} that contains ONLY that section's
 * fields — the request never leaks fields owned by other sections.
 */

type SectionOutput<K extends keyof typeof apiKeySectionSchemas> = z.output<
  (typeof apiKeySectionSchemas)[K]
>;

// ── Shared field mappers ────────────────────────────────────────────────────

export function keySpendingRulesToApi(
  rules: SectionOutput<"spending-rules">["spending_rules"]
): APIKeySpendingRule[] | null {
  if (!rules || rules.length === 0) return null;
  return rules.map((rule) => ({
    period_type: rule.period_type,
    limit: rule.limit,
    ...(rule.period_type === "rolling"
      ? { period_hours: rule.period_hours ?? KEY_ROLLING_DEFAULT_PERIOD_HOURS }
      : {}),
  }));
}

// ── Per-section payload builders ────────────────────────────────────────────

export function buildBasicPayload(values: SectionOutput<"basic">): APIKeyUpdate {
  const description = values.description.trim();
  return {
    name: values.name,
    description: description ? description : null,
    is_active: values.is_active,
  };
}

export function buildAccessGrantsPayload(values: SectionOutput<"access-grants">): APIKeyUpdate {
  return {
    access_mode: values.access_mode,
    // `unrestricted` clears any upstream grants; only `restricted` persists them.
    upstream_ids: values.access_mode === "restricted" ? values.upstream_ids : [],
  };
}

/**
 * Spending rules are visible, section-owned data — not a write-only secret — so
 * an empty rule set is an explicit clear, not an omission: it persists
 * `spending_rules: []` (removes all rules). This section is the only UI path for
 * spending rules once the legacy edit dialog is retired, so it must be able to
 * clear them; per-section dirty gating already establishes intent.
 */
export function buildSpendingRulesPayload(values: SectionOutput<"spending-rules">): APIKeyUpdate {
  return { spending_rules: keySpendingRulesToApi(values.spending_rules) ?? [] };
}

export function buildRateLimitsPayload(values: SectionOutput<"rate-limits">): APIKeyUpdate {
  return {
    rpm_limit: values.rpm_limit,
    tpm_limit: values.tpm_limit,
  };
}

export function buildModelAllowlistPayload(values: SectionOutput<"model-allowlist">): APIKeyUpdate {
  return { allowed_models: values.allowed_models.length > 0 ? values.allowed_models : null };
}

export function buildExpiryPayload(values: SectionOutput<"expiry">): APIKeyUpdate {
  return { expires_at: values.expires_at ? values.expires_at.toISOString() : null };
}

// ── Dispatcher ──────────────────────────────────────────────────────────────

type SectionPayloadBuilders = {
  [K in keyof typeof apiKeySectionSchemas]: (values: SectionOutput<K>) => APIKeyUpdate;
};

export const apiKeySectionPayloadBuilders: SectionPayloadBuilders = {
  basic: buildBasicPayload,
  "access-grants": buildAccessGrantsPayload,
  "spending-rules": buildSpendingRulesPayload,
  "rate-limits": buildRateLimitsPayload,
  "model-allowlist": buildModelAllowlistPayload,
  expiry: buildExpiryPayload,
};

/**
 * Build the partial PUT payload for a single detail-page section. The result
 * carries only the fields owned by `sectionId`.
 */
export function buildApiKeySectionPayload<K extends keyof typeof apiKeySectionSchemas>(
  sectionId: K,
  values: SectionOutput<K>
): APIKeyUpdate {
  const builder = apiKeySectionPayloadBuilders[sectionId] as (
    values: SectionOutput<K>
  ) => APIKeyUpdate;
  return builder(values);
}
