import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { getPaginationParams, errorResponse } from "@/lib/utils/api-auth";
import { listApiKeys, createApiKey, type ApiKeyCreateInput } from "@/lib/services/key-manager";
import {
  transformPaginatedApiKeys,
  transformApiKeyCreateToApi,
} from "@/lib/utils/api-transformers";
import { z } from "zod";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-keys");

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

    return NextResponse.json(transformPaginatedApiKeys(result));
  } catch (error) {
    log.error({ err: error }, "failed to list API keys");
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

    return NextResponse.json(transformApiKeyCreateToApi(result), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    log.error({ err: error }, "failed to create API key");
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
