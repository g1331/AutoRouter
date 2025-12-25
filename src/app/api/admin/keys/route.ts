import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { getPaginationParams, errorResponse } from "@/lib/utils/api-auth";
import { listApiKeys, createApiKey, type ApiKeyCreateInput } from "@/lib/services/key-manager";
import { z } from "zod";

const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  upstream_ids: z.array(z.string().uuid()).min(1),
  description: z.string().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
});

/**
 * GET /api/admin/keys - List all API keys
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { page, pageSize } = getPaginationParams(request);
    const result = await listApiKeys(page, pageSize);

    // Convert to snake_case for API compatibility
    return NextResponse.json({
      items: result.items.map((item) => ({
        id: item.id,
        key_prefix: item.keyPrefix,
        name: item.name,
        description: item.description,
        upstream_ids: item.upstreamIds,
        is_active: item.isActive,
        expires_at: item.expiresAt?.toISOString() ?? null,
        created_at: item.createdAt.toISOString(),
        updated_at: item.updatedAt.toISOString(),
      })),
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
      total_pages: result.totalPages,
    });
  } catch (error) {
    console.error("Failed to list API keys:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * POST /api/admin/keys - Create a new API key
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const body = await request.json();
    const validated = createApiKeySchema.parse(body);

    const input: ApiKeyCreateInput = {
      name: validated.name,
      upstreamIds: validated.upstream_ids,
      description: validated.description ?? null,
      expiresAt: validated.expires_at ? new Date(validated.expires_at) : null,
    };

    const result = await createApiKey(input);

    return NextResponse.json(
      {
        id: result.id,
        key_value: result.keyValue, // Only returned on creation
        key_prefix: result.keyPrefix,
        name: result.name,
        description: result.description,
        upstream_ids: result.upstreamIds,
        is_active: result.isActive,
        expires_at: result.expiresAt?.toISOString() ?? null,
        created_at: result.createdAt.toISOString(),
        updated_at: result.updatedAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    console.error("Failed to create API key:", error);
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
