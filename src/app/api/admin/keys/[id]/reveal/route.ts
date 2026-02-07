import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { revealApiKey, ApiKeyNotFoundError, LegacyApiKeyError } from "@/lib/services/key-manager";
import { transformApiKeyRevealToApi } from "@/lib/utils/api-transformers";
import { config } from "@/lib/utils/config";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/keys/[id]/reveal - Reveal full API key value
 */
export async function GET(request: NextRequest, context: RouteContext) {
  return handleReveal(request, context);
}

/**
 * POST /api/admin/keys/[id]/reveal - Reveal full API key value
 */
export async function POST(request: NextRequest, context: RouteContext) {
  return handleReveal(request, context);
}

async function handleReveal(request: NextRequest, context: RouteContext) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  // Check if key reveal is enabled
  if (!config.allowKeyReveal) {
    return errorResponse("Key reveal is disabled. Set ALLOW_KEY_REVEAL=true to enable.", 403);
  }

  try {
    const { id } = await context.params;
    const result = await revealApiKey(id);

    return NextResponse.json(transformApiKeyRevealToApi(result));
  } catch (error) {
    if (error instanceof ApiKeyNotFoundError) {
      return errorResponse("API key not found", 404);
    }
    if (error instanceof LegacyApiKeyError) {
      return errorResponse("Legacy keys (bcrypt-only) cannot be revealed.", 400);
    }
    console.error("Failed to reveal API key:", error);
    return errorResponse("Internal server error", 500);
  }
}
