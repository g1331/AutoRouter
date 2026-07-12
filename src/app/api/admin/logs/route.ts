import { NextRequest, NextResponse } from "next/server";
import { getPaginationParams, errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { listRequestLogs } from "@/lib/services/request-logger";
import { parseRequestLogListQuery } from "@/lib/utils/request-log-filters";
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
 * - user_id: string (filter - owner of the request via the user_id snapshot)
 * - upstream_id: string (filter)
 * - status_code: number (filter)
 * - status_class: "2xx" | "4xx" | "5xx" (filter - status code range, ignored when status_code is set)
 * - model: string (filter - case-insensitive substring match)
 * - start_time: ISO datetime (filter)
 * - end_time: ISO datetime (filter)
 * - ttft_min_ms: number (filter - TTFT strictly greater than)
 * - duration_min_ms: number (filter - duration strictly greater than)
 * - tps_max: number (filter - TPS strictly below, with minimum-signal guards)
 * - sort: "created_at" | "duration_ms" | "total_tokens" | "ttft_ms" | "cost"
 * - order: "asc" | "desc" (default "desc"; only honored together with sort)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { page, pageSize } = getPaginationParams(request);
    const parsed = parseRequestLogListQuery(new URL(request.url), "admin");
    if (!parsed.ok) {
      return errorResponse(parsed.error, 400);
    }

    const result = await listRequestLogs(page, pageSize, parsed.filters, parsed.sort);

    return NextResponse.json(transformPaginatedRequestLogs(result));
  } catch (error) {
    log.error({ err: error }, "failed to list request logs");
    return errorResponse("Internal server error", 500);
  }
}
