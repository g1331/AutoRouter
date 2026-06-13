import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import {
  getUserById,
  getUserUpstreams,
  setUserUpstreams,
  UserNotFoundError,
  UpstreamAssignmentError,
} from "@/lib/services/user-service";
import { z } from "zod";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-users");

type RouteContext = { params: Promise<{ id: string }> };

const setUpstreamsSchema = z
  .object({
    upstream_ids: z.array(z.string().uuid()),
  })
  .strict();

/**
 * GET /api/admin/users/[id]/upstreams - List the upstreams available to a user
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

    const upstreamIds = await getUserUpstreams(id);
    return NextResponse.json({ upstream_ids: upstreamIds });
  } catch (error) {
    log.error({ err: error }, "failed to get user upstreams");
    return errorResponse("Internal server error", 500);
  }
}

/**
 * PUT /api/admin/users/[id]/upstreams - Replace the set of upstreams available to a user
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
    const validated = setUpstreamsSchema.parse(body);

    const upstreamIds = await setUserUpstreams(id, validated.upstream_ids);
    return NextResponse.json({ upstream_ids: upstreamIds });
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
    if (error instanceof UpstreamAssignmentError) {
      return errorResponse(error.message, 400);
    }
    log.error({ err: error }, "failed to set user upstreams");
    return errorResponse("Internal server error", 500);
  }
}
