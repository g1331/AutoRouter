import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { errorResponse, requireUser } from "@/lib/utils/api-auth";

/**
 * GET /api/auth/me — return the current principal's profile.
 *
 * Reuses `requireUser` so JWT verification, the revocation/active-state check,
 * and unauthorized handling stay in one place. The ADMIN_TOKEN super-admin has
 * no user record and is reported as `{ kind: "admin_token", role: "admin" }`.
 * For a user principal the display name is loaded from the database (it is not
 * carried in the auth principal), and the profile is returned without exposing
 * the JWT payload to the frontend.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const principal = await requireUser(request);
  if (principal instanceof NextResponse) {
    return principal;
  }

  if (principal.kind === "admin_token") {
    return NextResponse.json({ kind: "admin_token", role: "admin" });
  }

  const rows = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, principal.userId))
    .limit(1);

  const displayName = rows[0]?.displayName;
  if (displayName === undefined) {
    return errorResponse("User not found", 404);
  }

  return NextResponse.json({
    kind: "user",
    id: principal.userId,
    username: principal.username,
    displayName,
    role: principal.role,
  });
}
