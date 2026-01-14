import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { getPaginationParams, errorResponse } from "@/lib/utils/api-auth";
import { listRequestLogs, type ListRequestLogsFilter } from "@/lib/services/request-logger";
import { transformPaginatedRequestLogs } from "@/lib/utils/api-transformers";

/**
 * GET /api/admin/logs - List request logs
 *
 * Query params:
 * - page: number
 * - page_size: number
 * - api_key_id: string (filter)
 * - upstream_id: string (filter)
 * - status_code: number (filter)
 * - start_time: ISO datetime (filter)
 * - end_time: ISO datetime (filter)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { page, pageSize } = getPaginationParams(request);
    const url = new URL(request.url);

    const filters: ListRequestLogsFilter = {};

    const apiKeyId = url.searchParams.get("api_key_id");
    if (apiKeyId) filters.apiKeyId = apiKeyId;

    const upstreamId = url.searchParams.get("upstream_id");
    if (upstreamId) filters.upstreamId = upstreamId;

    const statusCode = url.searchParams.get("status_code");
    if (statusCode) filters.statusCode = parseInt(statusCode, 10);

    const startTime = url.searchParams.get("start_time");
    if (startTime) filters.startTime = new Date(startTime);

    const endTime = url.searchParams.get("end_time");
    if (endTime) filters.endTime = new Date(endTime);

    const result = await listRequestLogs(page, pageSize, filters);

    return NextResponse.json(transformPaginatedRequestLogs(result));
  } catch (error) {
    console.error("Failed to list request logs:", error);
    return errorResponse("Internal server error", 500);
  }
}
