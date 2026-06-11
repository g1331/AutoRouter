import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import {
  getOverviewStats,
  getTimeseriesStats,
  getLeaderboardStats,
  type TimeRange,
  type TimeseriesMetric,
} from "@/lib/services/stats-service";
import {
  transformStatsOverviewToApi,
  transformStatsTimeseriesToApi,
  transformStatsLeaderboardToApi,
} from "@/lib/utils/api-transformers";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-stats");

/**
 * GET /api/admin/stats - Get dashboard statistics
 *
 * Query params:
 * - type: "overview" | "timeseries" | "leaderboard"
 * - range: "today" | "7d" | "30d"
 * - limit: number (for leaderboard)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type") || "overview";
    const range = (url.searchParams.get("range") || "7d") as TimeRange;
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "5", 10)));
    const metric = (url.searchParams.get("metric") || "requests") as TimeseriesMetric;

    if (type === "overview") {
      const stats = await getOverviewStats();
      return NextResponse.json(transformStatsOverviewToApi(stats));
    } else if (type === "timeseries") {
      const stats = await getTimeseriesStats(range, metric);
      return NextResponse.json(transformStatsTimeseriesToApi(stats));
    } else if (type === "leaderboard") {
      const stats = await getLeaderboardStats(range, limit);
      return NextResponse.json(transformStatsLeaderboardToApi(stats));
    }

    return errorResponse("Invalid type parameter", 400);
  } catch (error) {
    log.error({ err: error }, "failed to get stats");
    return errorResponse("Internal server error", 500);
  }
}
