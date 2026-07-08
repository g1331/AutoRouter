import { NextRequest, NextResponse } from "next/server";
import { errorResponse, getTzOffsetParam, requireAdmin } from "@/lib/utils/api-auth";
import { getOverviewStats } from "@/lib/services/stats-service";
import { transformStatsOverviewToApi } from "@/lib/utils/api-transformers";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-stats");

/**
 * GET /api/admin/stats/overview - Get overview statistics
 *
 * Query params:
 * - tz_offset: caller timezone offset in minutes east of UTC (aligns the
 *   today/yesterday split to the caller's local midnight; defaults to UTC)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const stats = await getOverviewStats(getTzOffsetParam(request));
    return NextResponse.json(transformStatsOverviewToApi(stats));
  } catch (error) {
    log.error({ err: error }, "failed to get overview stats");
    return errorResponse("Internal server error", 500);
  }
}
