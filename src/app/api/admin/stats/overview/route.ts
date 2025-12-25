import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { getOverviewStats } from "@/lib/services/stats-service";

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
    console.error("Failed to get overview stats:", error);
    return errorResponse("Internal server error", 500);
  }
}
