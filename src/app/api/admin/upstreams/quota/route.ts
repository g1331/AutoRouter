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
  await quotaTracker.syncFromDb();
  const statuses = quotaTracker.getAllQuotaStatuses();

  const items = await Promise.all(
    statuses.map(async (s) => ({
      upstream_id: s.upstreamId,
      upstream_name: s.upstreamName,
      is_exceeded: s.isExceeded,
      rules: await Promise.all(
        s.rules.map(async (r) => {
          const estimatedRecoveryAt =
            r.periodType === "rolling" && r.isExceeded
              ? await quotaTracker.estimateRecoveryTime(s.upstreamId, {
                  period_type: "rolling",
                  limit: r.spendingLimit,
                  ...(r.periodHours ? { period_hours: r.periodHours } : {}),
                })
              : null;

          return {
            period_type: r.periodType,
            period_hours: r.periodHours,
            current_spending: r.currentSpending,
            spending_limit: r.spendingLimit,
            percent_used: r.percentUsed,
            is_exceeded: r.isExceeded,
            resets_at: r.resetsAt?.toISOString() ?? null,
            estimated_recovery_at: estimatedRecoveryAt?.toISOString() ?? null,
          };
        })
      ),
    }))
  );

  return NextResponse.json({ items });
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
