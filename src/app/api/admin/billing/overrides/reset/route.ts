import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { createLogger } from "@/lib/utils/logger";
import { deleteBillingManualPriceOverridesByModels } from "@/lib/services/billing-price-service";

const log = createLogger("admin-billing-overrides-reset");

const resetSchema = z.object({
  models: z.array(z.string().min(1).max(255)).min(1).max(200),
});

/**
 * POST /api/admin/billing/overrides/reset - Bulk delete manual overrides by model name.
 *
 * Semantics:
 * - If the model has an active synced price, deleting the override effectively "resets to official".
 * - If not, the model will become unbillable until a synced price exists or an override is recreated.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const body = await request.json();
    const validated = resetSchema.parse(body);
    const result = await deleteBillingManualPriceOverridesByModels(validated.models);
    return NextResponse.json({
      deleted_count: result.deletedCount,
      missing_official_models: result.missingOfficialModels,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    log.error({ err: error }, "failed to reset billing overrides");
    return errorResponse("Internal server error", 500);
  }
}
