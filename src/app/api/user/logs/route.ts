import { NextRequest, NextResponse } from "next/server";
import { getPaginationParams, errorResponse, requireMember } from "@/lib/utils/api-auth";
import { listUserRequestLogs } from "@/lib/services/user-data-service";
import { parseRequestLogListQuery } from "@/lib/utils/request-log-filters";
import {
  scrubUpstreamIdentityFromLog,
  transformPaginatedRequestLogs,
} from "@/lib/utils/api-transformers";
import { getPortalSettings } from "@/lib/services/portal-settings-service";
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
 * - status_class: "2xx" | "4xx" | "5xx" (filter - status code range, ignored when status_code is set)
 * - model: string (filter - case-insensitive substring match)
 * - start_time / end_time: ISO datetime (filter)
 * - ttft_min_ms / duration_min_ms / tps_max: performance threshold filters
 * - sort / order: sorting, same surface as the admin logs endpoint
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
    const parsed = parseRequestLogListQuery(new URL(request.url), "user");
    if (!parsed.ok) {
      return errorResponse(parsed.error, 400);
    }

    const [result, { exposeUpstreams }] = await Promise.all([
      listUserRequestLogs(auth.userId, page, pageSize, parsed.filters, parsed.sort),
      getPortalSettings(),
    ]);

    const payload = transformPaginatedRequestLogs(result);
    return NextResponse.json(
      exposeUpstreams
        ? payload
        : { ...payload, items: payload.items.map(scrubUpstreamIdentityFromLog) }
    );
  } catch (error) {
    log.error({ err: error }, "failed to list user request logs");
    return errorResponse("Internal server error", 500);
  }
}
