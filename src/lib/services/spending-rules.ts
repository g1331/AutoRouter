import { z } from "zod";
import type { SpendingRule } from "@/lib/services/upstream-quota-tracker";

export const MAX_SPENDING_RULE_PERIOD_HOURS = 8760;

export const spendingRuleSchema = z.object({
  period_type: z.enum(["daily", "monthly", "rolling"]),
  limit: z.number().positive(),
  period_hours: z.number().int().min(1).max(MAX_SPENDING_RULE_PERIOD_HOURS).optional(),
});

export const nullableSpendingRulesSchema = z
  .array(spendingRuleSchema)
  .nullable()
  .optional()
  .superRefine((rules, ctx) => {
    if (!rules) {
      return;
    }

    for (const [index, rule] of rules.entries()) {
      if (rule.period_type === "rolling" && rule.period_hours == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "period_hours"],
          message: "period_hours is required when period_type is 'rolling'",
        });
      }
    }
  });

/**
 * Normalize persisted or submitted spending rules into the canonical runtime shape.
 */
export function normalizeSpendingRules(
  rules: SpendingRule[] | null | undefined
): SpendingRule[] | null {
  if (!rules || rules.length === 0) {
    return null;
  }

  return rules.map((rule) => {
    if (rule.period_type === "rolling") {
      return {
        period_type: "rolling",
        limit: Number(rule.limit),
        period_hours: rule.period_hours ?? 24,
      };
    }

    return {
      period_type: rule.period_type,
      limit: Number(rule.limit),
    };
  });
}

/**
 * Parse unknown input with shared validation and return normalized spending rules.
 */
export function parseSpendingRules(input: unknown): SpendingRule[] | null {
  const parsed = nullableSpendingRulesSchema.parse(input);
  return normalizeSpendingRules(parsed ?? null);
}
