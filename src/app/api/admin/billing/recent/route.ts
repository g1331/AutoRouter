import { NextRequest, NextResponse } from "next/server";
import { getPaginationParams, errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { createLogger } from "@/lib/utils/logger";
import { listRecentBillingDetails } from "@/lib/services/billing-management-service";
import { transformPaginatedRecentBillingDetails } from "@/lib/utils/api-transformers";

const log = createLogger("admin-billing-recent");

/**
 * GET /api/admin/billing/recent - Paginated recent billing details.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { page, pageSize } = getPaginationParams(request);
    const result = await listRecentBillingDetails(page, pageSize);
    return NextResponse.json(transformPaginatedRecentBillingDetails(result));
  } catch (error) {
    log.error({ err: error }, "failed to list recent billing details");
    return errorResponse("Internal server error", 500);
  }
}
