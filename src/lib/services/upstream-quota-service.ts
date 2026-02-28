import { and, eq, gte, inArray, sum } from "drizzle-orm";
import { db, requestBillingSnapshots } from "@/lib/db";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("upstream-quota-service");

export interface UpstreamSpendingSummary {
  upstreamId: string;
  dailySpendingUsd: number;
  monthlySpendingUsd: number;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  dailyLimitExceeded: boolean;
  monthlyLimitExceeded: boolean;
  quotaExceeded: boolean;
}

function toStartOfTodayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function toStartOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function asUsdAmount(input: unknown): number {
  if (input === null || input === undefined) return 0;
  const value = Number(input);
  return Number.isNaN(value) ? 0 : Number(value.toFixed(8));
}

/**
 * Get current-period spending for a single upstream.
 */
export async function getUpstreamSpending(
  upstreamId: string
): Promise<{ dailySpendingUsd: number; monthlySpendingUsd: number }> {
  const now = new Date();
  const startOfToday = toStartOfTodayUtc(now);
  const startOfMonth = toStartOfMonthUtc(now);

  const [dailyRow, monthlyRow] = await Promise.all([
    db
      .select({ total: sum(requestBillingSnapshots.finalCost) })
      .from(requestBillingSnapshots)
      .where(
        and(
          eq(requestBillingSnapshots.upstreamId, upstreamId),
          eq(requestBillingSnapshots.billingStatus, "billed"),
          gte(requestBillingSnapshots.billedAt, startOfToday)
        )
      ),
    db
      .select({ total: sum(requestBillingSnapshots.finalCost) })
      .from(requestBillingSnapshots)
      .where(
        and(
          eq(requestBillingSnapshots.upstreamId, upstreamId),
          eq(requestBillingSnapshots.billingStatus, "billed"),
          gte(requestBillingSnapshots.billedAt, startOfMonth)
        )
      ),
  ]);

  return {
    dailySpendingUsd: asUsdAmount(dailyRow[0]?.total),
    monthlySpendingUsd: asUsdAmount(monthlyRow[0]?.total),
  };
}

/**
 * Check whether an upstream has exceeded its spending quota.
 * Returns true if either daily or monthly limit is exceeded.
 */
export async function isUpstreamQuotaExceeded(
  upstreamId: string,
  dailyLimit: number | null,
  monthlyLimit: number | null
): Promise<boolean> {
  if (dailyLimit === null && monthlyLimit === null) return false;

  const { dailySpendingUsd, monthlySpendingUsd } = await getUpstreamSpending(upstreamId);

  if (dailyLimit !== null && dailySpendingUsd >= dailyLimit) return true;
  if (monthlyLimit !== null && monthlySpendingUsd >= monthlyLimit) return true;

  return false;
}

/**
 * Get spending summary and quota status for a batch of upstreams.
 * Upstream objects must include dailySpendingLimit and monthlySpendingLimit fields.
 */
export async function getBatchUpstreamQuotaStatus(
  upstreamList: Array<{
    id: string;
    dailySpendingLimit: number | null;
    monthlySpendingLimit: number | null;
  }>
): Promise<Map<string, UpstreamSpendingSummary>> {
  const result = new Map<string, UpstreamSpendingSummary>();
  if (upstreamList.length === 0) return result;

  const now = new Date();
  const startOfToday = toStartOfTodayUtc(now);
  const startOfMonth = toStartOfMonthUtc(now);

  const ids = upstreamList.map((u) => u.id);

  const [dailyRows, monthlyRows] = await Promise.all([
    db
      .select({
        upstreamId: requestBillingSnapshots.upstreamId,
        total: sum(requestBillingSnapshots.finalCost),
      })
      .from(requestBillingSnapshots)
      .where(
        and(
          inArray(requestBillingSnapshots.upstreamId, ids),
          eq(requestBillingSnapshots.billingStatus, "billed"),
          gte(requestBillingSnapshots.billedAt, startOfToday)
        )
      )
      .groupBy(requestBillingSnapshots.upstreamId),
    db
      .select({
        upstreamId: requestBillingSnapshots.upstreamId,
        total: sum(requestBillingSnapshots.finalCost),
      })
      .from(requestBillingSnapshots)
      .where(
        and(
          inArray(requestBillingSnapshots.upstreamId, ids),
          eq(requestBillingSnapshots.billingStatus, "billed"),
          gte(requestBillingSnapshots.billedAt, startOfMonth)
        )
      )
      .groupBy(requestBillingSnapshots.upstreamId),
  ]);

  const dailyMap = new Map(
    dailyRows.map((r) => [r.upstreamId as string, asUsdAmount(r.total)])
  );
  const monthlyMap = new Map(
    monthlyRows.map((r) => [r.upstreamId as string, asUsdAmount(r.total)])
  );

  for (const u of upstreamList) {
    const dailySpendingUsd = dailyMap.get(u.id) ?? 0;
    const monthlySpendingUsd = monthlyMap.get(u.id) ?? 0;
    const dailyLimitExceeded = u.dailySpendingLimit !== null && dailySpendingUsd >= u.dailySpendingLimit;
    const monthlyLimitExceeded = u.monthlySpendingLimit !== null && monthlySpendingUsd >= u.monthlySpendingLimit;

    result.set(u.id, {
      upstreamId: u.id,
      dailySpendingUsd,
      monthlySpendingUsd,
      dailyLimit: u.dailySpendingLimit,
      monthlyLimit: u.monthlySpendingLimit,
      dailyLimitExceeded,
      monthlyLimitExceeded,
      quotaExceeded: dailyLimitExceeded || monthlyLimitExceeded,
    });
  }

  return result;
}

/**
 * Filter out upstream IDs that have exceeded their spending quota.
 * Returns IDs of upstreams that should be excluded from routing.
 */
export async function getQuotaExceededUpstreamIds(
  upstreamList: Array<{
    id: string;
    dailySpendingLimit: number | null;
    monthlySpendingLimit: number | null;
  }>
): Promise<string[]> {
  // Only check upstreams that have at least one limit configured
  const limited = upstreamList.filter(
    (u) => u.dailySpendingLimit !== null || u.monthlySpendingLimit !== null
  );
  if (limited.length === 0) return [];

  try {
    const statusMap = await getBatchUpstreamQuotaStatus(limited);
    const exceeded: string[] = [];
    for (const [id, status] of statusMap) {
      if (status.quotaExceeded) exceeded.push(id);
    }
    return exceeded;
  } catch (err) {
    // Quota check must not block routing; log and return empty
    log.error({ err }, "quota check failed, allowing all upstreams");
    return [];
  }
}
