import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { createLogger } from "@/lib/utils/logger";
import { getBillingOverviewStats } from "@/lib/services/billing-management-service";
import { transformBillingOverviewToApi } from "@/lib/utils/api-transformers";

const log = createLogger("admin-billing-overview");

/**
 * GET /api/admin/billing/overview - Billing overview cards.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const overview = await getBillingOverviewStats();
    return NextResponse.json(transformBillingOverviewToApi(overview));
  } catch (error) {
    log.error({ err: error }, "failed to get billing overview");
    return errorResponse("Internal server error", 500);
  }
}
