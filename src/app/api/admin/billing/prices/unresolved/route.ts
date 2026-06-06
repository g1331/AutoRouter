import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { createLogger } from "@/lib/utils/logger";
import { listBillingUnresolvedModels } from "@/lib/services/billing-price-service";
import { transformBillingUnresolvedModelToApi } from "@/lib/utils/api-transformers";

const log = createLogger("admin-billing-unresolved-models");

/**
 * GET /api/admin/billing/prices/unresolved - List unresolved models.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const rows = await listBillingUnresolvedModels();
    return NextResponse.json({
      items: rows.map(transformBillingUnresolvedModelToApi),
      total: rows.length,
    });
  } catch (error) {
    log.error({ err: error }, "failed to list unresolved billing models");
    return errorResponse("Internal server error", 500);
  }
}
