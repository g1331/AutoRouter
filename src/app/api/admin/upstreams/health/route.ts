import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { getAllHealthStatus, formatHealthStatusResponse } from "@/lib/services/health-checker";

/**
 * GET /api/admin/upstreams/health - Get health status for upstreams
 *
 * Query Parameters:
 * - active_only: Optional. If "false", includes inactive upstreams. Defaults to "true".
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
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
    console.error("Failed to get upstream health status:", error);
    return errorResponse("Internal server error", 500);
  }
}
