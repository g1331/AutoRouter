import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { revealApiKey, ApiKeyNotFoundError, LegacyApiKeyError } from "@/lib/services/key-manager";
import { transformApiKeyRevealToApi } from "@/lib/utils/api-transformers";
import { config } from "@/lib/utils/config";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-keys");

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
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
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
    log.error({ err: error }, "failed to reveal API key");
    return errorResponse("Internal server error", 500);
  }
}
