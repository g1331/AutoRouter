import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { createLogger } from "@/lib/utils/logger";
import { getBillingOverviewStats } from "@/lib/services/billing-management-service";
import { transformBillingOverviewToApi } from "@/lib/utils/api-transformers";

const log = createLogger("admin-billing-overview");

/**
 * GET /api/admin/billing/overview - Billing overview cards.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const overview = await getBillingOverviewStats();
    return NextResponse.json(transformBillingOverviewToApi(overview));
  } catch (error) {
    log.error({ err: error }, "failed to get billing overview");
    return errorResponse("Internal server error", 500);
  }
}
