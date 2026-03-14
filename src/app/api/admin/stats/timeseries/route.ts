import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  getTimeseriesStats,
  type TimeRange,
  type TimeseriesMetric,
} from "@/lib/services/stats-service";
import { transformStatsTimeseriesToApi } from "@/lib/utils/api-transformers";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-stats");

/**
 * GET /api/admin/stats/timeseries - Get timeseries statistics
 *
 * Query params:
 * - range: "today" | "7d" | "30d" | "custom"
 * - metric: "requests" | "ttft" | "tps" | "tokens" | "duration" | "cost"
 * - start_date: ISO date string (only for range=custom)
 * - end_date: ISO date string (only for range=custom)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const url = new URL(request.url);
    const rangeParam = url.searchParams.get("range") || "7d";
    const range = rangeParam as TimeRange | "custom";
    const metric = (url.searchParams.get("metric") || "requests") as TimeseriesMetric;

    let customStart: Date | undefined;
    let customEnd: Date | undefined;

    if (range === "custom") {
      const startParam = url.searchParams.get("start_date");
      const endParam = url.searchParams.get("end_date");
      if (!startParam || !endParam) {
        return errorResponse("start_date and end_date are required for custom range", 400);
      }
      customStart = new Date(startParam);
      customEnd = new Date(endParam);
      if (isNaN(customStart.getTime()) || isNaN(customEnd.getTime())) {
        return errorResponse("Invalid date format", 400);
      }
      if (customStart >= customEnd) {
        return errorResponse("start_date must be before end_date", 400);
      }
    }

    const stats = await getTimeseriesStats(range, metric, customStart, customEnd);
    return NextResponse.json(transformStatsTimeseriesToApi(stats));
  } catch (error) {
    log.error({ err: error }, "failed to get timeseries stats");
    return errorResponse("Internal server error", 500);
  }
}
