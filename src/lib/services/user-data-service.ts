import { and, asc, count, eq, gte, sql } from "drizzle-orm";
import { db, apiKeys, requestLogs, requestBillingSnapshots, upstreams, userUpstreams } from "../db";
import {
  listRequestLogs,
  reconcileStaleInProgressRequestLogs,
  type ListRequestLogsFilter,
  type PaginatedRequestLogs,
} from "./request-logger";
import { buildTimeBucketExpr, parseTimeBucket } from "./stats-service";

// User-side personal data service (decision 7): every query is scoped to the
// caller's userId over the redundant user_id snapshot columns on the fact
// tables, so attribution survives key deletion and user deactivation. The
// userId always comes from the authenticated principal, never from request
// parameters.

export type UserUsageRange = "7d" | "30d";

export interface UserOverview {
  todayRequests: number;
  monthRequests: number;
  monthCostUsd: number;
  totalRequests: number;
  totalCostUsd: number;
  activeKeyCount: number;
  totalKeyCount: number;
}

export interface UserUpstreamOption {
  id: string;
  name: string;
}

export interface UserUsagePoint {
  timestamp: Date;
  requestCount: number;
  totalTokens: number;
  totalCostUsd: number;
}

export interface UserUsageStats {
  range: UserUsageRange;
  granularity: "day";
  points: UserUsagePoint[];
}

const billedCostExpr = sql<
  string | null
>`sum(case when ${requestBillingSnapshots.billingStatus} = 'billed' then ${requestBillingSnapshots.finalCost} else 0 end)`;

function parseCost(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(6)) : 0;
}

/**
 * Personal overview aggregates for the portal landing page. Cost follows the
 * same billed-snapshot join window as the admin overview (anchored on
 * request_logs.created_at) so both views share one accounting basis.
 */
export async function getUserOverview(userId: string): Promise<UserOverview> {
  if (process.env.NODE_ENV !== "test") {
    await reconcileStaleInProgressRequestLogs().catch(() => undefined);
  }

  const now = new Date();
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const aggregateFields = {
    requests: count(requestLogs.id),
    cost: billedCostExpr,
  };
  const ownedLogsCondition = eq(requestLogs.userId, userId);

  const [todayRows, monthRows, totalRows, keyRows] = await Promise.all([
    db
      .select(aggregateFields)
      .from(requestLogs)
      .leftJoin(requestBillingSnapshots, eq(requestLogs.id, requestBillingSnapshots.requestLogId))
      .where(and(ownedLogsCondition, gte(requestLogs.createdAt, startOfToday))),
    db
      .select(aggregateFields)
      .from(requestLogs)
      .leftJoin(requestBillingSnapshots, eq(requestLogs.id, requestBillingSnapshots.requestLogId))
      .where(and(ownedLogsCondition, gte(requestLogs.createdAt, startOfMonth))),
    db
      .select(aggregateFields)
      .from(requestLogs)
      .leftJoin(requestBillingSnapshots, eq(requestLogs.id, requestBillingSnapshots.requestLogId))
      .where(ownedLogsCondition),
    db
      .select({
        total: count(apiKeys.id),
        active: count(sql`case when ${apiKeys.isActive} then 1 end`),
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId)),
  ]);

  return {
    todayRequests: todayRows[0]?.requests ?? 0,
    monthRequests: monthRows[0]?.requests ?? 0,
    monthCostUsd: parseCost(monthRows[0]?.cost),
    totalRequests: totalRows[0]?.requests ?? 0,
    totalCostUsd: parseCost(totalRows[0]?.cost),
    activeKeyCount: keyRows[0]?.active ?? 0,
    totalKeyCount: keyRows[0]?.total ?? 0,
  };
}

/**
 * Upstreams the caller may authorize on self-service keys: the user's
 * user_upstreams grant set, exposed as id + display name only so no upstream
 * configuration (base URL, key material) leaks to members.
 */
export async function listUserUpstreamOptions(userId: string): Promise<UserUpstreamOption[]> {
  return db
    .select({ id: upstreams.id, name: upstreams.name })
    .from(userUpstreams)
    .innerJoin(upstreams, eq(userUpstreams.upstreamId, upstreams.id))
    .where(eq(userUpstreams.userId, userId))
    .orderBy(asc(upstreams.name));
}

/**
 * Personal request logs: a thin wrapper over the shared fact-table listing
 * that force-injects the owner filter. Additional filters keep AND semantics,
 * so even a foreign api_key_id can never widen the result beyond the caller.
 */
export async function listUserRequestLogs(
  userId: string,
  page: number = 1,
  pageSize: number = 20,
  filters: Omit<ListRequestLogsFilter, "userId"> = {}
): Promise<PaginatedRequestLogs> {
  return listRequestLogs(page, pageSize, { ...filters, userId });
}

/**
 * Personal day-bucketed usage trend over the redundant user_id column.
 */
export async function getUserUsageStats(
  userId: string,
  range: UserUsageRange = "7d"
): Promise<UserUsageStats> {
  if (process.env.NODE_ENV !== "test") {
    await reconcileStaleInProgressRequestLogs().catch(() => undefined);
  }

  const days = range === "30d" ? 30 : 7;
  const now = new Date();
  const windowStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const startTime = new Date(
    Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth(), windowStart.getUTCDate())
  );

  const timeBucketExpr = buildTimeBucketExpr("day");

  const rows = await db
    .select({
      timeBucket: timeBucketExpr,
      requestCount: count(requestLogs.id),
      totalTokens: sql<string | null>`sum(${requestLogs.totalTokens})`,
      totalCost: billedCostExpr,
    })
    .from(requestLogs)
    .leftJoin(requestBillingSnapshots, eq(requestLogs.id, requestBillingSnapshots.requestLogId))
    .where(and(eq(requestLogs.userId, userId), gte(requestLogs.createdAt, startTime)))
    .groupBy(timeBucketExpr)
    .orderBy(timeBucketExpr);

  const points: UserUsagePoint[] = rows
    .map((row) => ({
      timestamp: parseTimeBucket(row.timeBucket),
      requestCount: row.requestCount,
      totalTokens: row.totalTokens != null ? Number(row.totalTokens) : 0,
      totalCostUsd: parseCost(row.totalCost),
    }))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return {
    range,
    granularity: "day",
    points,
  };
}
