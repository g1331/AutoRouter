import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireMember } from "@/lib/utils/api-auth";
import { getUserRequestLogWindowStats } from "@/lib/services/user-data-service";
import { parseRequestLogListQuery } from "@/lib/utils/request-log-filters";
import { transformRequestLogWindowStats } from "@/lib/utils/api-transformers";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("user-logs-stats");

/**
 * GET /api/user/logs/stats - Personal window-scoped performance stats,
 * force-scoped to the authenticated user like GET /api/user/logs.
 */
export async function GET(request: NextRequest) {
  const auth = await requireMember(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const parsed = parseRequestLogListQuery(new URL(request.url), "user");
    if (!parsed.ok) {
      return errorResponse(parsed.error, 400);
    }

    const stats = await getUserRequestLogWindowStats(auth.userId, parsed.filters);

    return NextResponse.json(transformRequestLogWindowStats(stats));
  } catch (error) {
    log.error({ err: error }, "failed to compute user request log window stats");
    return errorResponse("Internal server error", 500);
  }
}
