import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { config } from "./config";
import { extractApiKey, validateAdminAuth } from "./auth";
import { verifyUserToken } from "./jwt";
import { createLogger } from "./logger";

const log = createLogger("api-auth");

export type ApiHandler<T = unknown> = (request: NextRequest, context: T) => Promise<NextResponse>;

/**
 * Wrap an API handler with admin authentication.
 */
export function withAdminAuth<T = unknown>(handler: ApiHandler<T>): ApiHandler<T> {
  return async (request: NextRequest, context: T) => {
    const authHeader = request.headers.get("authorization");

    if (!validateAdminAuth(authHeader)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return handler(request, context);
  };
}

/**
 * Create a JSON error response.
 */
export function errorResponse(message: string, status: number = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Parse pagination parameters from request.
 */
export function getPaginationParams(request: NextRequest): { page: number; pageSize: number } {
  const url = new URL(request.url);
  const parsedPage = parseInt(url.searchParams.get("page") || "1", 10);
  const parsedPageSize = parseInt(url.searchParams.get("page_size") || "20", 10);

  const page = Math.max(1, isNaN(parsedPage) ? 1 : parsedPage);
  const pageSize = Math.min(100, Math.max(1, isNaN(parsedPageSize) ? 20 : parsedPageSize));

  return { page, pageSize };
}

/**
 * Authenticated principal resolved from a request.
 *
 * - `admin_token`: the bootstrap ADMIN_TOKEN super-admin (no user record).
 * - `user`: a JWT-authenticated user, with role and active state resolved from
 *   the current database row rather than the token payload.
 * - `null`: unauthenticated.
 */
export type AuthPrincipal =
  | { kind: "admin_token" }
  | { kind: "user"; userId: string; role: "admin" | "member"; username: string }
  | null;

/**
 * Constant-time string comparison guarding against timing side channels. Returns
 * false fast on length mismatch (the length difference is not itself a secret).
 *
 * @param a - First string
 * @param b - Second string
 * @returns True when the strings are equal
 */
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Resolve the authenticated principal from a request's Authorization header.
 *
 * ADMIN_TOKEN is matched first with a constant-time comparison and never
 * triggers a database lookup. A JWT is verified, then the user's current row is
 * loaded so role and active state come from the database — a token signed for a
 * since-deactivated user is rejected, and a since-demoted admin is downgraded.
 *
 * @param request - The incoming request
 * @returns The resolved principal, or null when unauthenticated
 */
export async function authenticate(request: NextRequest): Promise<AuthPrincipal> {
  const token = extractApiKey(request.headers.get("authorization"));
  if (!token) {
    return null;
  }

  if (config.adminToken && safeEqual(token, config.adminToken)) {
    return { kind: "admin_token" };
  }

  const claims = await verifyUserToken(token);
  if (!claims) {
    return null;
  }

  const rows = await db
    .select({
      id: users.id,
      role: users.role,
      username: users.username,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, claims.userId))
    .limit(1);

  const user = rows[0];
  if (!user || !user.isActive) {
    return null;
  }

  return {
    kind: "user",
    userId: user.id,
    role: user.role === "admin" ? "admin" : "member",
    username: user.username,
  };
}

/**
 * Resolve the principal, converting an unexpected failure (e.g. a database error
 * during the user lookup) into a clean 500 response, so the gate functions always
 * return a value rather than throwing into the caller's route handler.
 *
 * @param request - The incoming request
 * @returns A principal wrapper, or a 500 NextResponse on unexpected failure
 */
async function authenticateOrError(
  request: NextRequest
): Promise<{ principal: AuthPrincipal } | NextResponse> {
  try {
    return { principal: await authenticate(request) };
  } catch (err) {
    log.error({ err }, "authentication failed unexpectedly");
    return errorResponse("Internal server error", 500);
  }
}

/**
 * Require an admin-capable principal. The ADMIN_TOKEN super-admin and any user
 * whose current role is `admin` pass; an authenticated `member` is rejected with
 * 403 and an unauthenticated request with 401.
 *
 * @param request - The incoming request
 * @returns The admin principal, or a NextResponse error to return directly
 */
export async function requireAdmin(
  request: NextRequest
): Promise<Exclude<AuthPrincipal, null> | NextResponse> {
  const resolved = await authenticateOrError(request);
  if (resolved instanceof NextResponse) {
    return resolved;
  }
  const { principal } = resolved;
  if (!principal) {
    return errorResponse("Unauthorized", 401);
  }
  if (principal.kind === "admin_token" || principal.role === "admin") {
    return principal;
  }
  return errorResponse("Forbidden", 403);
}

/**
 * Require any authenticated principal. Returns the principal or a NextResponse
 * error. A `user` principal carries userId for data isolation; the ADMIN_TOKEN
 * super-admin passes without a userId, so user-side endpoints must handle that
 * `admin_token` kind explicitly rather than assume a userId is present.
 *
 * @param request - The incoming request
 * @returns The authenticated principal, or a NextResponse error to return directly
 */
export async function requireUser(
  request: NextRequest
): Promise<Exclude<AuthPrincipal, null> | NextResponse> {
  const resolved = await authenticateOrError(request);
  if (resolved instanceof NextResponse) {
    return resolved;
  }
  const { principal } = resolved;
  if (!principal) {
    return errorResponse("Unauthorized", 401);
  }
  return principal;
}
