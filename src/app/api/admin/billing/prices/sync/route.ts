import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { createLogger } from "@/lib/utils/logger";
import {
  getLatestBillingSyncStatus,
  type BillingSyncSummary,
} from "@/lib/services/billing-price-service";
import { getBackgroundSyncScheduler } from "@/lib/services/background-sync";
import { BILLING_PRICE_CATALOG_SYNC_TASK_NAME } from "@/lib/services/billing-price-background-sync";
import type { BackgroundSyncExecuteResult } from "@/lib/services/background-sync-types";
import { transformBillingSyncToApi } from "@/lib/utils/api-transformers";

const log = createLogger("admin-billing-price-sync");

function toBillingSyncSummary(
  result: BackgroundSyncExecuteResult,
  latestSync: BillingSyncSummary | null
): BillingSyncSummary {
  if (latestSync && result.startedAt && latestSync.syncedAt >= result.startedAt) {
    return latestSync;
  }

  return {
    status:
      result.status === "partial" ? "partial" : result.status === "success" ? "success" : "failed",
    source: result.status === "success" || result.status === "partial" ? "litellm" : null,
    successCount: result.successCount,
    failureCount: result.failureCount,
    failureReason: result.errorSummary,
    syncedAt: result.finishedAt ?? new Date(),
  };
}

/**
 * POST /api/admin/billing/prices/sync - Trigger model price synchronization.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const result = await getBackgroundSyncScheduler().executeNow(
      BILLING_PRICE_CATALOG_SYNC_TASK_NAME
    );
    if (result.status === "running") {
      return errorResponse("Billing price sync is already running", 409);
    }

    const latestSync = await getLatestBillingSyncStatus();
    return NextResponse.json(transformBillingSyncToApi(toBillingSyncSummary(result, latestSync)));
  } catch (error) {
    log.error({ err: error }, "failed to sync billing prices");
    return errorResponse("Internal server error", 500);
  }
}
