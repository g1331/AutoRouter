import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { errorResponse } from "@/lib/utils/api-auth";
import { normalizeUsername, verifyPassword, hashPassword } from "@/lib/utils/auth";
import { signUserToken } from "@/lib/utils/jwt";
import {
  checkLoginRateLimit,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/services/login-rate-limiter";

/**
 * Extract the best-effort source IP from forwarding headers, used as a
 * rate-limit dimension. Falls back to a constant bucket when no header is set so
 * unidentifiable clients still share a single counter rather than bypassing it.
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
 * Lazily-generated bcrypt hash used to equalize response timing when the
 * username does not exist or the account is inactive, so a failed login takes
 * the same time whether or not the user exists. This denies username enumeration
 * through timing side channels, complementing the spec requirement that failures
 * not reveal whether the username or the password was wrong.
 */
let timingEqualizerHash: string | null = null;

/**
 * Spend bcrypt time without revealing whether a real user was found.
 *
 * @param password - The submitted password, hashed against the dummy hash
 */
async function consumeTimingEqualizer(password: string): Promise<void> {
  if (!timingEqualizerHash) {
    timingEqualizerHash = await hashPassword("login-timing-equalizer");
  }
  await verifyPassword(password, timingEqualizerHash);
}

/**
 * POST /api/auth/login — authenticate a username/password pair.
 *
 * Normalizes the username, enforces failure rate limiting, then verifies the
 * account exists, is active, and the password matches via bcrypt. On success it
 * issues a JWT carrying only `userId` and `role` and returns it with the user's
 * display fields. All failure paths return an identical 401 so the response does
 * not reveal whether the username or the password was wrong.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid request body", 400);
  }

  const payload = body as Record<string, unknown> | null;
  const rawUsername = typeof payload?.username === "string" ? payload.username : "";
  const password = typeof payload?.password === "string" ? payload.password : "";

  if (!rawUsername || !password) {
    return errorResponse("Username and password are required", 400);
  }

  const username = normalizeUsername(rawUsername);
  const ip = getClientIp(request);

  const limit = checkLoginRateLimit(username, ip);
  if (!limit.allowed) {
    const response = errorResponse("Too many failed login attempts. Try again later.", 429);
    if (limit.retryAfterSeconds) {
      response.headers.set("Retry-After", String(limit.retryAfterSeconds));
    }
    return response;
  }

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      passwordHash: users.passwordHash,
      role: users.role,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  const user = rows[0];

  let authenticated = false;
  if (user && user.isActive) {
    authenticated = await verifyPassword(password, user.passwordHash);
  } else {
    await consumeTimingEqualizer(password);
  }

  if (!user || !user.isActive || !authenticated) {
    recordLoginFailure(username, ip);
    return errorResponse("Invalid username or password", 401);
  }

  recordLoginSuccess(username, ip);

  const role = user.role === "admin" ? "admin" : "member";
  const token = await signUserToken({ userId: user.id, role });

  return NextResponse.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role,
    },
  });
}
