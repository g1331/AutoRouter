import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  getApiKeyById,
  deleteApiKey,
  updateApiKey,
  ApiKeyNotFoundError,
  type ApiKeyUpdateInput,
} from "@/lib/services/key-manager";
import { transformApiKeyToApi } from "@/lib/utils/api-transformers";
import { z } from "zod";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-keys");

type RouteContext = { params: Promise<{ id: string }> };

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

    return NextResponse.json(transformApiKeyToApi(apiKey));
  } catch (error) {
    log.error({ err: error }, "failed to get API key");
    return errorResponse("Internal server error", 500);
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
    log.error({ err: error }, "failed to delete API key");
    return errorResponse("Internal server error", 500);
  }
}

const updateApiKeySchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().nullable().optional(),
    is_active: z.boolean().optional(),
    expires_at: z.string().datetime().nullable().optional(),
    upstream_ids: z.array(z.string().uuid()).min(1).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

/**
 * PUT /api/admin/keys/[id] - Update an API key
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    z.string().uuid().parse(id);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }
    const validated = updateApiKeySchema.parse(body);

    const input: ApiKeyUpdateInput = {};

    if (validated.name !== undefined) {
      input.name = validated.name;
    }
    if (validated.description !== undefined) {
      input.description = validated.description;
    }
    if (validated.is_active !== undefined) {
      input.isActive = validated.is_active;
    }
    if (validated.expires_at !== undefined) {
      input.expiresAt = validated.expires_at ? new Date(validated.expires_at) : null;
    }
    if (validated.upstream_ids !== undefined) {
      input.upstreamIds = validated.upstream_ids;
    }

    const result = await updateApiKey(id, input);

    return NextResponse.json(transformApiKeyToApi(result));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    if (error instanceof ApiKeyNotFoundError) {
      return errorResponse("API key not found", 404);
    }
    log.error({ err: error }, "failed to update API key");

    if (error instanceof Error) {
      // Treat service-level validation failures as 400s.
      if (
        error.message.startsWith("Invalid upstream IDs:") ||
        error.message === "At least one upstream must be specified"
      ) {
        return errorResponse(error.message, 400);
      }
    }

    return errorResponse("Internal server error", 500);
  }
}
