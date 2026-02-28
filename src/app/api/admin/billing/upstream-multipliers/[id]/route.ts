import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { createLogger } from "@/lib/utils/logger";
import { updateUpstreamBillingMultipliers } from "@/lib/services/billing-management-service";
import { transformUpstreamBillingMultiplierToApi } from "@/lib/utils/api-transformers";

const log = createLogger("admin-billing-upstream-multiplier");

type RouteContext = { params: Promise<{ id: string }> };

const updateMultiplierSchema = z
  .object({
    input_multiplier: z.number().min(0).max(100).optional(),
    output_multiplier: z.number().min(0).max(100).optional(),
  })
  .refine((data) => data.input_multiplier !== undefined || data.output_multiplier !== undefined, {
    message: "At least one multiplier must be provided",
  });

/**
 * PUT /api/admin/billing/upstream-multipliers/[id] - Update multipliers.
 */
export async function PUT(request: NextRequest, context: RouteContext): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const validated = updateMultiplierSchema.parse(body);
    const upstream = await updateUpstreamBillingMultipliers(id, {
      inputMultiplier: validated.input_multiplier,
      outputMultiplier: validated.output_multiplier,
    });
    if (!upstream) {
      return errorResponse("Upstream not found", 404);
    }
    return NextResponse.json(
      transformUpstreamBillingMultiplierToApi({
        id: upstream.id,
        name: upstream.name,
        isActive: upstream.isActive,
        inputMultiplier: upstream.billingInputMultiplier,
        outputMultiplier: upstream.billingOutputMultiplier,
      })
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    log.error({ err: error }, "failed to update upstream billing multiplier");
    return errorResponse("Internal server error", 500);
  }
}
