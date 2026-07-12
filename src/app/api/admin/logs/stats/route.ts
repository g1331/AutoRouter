import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { getRequestLogWindowStats } from "@/lib/services/request-logger";
import { parseRequestLogListQuery } from "@/lib/utils/request-log-filters";
import { transformRequestLogWindowStats } from "@/lib/utils/api-transformers";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-logs-stats");

/**
 * GET /api/admin/logs/stats - Window-scoped performance stats over the same
 * filter surface as GET /api/admin/logs (sort/order are accepted but ignored).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const parsed = parseRequestLogListQuery(new URL(request.url), "admin");
    if (!parsed.ok) {
      return errorResponse(parsed.error, 400);
    }

    const stats = await getRequestLogWindowStats(parsed.filters);

    return NextResponse.json(transformRequestLogWindowStats(stats));
  } catch (error) {
    log.error({ err: error }, "failed to compute request log window stats");
    return errorResponse("Internal server error", 500);
  }
}
