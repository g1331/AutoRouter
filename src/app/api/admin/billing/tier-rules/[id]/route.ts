import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { createLogger } from "@/lib/utils/logger";
import {
  BillingTierRuleConflictError,
  deleteBillingTierRule,
  updateBillingTierRule,
} from "@/lib/services/billing-price-service";
import { transformBillingTierRuleToApi } from "@/lib/utils/api-transformers";

const log = createLogger("admin-billing-tier-rule");

type RouteContext = { params: Promise<{ id: string }> };

const updateTierRuleSchema = z
  .object({
    threshold_input_tokens: z.number().int().min(1).optional(),
    display_label: z.string().max(255).nullable().optional(),
    input_price_per_million: z.number().min(0).max(1000000).optional(),
    output_price_per_million: z.number().min(0).max(1000000).optional(),
    cache_read_input_price_per_million: z.number().min(0).max(1000000).nullable().optional(),
    cache_write_input_price_per_million: z.number().min(0).max(1000000).nullable().optional(),
    note: z.string().max(1000).nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.threshold_input_tokens !== undefined ||
      data.display_label !== undefined ||
      data.input_price_per_million !== undefined ||
      data.output_price_per_million !== undefined ||
      data.cache_read_input_price_per_million !== undefined ||
      data.cache_write_input_price_per_million !== undefined ||
      data.note !== undefined ||
      data.is_active !== undefined,
    {
      message: "At least one field must be provided",
    }
  );

/**
 * PUT /api/admin/billing/tier-rules/[id] - Update a tier rule.
 */
export async function PUT(request: NextRequest, context: RouteContext): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const validated = updateTierRuleSchema.parse(body);

    const row = await updateBillingTierRule(id, {
      thresholdInputTokens: validated.threshold_input_tokens,
      displayLabel: validated.display_label,
      inputPricePerMillion: validated.input_price_per_million,
      outputPricePerMillion: validated.output_price_per_million,
      cacheReadInputPricePerMillion: validated.cache_read_input_price_per_million,
      cacheWriteInputPricePerMillion: validated.cache_write_input_price_per_million,
      note: validated.note,
      isActive: validated.is_active,
    });
    if (!row) {
      return errorResponse("Tier rule not found", 404);
    }
    return NextResponse.json(transformBillingTierRuleToApi(row));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    if (error instanceof BillingTierRuleConflictError) {
      return errorResponse(error.message, 409);
    }
    log.error({ err: error }, "failed to update billing tier rule");
    return errorResponse("Internal server error", 500);
  }
}

/**
 * DELETE /api/admin/billing/tier-rules/[id] - Delete a manual tier rule.
 */
export async function DELETE(request: NextRequest, context: RouteContext): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    const deleted = await deleteBillingTierRule(id);
    if (!deleted) {
      return errorResponse("Tier rule not found or not a manual rule", 404);
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    log.error({ err: error }, "failed to delete billing tier rule");
    return errorResponse("Internal server error", 500);
  }
}
