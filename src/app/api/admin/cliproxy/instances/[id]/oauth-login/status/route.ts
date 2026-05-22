import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { pollCliproxyOAuthStatus } from "@/lib/services/cliproxy-oauth-login-service";
import { handleCliproxyRouteError } from "@/lib/utils/cliproxy-route-errors";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-cliproxy-oauth-login");

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/cliproxy/instances/:id/oauth-login/status?state=... - 轮询登录状态。
 */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  if (!validateAdminAuth(request.headers.get("authorization"))) {
    return errorResponse("Unauthorized", 401);
  }

  const { id } = await context.params;
  const state = new URL(request.url).searchParams.get("state");
  if (!state) {
    return errorResponse("Query parameter 'state' is required", 400);
  }

  try {
    const result = await pollCliproxyOAuthStatus(id, state);
    return NextResponse.json({ data: result });
  } catch (err) {
    const mapped = handleCliproxyRouteError(err);
    if (mapped) {
      return mapped;
    }
    log.error({ err }, "Failed to poll CLIProxyAPI OAuth login status");
    return errorResponse("Internal server error", 500);
  }
}
