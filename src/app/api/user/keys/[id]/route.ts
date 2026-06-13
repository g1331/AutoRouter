import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireMember } from "@/lib/utils/api-auth";
import {
  updateOwnApiKey,
  deleteOwnApiKey,
  KeyOwnershipError,
  UpstreamNotAllowedError,
  SpendingRuleRelaxationError,
} from "@/lib/services/user-key-service";
import { transformApiKeyToApi } from "@/lib/utils/api-transformers";
import { z } from "zod";
import { createLogger } from "@/lib/utils/logger";
import { nullableSpendingRulesSchema } from "@/lib/services/spending-rules";

const log = createLogger("user-keys");

type RouteContext = { params: Promise<{ id: string }> };

// Unknown fields — including any attempted user_id or access_mode — are
// stripped by the schema, so ownership transfers and access-mode escalation
// are structurally impossible from this surface (decision 8).
const updateOwnKeySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  upstream_ids: z.array(z.string().uuid()).min(1).optional(),
  spending_rules: nullableSpendingRulesSchema,
});

/**
 * PUT /api/user/keys/[id] - Update one of the caller's own API keys
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireMember(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { id } = await context.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }
    const validated = updateOwnKeySchema.parse(body);

    const result = await updateOwnApiKey(auth.userId, id, {
      ...(validated.name !== undefined ? { name: validated.name } : {}),
      ...(validated.description !== undefined ? { description: validated.description } : {}),
      ...(validated.is_active !== undefined ? { isActive: validated.is_active } : {}),
      ...(validated.upstream_ids !== undefined ? { upstreamIds: validated.upstream_ids } : {}),
      ...(validated.spending_rules !== undefined
        ? { spendingRules: validated.spending_rules }
        : {}),
    });

    return NextResponse.json(transformApiKeyToApi(result));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    if (error instanceof KeyOwnershipError) {
      return errorResponse("API key not found", 404);
    }
    if (error instanceof UpstreamNotAllowedError) {
      return errorResponse(error.message, 403);
    }
    if (error instanceof SpendingRuleRelaxationError) {
      return errorResponse(error.message, 400);
    }
    log.error({ err: error }, "failed to update own API key");
    return errorResponse("Internal server error", 500);
  }
}

/**
 * DELETE /api/user/keys/[id] - Delete one of the caller's own API keys
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireMember(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { id } = await context.params;
    await deleteOwnApiKey(auth.userId, id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof KeyOwnershipError) {
      return errorResponse("API key not found", 404);
    }
    log.error({ err: error }, "failed to delete own API key");
    return errorResponse("Internal server error", 500);
  }
}
