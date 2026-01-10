import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  getApiKeyById,
  updateApiKey,
  deleteApiKey,
  ApiKeyNotFoundError,
  type ApiKeyUpdateInput,
} from "@/lib/services/key-manager";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

const updateApiKeySchema = z.object({
  name: z.string().min(1).max(64).optional(),
  description: z.string().nullable().optional(),
  upstream_ids: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  expires_at: z.string().nullable().optional(),
});

/**
 * GET /api/admin/keys/[id] - Get API key details
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    const apiKey = await getApiKeyById(id);

    if (!apiKey) {
      return errorResponse("API key not found", 404);
    }

    return NextResponse.json({
      id: apiKey.id,
      key_prefix: apiKey.keyPrefix,
      name: apiKey.name,
      description: apiKey.description,
      upstream_ids: apiKey.upstreamIds,
      is_active: apiKey.isActive,
      expires_at: apiKey.expiresAt?.toISOString() ?? null,
      created_at: apiKey.createdAt.toISOString(),
      updated_at: apiKey.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Failed to get API key:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * PUT /api/admin/keys/[id] - Update API key
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const validated = updateApiKeySchema.parse(body);

    const input: ApiKeyUpdateInput = {};
    if (validated.name !== undefined) input.name = validated.name;
    if (validated.description !== undefined) input.description = validated.description;
    if (validated.upstream_ids !== undefined) input.upstreamIds = validated.upstream_ids;
    if (validated.is_active !== undefined) input.isActive = validated.is_active;
    if (validated.expires_at !== undefined) {
      input.expiresAt = validated.expires_at ? new Date(validated.expires_at) : null;
    }

    const result = await updateApiKey(id, input);

    return NextResponse.json({
      id: result.id,
      key_prefix: result.keyPrefix,
      name: result.name,
      description: result.description,
      upstream_ids: result.upstreamIds,
      is_active: result.isActive,
      expires_at: result.expiresAt?.toISOString() ?? null,
      created_at: result.createdAt.toISOString(),
      updated_at: result.updatedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof ApiKeyNotFoundError) {
      return errorResponse("API key not found", 404);
    }
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    console.error("Failed to update API key:", error);
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}

/**
 * DELETE /api/admin/keys/[id] - Delete (revoke) an API key
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    await deleteApiKey(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof ApiKeyNotFoundError) {
      return errorResponse("API key not found", 404);
    }
    console.error("Failed to delete API key:", error);
    return errorResponse("Internal server error", 500);
  }
}
