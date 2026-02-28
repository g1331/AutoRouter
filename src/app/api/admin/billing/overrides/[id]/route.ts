import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { createLogger } from "@/lib/utils/logger";
import {
  deleteBillingManualPriceOverride,
  updateBillingManualPriceOverride,
} from "@/lib/services/billing-price-service";
import { transformBillingManualOverrideToApi } from "@/lib/utils/api-transformers";

const log = createLogger("admin-billing-override");

type RouteContext = { params: Promise<{ id: string }> };

const updateOverrideSchema = z.object({
  input_price_per_million: z.number().min(0).max(1000000).optional(),
  output_price_per_million: z.number().min(0).max(1000000).optional(),
  note: z.string().max(1000).nullable().optional(),
});

/**
 * PUT /api/admin/billing/overrides/[id] - Update manual override.
 */
export async function PUT(request: NextRequest, context: RouteContext): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const validated = updateOverrideSchema.parse(body);

    const row = await updateBillingManualPriceOverride(id, {
      inputPricePerMillion: validated.input_price_per_million,
      outputPricePerMillion: validated.output_price_per_million,
      note: validated.note,
    });
    if (!row) {
      return errorResponse("Override not found", 404);
    }
    return NextResponse.json(transformBillingManualOverrideToApi(row));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    log.error({ err: error }, "failed to update billing override");
    return errorResponse("Internal server error", 500);
  }
}

/**
 * DELETE /api/admin/billing/overrides/[id] - Delete manual override.
 */
export async function DELETE(request: NextRequest, context: RouteContext): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    const deleted = await deleteBillingManualPriceOverride(id);
    if (!deleted) {
      return errorResponse("Override not found", 404);
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    log.error({ err: error }, "failed to delete billing override");
    return errorResponse("Internal server error", 500);
  }
}
