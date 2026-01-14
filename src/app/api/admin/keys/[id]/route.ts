import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { getApiKeyById, deleteApiKey, ApiKeyNotFoundError } from "@/lib/services/key-manager";
import { transformApiKeyToApi } from "@/lib/utils/api-transformers";

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
    console.error("Failed to get API key:", error);
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
    console.error("Failed to delete API key:", error);
    return errorResponse("Internal server error", 500);
  }
}
