import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { createLogger } from "@/lib/utils/logger";
import {
  BillingTierRuleConflictError,
  BillingTierRuleValidationError,
  createBillingTierRule,
  listBillingTierRules,
} from "@/lib/services/billing-price-service";
import { transformBillingTierRuleToApi } from "@/lib/utils/api-transformers";

const log = createLogger("admin-billing-tier-rules");

const createTierRuleSchema = z.object({
  model: z.string().trim().min(1).max(255),
  threshold_input_tokens: z.number().int().min(1),
  display_label: z.string().max(255).nullable().optional(),
  input_price_per_million: z.number().min(0).max(1000000),
  output_price_per_million: z.number().min(0).max(1000000),
  cache_read_input_price_per_million: z.number().min(0).max(1000000).nullable().optional(),
  cache_write_input_price_per_million: z.number().min(0).max(1000000).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

/**
 * GET /api/admin/billing/tier-rules - List billing tier rules.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { searchParams } = new URL(request.url);
    const model = searchParams.get("model") ?? undefined;
    const source = searchParams.get("source") as "litellm" | "manual" | undefined;
    const activeOnly = searchParams.get("active_only") === "true";

    const rows = await listBillingTierRules({ model, source, activeOnly });
    return NextResponse.json({
      items: rows.map(transformBillingTierRuleToApi),
      total: rows.length,
    });
  } catch (error) {
    log.error({ err: error }, "failed to list billing tier rules");
    return errorResponse("Internal server error", 500);
  }
}

/**
 * POST /api/admin/billing/tier-rules - Create a manual tier rule.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const body = await request.json();
    const validated = createTierRuleSchema.parse(body);
    const row = await createBillingTierRule({
      model: validated.model,
      thresholdInputTokens: validated.threshold_input_tokens,
      displayLabel: validated.display_label ?? null,
      inputPricePerMillion: validated.input_price_per_million,
      outputPricePerMillion: validated.output_price_per_million,
      cacheReadInputPricePerMillion: validated.cache_read_input_price_per_million ?? null,
      cacheWriteInputPricePerMillion: validated.cache_write_input_price_per_million ?? null,
      note: validated.note ?? null,
    });
    return NextResponse.json(transformBillingTierRuleToApi(row), { status: 201 });
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
    if (error instanceof BillingTierRuleValidationError) {
      return errorResponse(error.message, 400);
    }
    log.error({ err: error }, "failed to create billing tier rule");
    return errorResponse("Internal server error", 500);
  }
}
