import { NextRequest, NextResponse } from "next/server";
import { getPaginationParams, errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import {
  listUsers,
  createUser,
  UsernameConflictError,
  WeakPasswordError,
  InvalidUsernameError,
  type UserCreateInput,
} from "@/lib/services/user-service";
import { transformPaginatedUsers, transformUserToApi } from "@/lib/utils/api-transformers";
import { z } from "zod";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-users");

const createUserSchema = z
  .object({
    username: z.string().trim().min(1).max(255),
    password: z.string().min(1),
    display_name: z.string().trim().min(1).max(255),
    role: z.enum(["admin", "member"]).optional(),
  })
  .strict();

/**
 * GET /api/admin/users - List users with owned API key counts
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { page, pageSize } = getPaginationParams(request);
    const result = await listUsers(page, pageSize);

    return NextResponse.json(transformPaginatedUsers(result));
  } catch (error) {
    log.error({ err: error }, "failed to list users");
    return errorResponse("Internal server error", 500);
  }
}

/**
 * POST /api/admin/users - Create a new user
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }
    const validated = createUserSchema.parse(body);

    const input: UserCreateInput = {
      username: validated.username,
      password: validated.password,
      displayName: validated.display_name,
      role: validated.role,
    };

    const result = await createUser(input);

    return NextResponse.json(transformUserToApi(result), { status: 201 });
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
    if (error instanceof WeakPasswordError) {
      return errorResponse(error.message, 400);
    }
    log.error({ err: error }, "failed to create user");
    return errorResponse("Internal server error", 500);
  }
}
