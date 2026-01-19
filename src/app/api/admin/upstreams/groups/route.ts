import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { getPaginationParams, errorResponse } from "@/lib/utils/api-auth";
import {
  listUpstreamGroups,
  createUpstreamGroup,
  type UpstreamGroupCreateInput,
} from "@/lib/services/upstream-service";
import {
  transformPaginatedUpstreamGroups,
  transformUpstreamGroupToApi,
} from "@/lib/utils/api-transformers";
import { z } from "zod";

const createUpstreamGroupSchema = z.object({
  name: z.string().min(1).max(64),
  provider: z.enum(["openai", "anthropic"]),
  strategy: z.enum(["round_robin", "weighted", "least_connections"]).default("round_robin"),
  health_check_interval: z.number().int().positive().default(30),
  health_check_timeout: z.number().int().positive().default(10),
  config: z.string().nullable().optional(),
});

/**
 * GET /api/admin/upstreams/groups - List all upstream groups
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { page, pageSize } = getPaginationParams(request);
    const result = await listUpstreamGroups(page, pageSize);

    return NextResponse.json(transformPaginatedUpstreamGroups(result));
  } catch (error) {
    console.error("Failed to list upstream groups:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * POST /api/admin/upstreams/groups - Create a new upstream group
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const body = await request.json();
    const validated = createUpstreamGroupSchema.parse(body);

    const input: UpstreamGroupCreateInput = {
      name: validated.name,
      provider: validated.provider,
      strategy: validated.strategy,
      healthCheckInterval: validated.health_check_interval,
      healthCheckTimeout: validated.health_check_timeout,
      config: validated.config ?? null,
    };

    const result = await createUpstreamGroup(input);

    return NextResponse.json(transformUpstreamGroupToApi(result), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    console.error("Failed to create upstream group:", error);
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
