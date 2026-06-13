import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireMember } from "@/lib/utils/api-auth";
import {
  changeOwnPassword,
  InvalidCredentialsError,
  WeakPasswordError,
} from "@/lib/services/user-service";
import {
  checkPasswordChangeRateLimit,
  recordPasswordChangeFailure,
  recordPasswordChangeSuccess,
} from "@/lib/services/password-change-rate-limiter";
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
 *
 * Wrong-current-password attempts are rate limited per user so a caller holding
 * a valid session token but not the password cannot brute-force it online; once
 * the limit trips the endpoint returns 429 with a Retry-After header.
 */
export async function PUT(request: NextRequest) {
  const auth = await requireMember(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const limit = checkPasswordChangeRateLimit(auth.userId);
  if (!limit.allowed) {
    const response = errorResponse(
      "Too many failed password change attempts. Try again later.",
      429
    );
    if (limit.retryAfterSeconds) {
      response.headers.set("Retry-After", String(limit.retryAfterSeconds));
    }
    return response;
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

    recordPasswordChangeSuccess(auth.userId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    if (error instanceof InvalidCredentialsError) {
      recordPasswordChangeFailure(auth.userId);
      return errorResponse(error.message, 400);
    }
    if (error instanceof WeakPasswordError) {
      return errorResponse(error.message, 400);
    }
    log.error({ err: error }, "failed to change own password");
    return errorResponse("Internal server error", 500);
  }
}
