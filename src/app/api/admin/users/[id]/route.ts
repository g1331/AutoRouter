import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import {
  getUserById,
  updateUser,
  deleteUser,
  UserNotFoundError,
  LastActiveAdminError,
  type UserUpdateInput,
} from "@/lib/services/user-service";
import { transformUserToApi } from "@/lib/utils/api-transformers";
import { z } from "zod";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-users");

type RouteContext = { params: Promise<{ id: string }> };

const updateUserSchema = z
  .object({
    display_name: z.string().min(1).max(255).optional(),
    role: z.enum(["admin", "member"]).optional(),
    is_active: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

/**
 * GET /api/admin/users/[id] - Get user details
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { id } = await context.params;
    const user = await getUserById(id);

    if (!user) {
      return errorResponse("User not found", 404);
    }

    return NextResponse.json(transformUserToApi(user));
  } catch (error) {
    log.error({ err: error }, "failed to get user");
    return errorResponse("Internal server error", 500);
  }
}

/**
 * PUT /api/admin/users/[id] - Update a user's profile, role, or active state
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
    const validated = updateUserSchema.parse(body);

    const input: UserUpdateInput = {};
    if (validated.display_name !== undefined) {
      input.displayName = validated.display_name;
    }
    if (validated.role !== undefined) {
      input.role = validated.role;
    }
    if (validated.is_active !== undefined) {
      input.isActive = validated.is_active;
    }

    const result = await updateUser(id, input);

    return NextResponse.json(transformUserToApi(result));
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
    if (error instanceof LastActiveAdminError) {
      return errorResponse(error.message, 409);
    }
    log.error({ err: error }, "failed to update user");
    return errorResponse("Internal server error", 500);
  }
}

/**
 * DELETE /api/admin/users/[id] - Delete a user, detaching owned API keys
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { id } = await context.params;
    await deleteUser(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      return errorResponse("User not found", 404);
    }
    if (error instanceof LastActiveAdminError) {
      return errorResponse(error.message, 409);
    }
    log.error({ err: error }, "failed to delete user");
    return errorResponse("Internal server error", 500);
  }
}
