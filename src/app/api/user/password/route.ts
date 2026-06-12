import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/utils/api-auth";
import {
  changeOwnPassword,
  InvalidCredentialsError,
  WeakPasswordError,
} from "@/lib/services/user-service";
import { z } from "zod";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("user-password");

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(1),
});

/**
 * PUT /api/user/password - Self-service password change.
 *
 * Verifies the current password and applies the same strength requirement as
 * the admin reset. The target user is always the authenticated principal.
 */
export async function PUT(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) {
    return auth;
  }
  if (auth.kind !== "user") {
    return errorResponse("Admin token has no personal data scope", 403);
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }
    const validated = changePasswordSchema.parse(body);

    await changeOwnPassword(auth.userId, validated.current_password, validated.new_password);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    if (error instanceof InvalidCredentialsError) {
      return errorResponse(error.message, 400);
    }
    if (error instanceof WeakPasswordError) {
      return errorResponse(error.message, 400);
    }
    log.error({ err: error }, "failed to change own password");
    return errorResponse("Internal server error", 500);
  }
}
