import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { createLogger } from "@/lib/utils/logger";
import {
  createBillingManualPriceOverride,
  listBillingManualPriceOverrides,
} from "@/lib/services/billing-price-service";
import { transformBillingManualOverrideToApi } from "@/lib/utils/api-transformers";

const log = createLogger("admin-billing-overrides");

const createOverrideSchema = z.object({
  model: z.string().min(1).max(255),
  input_price_per_million: z.number().min(0).max(1000000),
  output_price_per_million: z.number().min(0).max(1000000),
  cache_read_input_price_per_million: z.number().min(0).max(1000000).nullable().optional(),
  cache_write_input_price_per_million: z.number().min(0).max(1000000).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

/**
 * GET /api/admin/billing/overrides - List manual price overrides.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const rows = await listBillingManualPriceOverrides();
    return NextResponse.json({
      items: rows.map(transformBillingManualOverrideToApi),
      total: rows.length,
    });
  } catch (error) {
    log.error({ err: error }, "failed to list billing overrides");
    return errorResponse("Internal server error", 500);
  }
}

/**
 * POST /api/admin/billing/overrides - Create or upsert manual override.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const body = await request.json();
    const validated = createOverrideSchema.parse(body);
    const row = await createBillingManualPriceOverride({
      model: validated.model,
      inputPricePerMillion: validated.input_price_per_million,
      outputPricePerMillion: validated.output_price_per_million,
      cacheReadInputPricePerMillion: validated.cache_read_input_price_per_million ?? null,
      cacheWriteInputPricePerMillion: validated.cache_write_input_price_per_million ?? null,
      note: validated.note ?? null,
    });
    return NextResponse.json(transformBillingManualOverrideToApi(row), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    log.error({ err: error }, "failed to create billing override");
    return errorResponse("Internal server error", 500);
  }
}
