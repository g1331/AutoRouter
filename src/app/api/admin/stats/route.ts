import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  getOverviewStats,
  getTimeseriesStats,
  getLeaderboardStats,
  type TimeRange,
} from "@/lib/services/stats-service";

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
      return NextResponse.json({
        today_requests: stats.todayRequests,
        avg_response_time_ms: stats.avgResponseTimeMs,
        total_tokens_today: stats.totalTokensToday,
        success_rate_today: stats.successRateToday,
      });
    } else if (type === "timeseries") {
      const stats = await getTimeseriesStats(range);
      return NextResponse.json({
        range: stats.range,
        granularity: stats.granularity,
        series: stats.series.map((s) => ({
          upstream_id: s.upstreamId,
          upstream_name: s.upstreamName,
          data: s.data.map((d) => ({
            timestamp: d.timestamp.toISOString(),
            request_count: d.requestCount,
            total_tokens: d.totalTokens,
            avg_duration_ms: d.avgDurationMs,
          })),
        })),
      });
    } else if (type === "leaderboard") {
      const stats = await getLeaderboardStats(range, limit);
      return NextResponse.json({
        range: stats.range,
        api_keys: stats.apiKeys.map((k) => ({
          id: k.id,
          name: k.name,
          key_prefix: k.keyPrefix,
          request_count: k.requestCount,
          total_tokens: k.totalTokens,
        })),
        upstreams: stats.upstreams.map((u) => ({
          id: u.id,
          name: u.name,
          provider: u.provider,
          request_count: u.requestCount,
          total_tokens: u.totalTokens,
        })),
        models: stats.models.map((m) => ({
          model: m.model,
          request_count: m.requestCount,
          total_tokens: m.totalTokens,
        })),
      });
    }

    return errorResponse("Invalid type parameter", 400);
  } catch (error) {
    console.error("Failed to get stats:", error);
    return errorResponse("Internal server error", 500);
  }
}
