import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import {
  assignApiKeyOwnership,
  revokeApiKeyOwnership,
  UserNotFoundError,
  ApiKeyOwnershipError,
} from "@/lib/services/user-service";
import { z } from "zod";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-keys-owner");

type RouteContext = { params: Promise<{ id: string }> };

const assignOwnerSchema = z
  .object({
    user_id: z.string().uuid(),
  })
  .strict();

/**
 * PUT /api/admin/keys/[id]/owner - Assign ownership of an API key to a user
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request);
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
    const validated = assignOwnerSchema.parse(body);

    await assignApiKeyOwnership(id, validated.user_id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    if (error instanceof UserNotFoundError) {
      return errorResponse("User not found", 404);
    }
    if (error instanceof ApiKeyOwnershipError) {
      return errorResponse("API key not found", 404);
    }
    log.error({ err: error }, "failed to assign API key ownership");
    return errorResponse("Internal server error", 500);
  }
}

/**
 * DELETE /api/admin/keys/[id]/owner - Revoke ownership of an API key
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { id } = await context.params;

    await revokeApiKeyOwnership(id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof ApiKeyOwnershipError) {
      return errorResponse("API key not found", 404);
    }
    log.error({ err: error }, "failed to revoke API key ownership");
    return errorResponse("Internal server error", 500);
  }
}
