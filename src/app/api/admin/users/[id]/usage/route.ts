import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { getUserUsageStats, type UserUsageRange } from "@/lib/services/user-data-service";
import { getUserById } from "@/lib/services/user-service";
import { transformUserUsageToApi } from "@/lib/utils/api-transformers";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-user-usage");

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/users/[id]/usage - Day-bucketed usage trend for a target user.
 *
 * Admin counterpart to the member-side /api/user/usage: same per-user trend
 * aggregation, but the target userId comes from the route rather than the
 * authenticated principal. Guarded by requireAdmin.
 *
 * Query params:
 * - range: "7d" (default) | "30d"
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { id } = await context.params;

    const user = await getUserById(id);
    if (!user) {
      return errorResponse("User not found", 404);
    }

    const url = new URL(request.url);
    const rangeParam = url.searchParams.get("range");
    const range: UserUsageRange = rangeParam === "30d" ? "30d" : "7d";

    const usage = await getUserUsageStats(id, range);
    return NextResponse.json(transformUserUsageToApi(usage));
  } catch (error) {
    log.error({ err: error }, "failed to get admin user usage stats");
    return errorResponse("Internal server error", 500);
  }
}
