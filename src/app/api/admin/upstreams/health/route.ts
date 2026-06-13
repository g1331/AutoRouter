import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { getAllHealthStatus, formatHealthStatusResponse } from "@/lib/services/health-checker";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-upstreams");

/**
 * GET /api/admin/upstreams/health - Get health status for upstreams
 *
 * Query Parameters:
 * - active_only: Optional. If "false", includes inactive upstreams. Defaults to "true".
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const url = new URL(request.url);
    const activeOnlyParam = url.searchParams.get("active_only");
    const activeOnly = activeOnlyParam !== "false"; // Default to true

    const healthStatuses = await getAllHealthStatus(activeOnly);

    // Transform to snake_case API response format
    const response = {
      data: healthStatuses.map(formatHealthStatusResponse),
      total: healthStatuses.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    log.error({ err: error }, "failed to get upstream health status");
    return errorResponse("Internal server error", 500);
  }
}
