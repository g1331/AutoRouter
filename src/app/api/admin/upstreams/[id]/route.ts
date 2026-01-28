import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  getUpstreamById,
  updateUpstream,
  deleteUpstream,
  UpstreamNotFoundError,
  UpstreamGroupNotFoundError,
  type UpstreamUpdateInput,
} from "@/lib/services/upstream-service";
import { transformUpstreamToApi } from "@/lib/utils/api-transformers";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

const updateUpstreamSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  provider: z.enum(["openai", "anthropic"]).optional(),
  base_url: z.string().url().optional(),
  api_key: z.string().min(1).optional(),
  is_default: z.boolean().optional(),
  timeout: z.number().int().positive().optional(),
  is_active: z.boolean().optional(),
  config: z.string().nullable().optional(),
  group_id: z.string().uuid().nullable().optional(),
  weight: z.number().int().min(1).max(100).optional(),
  provider_type: z.enum(["anthropic", "openai", "google", "custom"]).nullable().optional(),
  allowed_models: z.array(z.string()).nullable().optional(),
  model_redirects: z.record(z.string(), z.string()).nullable().optional(),
});

/**
 * GET /api/admin/upstreams/[id] - Get upstream details
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    const upstream = await getUpstreamById(id);

    if (!upstream) {
      return errorResponse("Upstream not found", 404);
    }

    return NextResponse.json(transformUpstreamToApi(upstream));
  } catch (error) {
    console.error("Failed to get upstream:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * PUT /api/admin/upstreams/[id] - Update upstream
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const validated = updateUpstreamSchema.parse(body);

    const input: UpstreamUpdateInput = {};
    if (validated.name !== undefined) input.name = validated.name;
    if (validated.provider !== undefined) input.provider = validated.provider;
    if (validated.base_url !== undefined) input.baseUrl = validated.base_url;
    if (validated.api_key !== undefined) input.apiKey = validated.api_key;
    if (validated.is_default !== undefined) input.isDefault = validated.is_default;
    if (validated.timeout !== undefined) input.timeout = validated.timeout;
    if (validated.is_active !== undefined) input.isActive = validated.is_active;
    if (validated.config !== undefined) input.config = validated.config;
    if (validated.group_id !== undefined) input.groupId = validated.group_id;
    if (validated.weight !== undefined) input.weight = validated.weight;
    if (validated.provider_type !== undefined) input.providerType = validated.provider_type;
    if (validated.allowed_models !== undefined) input.allowedModels = validated.allowed_models;
    if (validated.model_redirects !== undefined) input.modelRedirects = validated.model_redirects;

    const result = await updateUpstream(id, input);

    return NextResponse.json(transformUpstreamToApi(result));
  } catch (error) {
    if (error instanceof UpstreamNotFoundError) {
      return errorResponse("Upstream not found", 404);
    }
    if (error instanceof UpstreamGroupNotFoundError) {
      return errorResponse("Upstream group not found", 404);
    }
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    console.error("Failed to update upstream:", error);
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}

/**
 * DELETE /api/admin/upstreams/[id] - Delete upstream
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    await deleteUpstream(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof UpstreamNotFoundError) {
      return errorResponse("Upstream not found", 404);
    }
    console.error("Failed to delete upstream:", error);
    return errorResponse("Internal server error", 500);
  }
}
