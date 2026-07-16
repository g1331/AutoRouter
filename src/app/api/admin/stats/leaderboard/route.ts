import { NextRequest, NextResponse } from "next/server";
import { errorResponse, getTzOffsetParam, requireAdmin } from "@/lib/utils/api-auth";
import {
  getLeaderboardStats,
  getRankings,
  LEADERBOARD_DIMENSIONS,
  LEADERBOARD_SORT_FIELDS,
  type LeaderboardDimension,
  type LeaderboardSortBy,
  type LeaderboardSortOrder,
  type TimeRange,
} from "@/lib/services/stats-service";
import {
  transformStatsLeaderboardToApi,
  transformStatsRankingsToApi,
} from "@/lib/utils/api-transformers";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-stats");

/**
 * GET /api/admin/stats/leaderboard - Get leaderboard statistics
 *
 * Query params:
 * - range: "today" | "7d" | "30d" | "custom"
 * - limit: number (default: 5, max: 50)
 * - start_date: ISO 8601 string (required when range=custom)
 * - end_date: ISO 8601 string (required when range=custom, exclusive upper bound)
 * - tz_offset: caller timezone offset in minutes east of UTC (aligns "today"
 *   to the caller's local midnight; defaults to UTC)
 * - dimension: "upstreams" | "models" | "api_keys" | "users" — when present,
 *   returns a single-dimension ranking instead of the four-dimension payload
 * - sort_by: "requests" | "tokens" | "cost" | "ttft" | "tps" | "cache_hit" | "error_rate"
 *   (single-dimension only; default "requests")
 * - order: "asc" | "desc" (single-dimension only; default "desc")
 * - compare: "true" to attach previous-period comparison (single-dimension only)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const url = new URL(request.url);
    const range = (url.searchParams.get("range") || "7d") as TimeRange;
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "5", 10)));

    let customStart: Date | undefined;
    let customEnd: Date | undefined;

    if (range === ("custom" as string)) {
      const startStr = url.searchParams.get("start_date");
      const endStr = url.searchParams.get("end_date");
      if (!startStr || !endStr) {
        return errorResponse("start_date and end_date are required for custom range", 400);
      }
      customStart = new Date(startStr);
      customEnd = new Date(endStr);
      if (isNaN(customStart.getTime()) || isNaN(customEnd.getTime())) {
        return errorResponse("Invalid date format", 400);
      }
      if (customStart >= customEnd) {
        return errorResponse("start_date must be before end_date", 400);
      }
    }

    const dimensionParam = url.searchParams.get("dimension");
    if (dimensionParam !== null) {
      if (!LEADERBOARD_DIMENSIONS.includes(dimensionParam as LeaderboardDimension)) {
        return errorResponse(
          `Invalid dimension: must be one of ${LEADERBOARD_DIMENSIONS.join(", ")}`,
          400
        );
      }
      const sortByParam = url.searchParams.get("sort_by") || "requests";
      if (!LEADERBOARD_SORT_FIELDS.includes(sortByParam as LeaderboardSortBy)) {
        return errorResponse(
          `Invalid sort_by: must be one of ${LEADERBOARD_SORT_FIELDS.join(", ")}`,
          400
        );
      }
      const orderParam = url.searchParams.get("order") || "desc";
      if (orderParam !== "asc" && orderParam !== "desc") {
        return errorResponse("Invalid order: must be asc or desc", 400);
      }

      const rankings = await getRankings({
        dimension: dimensionParam as LeaderboardDimension,
        sortBy: sortByParam as LeaderboardSortBy,
        order: orderParam as LeaderboardSortOrder,
        rangeType: range,
        limit,
        customStart,
        customEnd,
        tzOffsetMinutes: getTzOffsetParam(request),
        compare: url.searchParams.get("compare") === "true",
      });
      return NextResponse.json(transformStatsRankingsToApi(rankings));
    }

    const stats = await getLeaderboardStats(
      range,
      limit,
      customStart,
      customEnd,
      getTzOffsetParam(request)
    );
    return NextResponse.json(transformStatsLeaderboardToApi(stats));
  } catch (error) {
    log.error({ err: error }, "failed to get leaderboard stats");
    return errorResponse("Internal server error", 500);
  }
}
