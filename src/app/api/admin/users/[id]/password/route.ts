import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { resetPassword, UserNotFoundError, WeakPasswordError } from "@/lib/services/user-service";
import { z } from "zod";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-users");

type RouteContext = { params: Promise<{ id: string }> };

const resetPasswordSchema = z
  .object({
    password: z.string().min(1),
  })
  .strict();

/**
 * PUT /api/admin/users/[id]/password - Reset a user's password
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
    const validated = resetPasswordSchema.parse(body);

    await resetPassword(id, validated.password);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    if (error instanceof WeakPasswordError) {
      return errorResponse(error.message, 400);
    }
    if (error instanceof UserNotFoundError) {
      return errorResponse("User not found", 404);
    }
    log.error({ err: error }, "failed to reset password");
    return errorResponse("Internal server error", 500);
  }
}
