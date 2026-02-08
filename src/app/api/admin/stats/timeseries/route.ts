import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { getTimeseriesStats, type TimeRange } from "@/lib/services/stats-service";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-stats");

/**
 * GET /api/admin/stats/timeseries - Get timeseries statistics
 *
 * Query params:
 * - range: "today" | "7d" | "30d"
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const url = new URL(request.url);
    const range = (url.searchParams.get("range") || "7d") as TimeRange;

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
  } catch (error) {
    log.error({ err: error }, "failed to get timeseries stats");
    return errorResponse("Internal server error", 500);
  }
}
