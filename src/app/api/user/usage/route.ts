import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireMember } from "@/lib/utils/api-auth";
import { getUserUsageStats, type UserUsageRange } from "@/lib/services/user-data-service";
import { transformUserUsageToApi } from "@/lib/utils/api-transformers";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("user-usage");

/**
 * GET /api/user/usage - Personal day-bucketed usage trend.
 *
 * Query params:
 * - range: "7d" (default) | "30d"
 */
export async function GET(request: NextRequest) {
  const auth = await requireMember(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const url = new URL(request.url);
    const rangeParam = url.searchParams.get("range");
    const range: UserUsageRange = rangeParam === "30d" ? "30d" : "7d";

    const usage = await getUserUsageStats(auth.userId, range);
    return NextResponse.json(transformUserUsageToApi(usage));
  } catch (error) {
    log.error({ err: error }, "failed to get user usage stats");
    return errorResponse("Internal server error", 500);
  }
}
