import { z } from "zod";

/**
 * Single source of truth for the API-key form validation. The edit dialog used
 * to inline one big schema; the detail-page section forms compose their
 * per-section schemas from the same field slices exported below so a section
 * form and the full form validate identically — no forked validation logic.
 */

export const KEY_ROLLING_DEFAULT_PERIOD_HOURS = 24;

// A single spending rule. `period_hours` is only meaningful for the "rolling"
// period; it is held as `null` for daily/monthly and validated on the section.
export const keySpendingRuleSchema = z.object({
  period_type: z.enum(["daily", "monthly", "rolling"]),
  limit: z.coerce.number().positive(),
  period_hours: z.number().int().min(1).max(8760).nullable(),
});

export function hasValidRollingPeriodHours(
  rules: z.input<typeof keySpendingRuleSchema>[]
): boolean {
  return rules.every(
    (rule) =>
      rule.period_type !== "rolling" || (rule.period_hours != null && rule.period_hours >= 1)
  );
}

/**
 * Per-field building blocks. The per-section detail-page schemas compose from
 * this map so validation stays identical across sections.
 */
export const apiKeyFieldSchemas = {
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  is_active: z.boolean(),
  access_mode: z.enum(["unrestricted", "restricted"]),
  upstream_ids: z.array(z.string()),
  allowed_models: z.array(z.string()),
  expires_at: z.date().nullable(),
  spending_rules: z.array(keySpendingRuleSchema),
} as const;

/**
 * Per-section schema slices for the detail-page section forms. Cross-field
 * refinements are attached to the section that owns those fields — access mode
 * and upstream grants cross-validate, so they live in a single section.
 */
export const apiKeySectionSchemas = {
  basic: z.object({
    name: apiKeyFieldSchemas.name,
    description: apiKeyFieldSchemas.description,
    is_active: apiKeyFieldSchemas.is_active,
  }),
  "access-grants": z
    .object({
      access_mode: apiKeyFieldSchemas.access_mode,
      upstream_ids: apiKeyFieldSchemas.upstream_ids,
    })
    .superRefine((data, ctx) => {
      if (data.access_mode === "restricted" && data.upstream_ids.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["upstream_ids"],
          message: "At least one upstream is required when access is restricted",
        });
      }
    }),
  "spending-rules": z
    .object({ spending_rules: apiKeyFieldSchemas.spending_rules })
    .refine((data) => hasValidRollingPeriodHours(data.spending_rules), {
      message: "period_hours is required when period_type is rolling",
      path: ["spending_rules"],
    }),
  "model-allowlist": z.object({ allowed_models: apiKeyFieldSchemas.allowed_models }),
  expiry: z.object({ expires_at: apiKeyFieldSchemas.expires_at }),
} as const;
