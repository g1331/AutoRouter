import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  getOverviewStats,
  getTimeseriesStats,
  getLeaderboardStats,
  type TimeRange,
} from "@/lib/services/stats-service";
import {
  transformStatsOverviewToApi,
  transformStatsTimeseriesToApi,
  transformStatsLeaderboardToApi,
} from "@/lib/utils/api-transformers";

/**
 * GET /api/admin/stats - Get dashboard statistics
 *
 * Query params:
 * - type: "overview" | "timeseries" | "leaderboard"
 * - range: "today" | "7d" | "30d"
 * - limit: number (for leaderboard)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type") || "overview";
    const range = (url.searchParams.get("range") || "7d") as TimeRange;
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "5", 10)));

    if (type === "overview") {
      const stats = await getOverviewStats();
      return NextResponse.json(transformStatsOverviewToApi(stats));
    } else if (type === "timeseries") {
      const stats = await getTimeseriesStats(range);
      return NextResponse.json(transformStatsTimeseriesToApi(stats));
    } else if (type === "leaderboard") {
      const stats = await getLeaderboardStats(range, limit);
      return NextResponse.json(transformStatsLeaderboardToApi(stats));
    }

    return errorResponse("Invalid type parameter", 400);
  } catch (error) {
    console.error("Failed to get stats:", error);
    return errorResponse("Internal server error", 500);
  }
}
