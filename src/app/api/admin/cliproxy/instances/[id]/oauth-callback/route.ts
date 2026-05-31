import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { submitCliproxyOAuthCallback } from "@/lib/services/cliproxy-oauth-login-service";
import { CLIPROXY_OAUTH_PROVIDERS } from "@/lib/services/cliproxy-management-client";
import { handleCliproxyRouteError } from "@/lib/utils/cliproxy-route-errors";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-cliproxy-oauth-callback");

type RouteContext = { params: Promise<{ id: string }> };

/** 允许的回调 URL 协议；其它 scheme 一律拒绝以避免被透传出去触发非预期行为。 */
const ALLOWED_REDIRECT_PROTOCOLS = new Set(["http:", "https:"]);

const callbackSchema = z.object({
  provider: z.enum(CLIPROXY_OAUTH_PROVIDERS),
  redirect_url: z
    .string()
    .trim()
    .min(1)
    .max(4096)
    .refine(
      (value) => {
        try {
          return ALLOWED_REDIRECT_PROTOCOLS.has(new URL(value).protocol);
        } catch {
          return false;
        }
      },
      { message: "redirect_url must be an http(s) URL" }
    ),
});

/**
 * POST /api/admin/cliproxy/instances/:id/oauth-callback - 手动提交 OAuth 回调 URL。
 */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  if (!validateAdminAuth(request.headers.get("authorization"))) {
    return errorResponse("Unauthorized", 401);
  }

  const { id } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const parsed = callbackSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid request body", 400);
  }

  try {
    const result = await submitCliproxyOAuthCallback(
      id,
      parsed.data.provider,
      parsed.data.redirect_url
    );
    return NextResponse.json({ data: result });
  } catch (err) {
    const mapped = handleCliproxyRouteError(err);
    if (mapped) {
      return mapped;
    }
    log.error({ err }, "Failed to submit CLIProxyAPI OAuth callback");
    return errorResponse("Internal server error", 500);
  }
}
