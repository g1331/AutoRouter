import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { quotaTracker } from "@/lib/services/upstream-quota-tracker";

/**
 * GET /api/admin/upstreams/quota - Get spending quota status for all upstreams
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  await quotaTracker.initialize();
  const statuses = quotaTracker.getAllQuotaStatuses();

  return NextResponse.json({
    items: statuses.map((s) => ({
      upstream_id: s.upstreamId,
      upstream_name: s.upstreamName,
      current_spending: s.currentSpending,
      spending_limit: s.spendingLimit,
      spending_period_type: s.spendingPeriodType,
      spending_period_hours: s.spendingPeriodHours,
      percent_used: s.percentUsed,
      is_exceeded: s.isExceeded,
      resets_at: s.resetsAt?.toISOString() ?? null,
    })),
  });
}

/**
 * POST /api/admin/upstreams/quota - Force sync quota data from database
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  await quotaTracker.syncFromDb();

  return NextResponse.json({ synced: true });
}
