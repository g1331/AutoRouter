import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { getOverviewStats } from "@/lib/services/stats-service";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-stats");

/**
 * GET /api/admin/stats/overview - Get overview statistics
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const stats = await getOverviewStats();
    return NextResponse.json({
      today_requests: stats.todayRequests,
      avg_response_time_ms: stats.avgResponseTimeMs,
      total_tokens_today: stats.totalTokensToday,
      success_rate_today: stats.successRateToday,
    });
  } catch (error) {
    log.error({ err: error }, "failed to get overview stats");
    return errorResponse("Internal server error", 500);
  }
}
