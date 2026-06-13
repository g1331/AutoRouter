import { NextRequest, NextResponse } from "next/server";
import {
  getPaginationParams,
  errorResponse,
  requireAdmin,
  parseIntFilterParam,
  parseDateFilterParam,
} from "@/lib/utils/api-auth";
import { listRequestLogs, type ListRequestLogsFilter } from "@/lib/services/request-logger";
import { transformPaginatedRequestLogs } from "@/lib/utils/api-transformers";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-logs");

/**
 * GET /api/admin/logs - List request logs
 *
 * Query params:
 * - page: number
 * - page_size: number
 * - id: string (filter - exact log id, used by /logs?focus=<id>)
 * - api_key_id: string (filter)
 * - upstream_id: string (filter)
 * - status_code: number (filter)
 * - start_time: ISO datetime (filter)
 * - end_time: ISO datetime (filter)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { page, pageSize } = getPaginationParams(request);
    const url = new URL(request.url);

    const filters: ListRequestLogsFilter = {};

    const id = url.searchParams.get("id");
    if (id) filters.id = id;

    const apiKeyId = url.searchParams.get("api_key_id");
    if (apiKeyId) filters.apiKeyId = apiKeyId;

    const upstreamId = url.searchParams.get("upstream_id");
    if (upstreamId) filters.upstreamId = upstreamId;

    const statusCode = parseIntFilterParam(url.searchParams.get("status_code"));
    if (statusCode === null) return errorResponse("Invalid status_code", 400);
    if (statusCode !== undefined) filters.statusCode = statusCode;

    const startTime = parseDateFilterParam(url.searchParams.get("start_time"));
    if (startTime === null) return errorResponse("Invalid start_time", 400);
    if (startTime !== undefined) filters.startTime = startTime;

    const endTime = parseDateFilterParam(url.searchParams.get("end_time"));
    if (endTime === null) return errorResponse("Invalid end_time", 400);
    if (endTime !== undefined) filters.endTime = endTime;

    const result = await listRequestLogs(page, pageSize, filters);

    return NextResponse.json(transformPaginatedRequestLogs(result));
  } catch (error) {
    log.error({ err: error }, "failed to list request logs");
    return errorResponse("Internal server error", 500);
  }
}
