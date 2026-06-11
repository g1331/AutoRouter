import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import {
  changeUsername,
  UserNotFoundError,
  UsernameConflictError,
  InvalidUsernameError,
} from "@/lib/services/user-service";
import { transformUserToApi } from "@/lib/utils/api-transformers";
import { z } from "zod";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-users");

type RouteContext = { params: Promise<{ id: string }> };

const changeUsernameSchema = z
  .object({
    username: z.string().trim().min(1).max(255),
  })
  .strict();

/**
 * PUT /api/admin/users/[id]/username - Change a user's login username
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
    const validated = changeUsernameSchema.parse(body);

    const result = await changeUsername(id, validated.username);

    return NextResponse.json(transformUserToApi(result));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    if (error instanceof UsernameConflictError) {
      return errorResponse(error.message, 409);
    }
    if (error instanceof InvalidUsernameError) {
      return errorResponse(error.message, 400);
    }
    if (error instanceof UserNotFoundError) {
      return errorResponse("User not found", 404);
    }
    log.error({ err: error }, "failed to change username");
    return errorResponse("Internal server error", 500);
  }
}
