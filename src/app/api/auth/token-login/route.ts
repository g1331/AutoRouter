import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/utils/config";
import { errorResponse, safeEqual } from "@/lib/utils/api-auth";
import { signAdminSessionToken } from "@/lib/utils/jwt";
import {
  checkLoginRateLimit,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/services/login-rate-limiter";

// Fixed rate-limit bucket for ADMIN_TOKEN login attempts. There is no username
// dimension here, so all attempts share one username bucket while still being
// throttled per source IP.
const ADMIN_TOKEN_BUCKET = "__admin_token__";

/**
 * Extract the best-effort source IP from forwarding headers for rate limiting,
 * falling back to a constant bucket so unidentifiable clients still share one
 * counter rather than bypassing it.
 *
 * @param request - The incoming request
 * @returns The client IP, or "unknown" when undeterminable
 */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "unknown";
}

/**
 * POST /api/auth/token-login — exchange the bootstrap ADMIN_TOKEN for a
 * short-lived super-admin session JWT.
 *
 * The permanent ADMIN_TOKEN is verified server-side with a constant-time compare
 * but never returned to or stored by the browser; instead a 24h session JWT is
 * minted so the token-mode login can be persisted ("remember me") without
 * writing the non-expiring super-admin credential to disk. Attempts are rate
 * limited per source IP to throttle brute forcing.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid request body", 400);
  }

  const payload = body as Record<string, unknown> | null;
  const token = typeof payload?.token === "string" ? payload.token : "";
  if (!token) {
    return errorResponse("Token is required", 400);
  }

  const ip = getClientIp(request);

  const limit = checkLoginRateLimit(ADMIN_TOKEN_BUCKET, ip);
  if (!limit.allowed) {
    const response = errorResponse("Too many failed login attempts. Try again later.", 429);
    if (limit.retryAfterSeconds) {
      response.headers.set("Retry-After", String(limit.retryAfterSeconds));
    }
    return response;
  }

  if (!config.adminToken || !safeEqual(token, config.adminToken)) {
    recordLoginFailure(ADMIN_TOKEN_BUCKET, ip);
    return errorResponse("Invalid token", 401);
  }

  recordLoginSuccess(ADMIN_TOKEN_BUCKET);
  const sessionToken = await signAdminSessionToken();
  return NextResponse.json({ token: sessionToken });
}
