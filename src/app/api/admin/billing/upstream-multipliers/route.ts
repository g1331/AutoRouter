import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { createLogger } from "@/lib/utils/logger";
import { listUpstreamBillingMultipliers } from "@/lib/services/billing-management-service";
import { transformUpstreamBillingMultiplierToApi } from "@/lib/utils/api-transformers";

const log = createLogger("admin-billing-upstream-multipliers");

/**
 * GET /api/admin/billing/upstream-multipliers - List upstream multipliers.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const rows = await listUpstreamBillingMultipliers();
    return NextResponse.json({
      items: rows.map(transformUpstreamBillingMultiplierToApi),
      total: rows.length,
    });
  } catch (error) {
    log.error({ err: error }, "failed to list upstream billing multipliers");
    return errorResponse("Internal server error", 500);
  }
}
