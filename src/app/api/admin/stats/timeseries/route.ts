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
 * - range: "today" | "7d" | "30d"
 * - metric: "requests" | "ttft" | "tps"
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const url = new URL(request.url);
    const range = (url.searchParams.get("range") || "7d") as TimeRange;
    const metric = (url.searchParams.get("metric") || "requests") as TimeseriesMetric;

    const stats = await getTimeseriesStats(range, metric);
    return NextResponse.json(transformStatsTimeseriesToApi(stats));
  } catch (error) {
    log.error({ err: error }, "failed to get timeseries stats");
    return errorResponse("Internal server error", 500);
  }
}
