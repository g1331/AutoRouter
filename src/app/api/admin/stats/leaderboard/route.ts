import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { getLeaderboardStats, type TimeRange } from "@/lib/services/stats-service";
import { transformStatsLeaderboardToApi } from "@/lib/utils/api-transformers";
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
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
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

    const stats = await getLeaderboardStats(range, limit, customStart, customEnd);
    return NextResponse.json(transformStatsLeaderboardToApi(stats));
  } catch (error) {
    log.error({ err: error }, "failed to get leaderboard stats");
    return errorResponse("Internal server error", 500);
  }
}
