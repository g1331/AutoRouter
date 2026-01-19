import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  getUpstreamGroupById,
  updateUpstreamGroup,
  deleteUpstreamGroup,
  UpstreamGroupNotFoundError,
  type UpstreamGroupUpdateInput,
} from "@/lib/services/upstream-service";
import { transformUpstreamGroupToApi } from "@/lib/utils/api-transformers";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

const updateUpstreamGroupSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  provider: z.enum(["openai", "anthropic"]).optional(),
  strategy: z.enum(["round_robin", "weighted", "least_connections"]).optional(),
  health_check_interval: z.number().int().positive().optional(),
  health_check_timeout: z.number().int().positive().optional(),
  is_active: z.boolean().optional(),
  config: z.string().nullable().optional(),
});

/**
 * GET /api/admin/upstreams/groups/[id] - Get upstream group details
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    const group = await getUpstreamGroupById(id);

    if (!group) {
      return errorResponse("Upstream group not found", 404);
    }

    return NextResponse.json(transformUpstreamGroupToApi(group));
  } catch (error) {
    console.error("Failed to get upstream group:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * PUT /api/admin/upstreams/groups/[id] - Update upstream group
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const validated = updateUpstreamGroupSchema.parse(body);

    const input: UpstreamGroupUpdateInput = {};
    if (validated.name !== undefined) input.name = validated.name;
    if (validated.provider !== undefined) input.provider = validated.provider;
    if (validated.strategy !== undefined) input.strategy = validated.strategy;
    if (validated.health_check_interval !== undefined)
      input.healthCheckInterval = validated.health_check_interval;
    if (validated.health_check_timeout !== undefined)
      input.healthCheckTimeout = validated.health_check_timeout;
    if (validated.is_active !== undefined) input.isActive = validated.is_active;
    if (validated.config !== undefined) input.config = validated.config;

    const result = await updateUpstreamGroup(id, input);

    return NextResponse.json(transformUpstreamGroupToApi(result));
  } catch (error) {
    if (error instanceof UpstreamGroupNotFoundError) {
      return errorResponse("Upstream group not found", 404);
    }
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    console.error("Failed to update upstream group:", error);
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}

/**
 * DELETE /api/admin/upstreams/groups/[id] - Delete upstream group
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    await deleteUpstreamGroup(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof UpstreamGroupNotFoundError) {
      return errorResponse("Upstream group not found", 404);
    }
    console.error("Failed to delete upstream group:", error);
    return errorResponse("Internal server error", 500);
  }
}
