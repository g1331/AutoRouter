import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { createLogger } from "@/lib/utils/logger";
import { syncBillingModelPrices } from "@/lib/services/billing-price-service";
import { transformBillingSyncToApi } from "@/lib/utils/api-transformers";

const log = createLogger("admin-billing-price-sync");

/**
 * POST /api/admin/billing/prices/sync - Trigger model price synchronization.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const result = await syncBillingModelPrices();
    return NextResponse.json(transformBillingSyncToApi(result));
  } catch (error) {
    log.error({ err: error }, "failed to sync billing prices");
    return errorResponse("Internal server error", 500);
  }
}
