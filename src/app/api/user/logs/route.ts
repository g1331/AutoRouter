import { NextRequest, NextResponse } from "next/server";
import { getPaginationParams, errorResponse, requireMember } from "@/lib/utils/api-auth";
import { listUserRequestLogs } from "@/lib/services/user-data-service";
import type { ListRequestLogsFilter } from "@/lib/services/request-logger";
import { transformPaginatedRequestLogs } from "@/lib/utils/api-transformers";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("user-logs");

/**
 * GET /api/user/logs - Personal request logs over the same fact table the
 * admin log view uses, force-scoped to the authenticated user.
 *
 * Query params:
 * - page / page_size: pagination
 * - id: string (filter - exact log id)
 * - api_key_id: string (filter; AND semantics, cannot widen beyond the owner)
 * - status_code: number (filter)
 * - start_time / end_time: ISO datetime (filter)
 *
 * A user_id parameter is intentionally not accepted: the owner scope always
 * comes from the authenticated principal (decision 7).
 */
export async function GET(request: NextRequest) {
  const auth = await requireMember(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { page, pageSize } = getPaginationParams(request);
    const url = new URL(request.url);

    const filters: Omit<ListRequestLogsFilter, "userId"> = {};

    const id = url.searchParams.get("id");
    if (id) filters.id = id;

    const apiKeyId = url.searchParams.get("api_key_id");
    if (apiKeyId) filters.apiKeyId = apiKeyId;

    const statusCode = url.searchParams.get("status_code");
    if (statusCode) filters.statusCode = parseInt(statusCode, 10);

    const startTime = url.searchParams.get("start_time");
    if (startTime) filters.startTime = new Date(startTime);

    const endTime = url.searchParams.get("end_time");
    if (endTime) filters.endTime = new Date(endTime);

    const result = await listUserRequestLogs(auth.userId, page, pageSize, filters);

    return NextResponse.json(transformPaginatedRequestLogs(result));
  } catch (error) {
    log.error({ err: error }, "failed to list user request logs");
    return errorResponse("Internal server error", 500);
  }
}
