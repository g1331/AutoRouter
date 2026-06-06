import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { initiateCliproxyOAuthLogin } from "@/lib/services/cliproxy-oauth-login-service";
import { CLIPROXY_OAUTH_PROVIDERS } from "@/lib/services/cliproxy-management-client";
import { handleCliproxyRouteError } from "@/lib/utils/cliproxy-route-errors";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-cliproxy-oauth-login");

type RouteContext = { params: Promise<{ id: string }> };

const initiateSchema = z.object({
  provider: z.enum(CLIPROXY_OAUTH_PROVIDERS),
});

/**
 * POST /api/admin/cliproxy/instances/:id/oauth-login - 发起 OAuth 登录。
 */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const parsed = initiateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid request body", 400);
  }

  try {
    const result = await initiateCliproxyOAuthLogin(id, parsed.data.provider);
    return NextResponse.json({ data: result });
  } catch (err) {
    const mapped = handleCliproxyRouteError(err);
    if (mapped) {
      return mapped;
    }
    log.error({ err }, "Failed to initiate CLIProxyAPI OAuth login");
    return errorResponse("Internal server error", 500);
  }
}
