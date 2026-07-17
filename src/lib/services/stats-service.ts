import { and, gte, lt, sql, count, sum, inArray, isNotNull, ne, eq } from "drizzle-orm";
import { db, requestLogs, apiKeys, upstreams, users, requestBillingSnapshots } from "../db";
import { config } from "../utils/config";
import { getPrimaryProviderByCapabilities } from "@/lib/route-capabilities";
import { reconcileStaleInProgressRequestLogs } from "./request-logger";

export type TimeRange = "today" | "7d" | "30d";

export type TimeseriesMetric = "requests" | "ttft" | "tps" | "tokens" | "duration" | "cost";

export interface DistributionItem {
  name: string;
  count: number;
}

export interface StatsOverview {
  todayRequests: number;
  avgResponseTimeMs: number;
  totalTokensToday: number;
  totalCostToday: number;
  successRateToday: number;
  avgTtftMs: number;
  cacheHitRate: number;
  // Yesterday comparison
  yesterdayRequests: number;
  yesterdayTotalTokens: number;
  yesterdayCostUsd: number;
  yesterdayAvgResponseTimeMs: number;
  yesterdayAvgTtftMs: number;
  yesterdayCacheHitRate: number;
}

export interface TimeseriesDataPoint {
  timestamp: Date;
  requestCount: number;
  totalTokens: number;
  avgDurationMs: number;
  avgTtftMs?: number;
  avgTps?: number;
  totalCost?: number;
}

export interface UpstreamTimeseriesData {
  upstreamId: string | null;
  upstreamName: string;
  data: TimeseriesDataPoint[];
}

export interface TimeseriesPeriodSummary {
  requestCount: number;
  totalTokens: number;
  /** Mean over successful requests in the whole period (not bucket-weighted). */
  avgTtftMs: number;
  avgDurationMs: number;
  /** sum(eligible completion tokens) / sum(eligible duration) over the period. */
  avgTps: number;
  /** Billed cost total; only computed when the requested metric is "cost". */
  totalCost: number;
}

export interface StatsTimeseries {
  range: TimeRange | "custom";
  granularity: "hour" | "day";
  series: UpstreamTimeseriesData[];
  totalSeries: TimeseriesDataPoint[];
  periodSummary: TimeseriesPeriodSummary;
}

interface TimeseriesAggregationRow {
  timeBucket: unknown;
  requestCount: number;
  totalTokens: number | string | null;
  avgDuration: string | null;
  avgTtft?: string | null;
  totalCompletionTokens?: number | string | null;
  totalDurationMs?: number | string | null;
}

export type LeaderboardDimension = "upstreams" | "models" | "api_keys" | "users";

export type LeaderboardSortBy =
  | "requests"
  | "tokens"
  | "cost"
  | "ttft"
  | "tps"
  | "cache_hit"
  | "error_rate";

export type LeaderboardSortOrder = "asc" | "desc";

/** Previous-period standing for a ranked entry; null prevRank means newly ranked. */
export interface LeaderboardComparison {
  prevRank: number | null;
  prevRequestCount: number | null;
}

/** The seven aggregate metrics shared by every ranking dimension. */
export interface LeaderboardMetrics {
  requestCount: number;
  totalTokens: number;
  totalCostUsd: number;
  avgTtftMs: number;
  avgTps: number;
  cacheHitRate: number;
  errorRate: number;
}

export interface LeaderboardApiKeyItem extends LeaderboardMetrics {
  id: string;
  name: string;
  keyPrefix: string;
  modelDistribution: DistributionItem[];
  comparison?: LeaderboardComparison;
}

export interface LeaderboardUpstreamItem extends LeaderboardMetrics {
  id: string;
  name: string;
  providerType: string;
  modelDistribution: DistributionItem[];
  comparison?: LeaderboardComparison;
}

export interface LeaderboardModelItem extends LeaderboardMetrics {
  model: string;
  upstreamDistribution: DistributionItem[];
  comparison?: LeaderboardComparison;
}

export interface LeaderboardUserItem extends LeaderboardMetrics {
  id: string;
  username: string;
  displayName: string;
  modelDistribution: DistributionItem[];
  comparison?: LeaderboardComparison;
}

export type LeaderboardItem =
  | LeaderboardApiKeyItem
  | LeaderboardUpstreamItem
  | LeaderboardModelItem
  | LeaderboardUserItem;

export interface StatsLeaderboard {
  range: TimeRange;
  apiKeys: LeaderboardApiKeyItem[];
  upstreams: LeaderboardUpstreamItem[];
  models: LeaderboardModelItem[];
  users: LeaderboardUserItem[];
}

export interface RankingsQuery {
  dimension: LeaderboardDimension;
  sortBy?: LeaderboardSortBy;
  order?: LeaderboardSortOrder;
  rangeType?: TimeRange;
  limit?: number;
  customStart?: Date;
  customEnd?: Date;
  tzOffsetMinutes?: number;
  compare?: boolean;
}

export interface StatsRankings {
  range: TimeRange | "custom";
  dimension: LeaderboardDimension;
  sortBy: LeaderboardSortBy;
  order: LeaderboardSortOrder;
  items: LeaderboardItem[];
}

const MIN_TPS_COMPLETION_TOKENS = 10;
const MIN_TPS_DURATION_MS = 100;
const successfulRequestCondition = sql`${requestLogs.statusCode} BETWEEN 200 AND 299`;

const tpsEligibleCondition = sql`
  ${requestLogs.isStream}
  and ${successfulRequestCondition}
  and ${requestLogs.completionTokens} >= ${MIN_TPS_COMPLETION_TOKENS}
  and ${requestLogs.durationMs} is not null
  and ${requestLogs.durationMs} > ${MIN_TPS_DURATION_MS}
`;

/**
 * Calculate the start datetime for a given time range.
 */
/**
 * Start of the calendar day containing `at`, in the timezone described by
 * `tzOffsetMinutes` (minutes east of UTC, i.e. `-Date#getTimezoneOffset()`).
 */
function localDayStartUtc(at: Date, tzOffsetMinutes: number): Date {
  const shifted = new Date(at.getTime() + tzOffsetMinutes * 60_000);
  const dayStart = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(dayStart - tzOffsetMinutes * 60_000);
}

/**
 * Preset range windows share the request-logs list semantics so the same
 * label means the same window everywhere: "today" starts at the caller's
 * local midnight, "7d"/"30d" are exact rolling windows.
 */
export function getTimeRangeStart(rangeType: TimeRange, tzOffsetMinutes = 0): Date {
  const now = new Date();

  if (rangeType === "7d" || rangeType === "30d") {
    return new Date(now.getTime() - (rangeType === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000);
  }

  return localDayStartUtc(now, tzOffsetMinutes);
}

/**
 * Determine the appropriate granularity for a time range.
 */
function getGranularity(rangeType: TimeRange | "custom", diffMs?: number): "hour" | "day" {
  if (rangeType === "custom" && diffMs !== undefined) {
    return diffMs <= 2 * 24 * 60 * 60 * 1000 ? "hour" : "day";
  }
  return rangeType === "today" ? "hour" : "day";
}

/**
 * Build time bucket SQL expression for grouping.
 */
export function buildTimeBucketExpr(granularity: "hour" | "day") {
  if (config.dbType === "sqlite") {
    return granularity === "hour"
      ? sql<Date>`strftime('%Y-%m-%d %H:00:00', datetime(${requestLogs.createdAt} / 1000, 'unixepoch'))`
      : sql<Date>`strftime('%Y-%m-%d', datetime(${requestLogs.createdAt} / 1000, 'unixepoch'))`;
  }
  return granularity === "hour"
    ? sql<Date>`date_trunc('hour', ${requestLogs.createdAt})`
    : sql<Date>`date_trunc('day', ${requestLogs.createdAt})`;
}

function buildTimeseriesSelectFields(
  metric: TimeseriesMetric,
  timeBucketExpr: ReturnType<typeof buildTimeBucketExpr>
) {
  return {
    timeBucket: timeBucketExpr,
    requestCount: count(requestLogs.id),
    totalTokens: sum(requestLogs.totalTokens),
    avgDuration: sql<
      string | null
    >`avg(case when ${successfulRequestCondition} then ${requestLogs.durationMs} end)`,
    ...(metric === "ttft"
      ? {
          avgTtft: sql<
            string | null
          >`avg(case when ${successfulRequestCondition} then ${requestLogs.ttftMs} end)`,
        }
      : {}),
    ...(metric === "tps"
      ? {
          totalCompletionTokens: sql<number>`sum(case when ${tpsEligibleCondition} then ${requestLogs.completionTokens} else 0 end)`,
          totalDurationMs: sql<number>`sum(case when ${tpsEligibleCondition} then ${requestLogs.durationMs} else 0 end)`,
        }
      : {}),
  };
}

/**
 * Normalize a raw GROUP BY time bucket (Date on PostgreSQL, string on SQLite)
 * into a UTC Date.
 */
export function parseTimeBucket(rawTimeBucket: unknown): Date {
  if (rawTimeBucket instanceof Date) {
    return rawTimeBucket;
  }

  if (typeof rawTimeBucket === "string") {
    const normalized =
      rawTimeBucket.endsWith("Z") || rawTimeBucket.includes("+")
        ? rawTimeBucket
        : rawTimeBucket + "Z";
    return new Date(normalized);
  }

  return new Date(rawTimeBucket as number);
}

function buildTimeseriesDataPoint(
  row: TimeseriesAggregationRow,
  metric: TimeseriesMetric,
  totalCost = 0
): TimeseriesDataPoint {
  const point: TimeseriesDataPoint = {
    timestamp: parseTimeBucket(row.timeBucket),
    requestCount: row.requestCount,
    totalTokens: row.totalTokens != null ? Number(row.totalTokens) : 0,
    avgDurationMs: row.avgDuration != null ? Math.round(Number(row.avgDuration) * 10) / 10 : 0,
  };

  if (metric === "ttft") {
    point.avgTtftMs = row.avgTtft != null ? Math.round(Number(row.avgTtft) * 10) / 10 : 0;
  }

  if (metric === "tps") {
    const completionTokens =
      row.totalCompletionTokens != null ? Number(row.totalCompletionTokens) : 0;
    const durationMs = row.totalDurationMs != null ? Number(row.totalDurationMs) : 0;
    point.avgTps =
      durationMs > 0 ? Math.round((completionTokens / durationMs) * 1000 * 10) / 10 : 0;
  }

  if (metric === "cost") {
    point.totalCost = totalCost;
  }

  return point;
}

/**
 * Build distribution mapping from flat (groupKey, name, count) rows.
 */
function buildDistributionMap<TKey extends string>(
  rows: Array<{ groupKey: TKey | null; name: string | null; cnt: number }>,
  topN = 5
): Map<TKey, DistributionItem[]> {
  const grouped = new Map<TKey, Array<{ name: string; count: number }>>();

  for (const row of rows) {
    if (!row.groupKey || !row.name) continue;
    if (!grouped.has(row.groupKey)) grouped.set(row.groupKey, []);
    grouped.get(row.groupKey)!.push({ name: row.name, count: row.cnt });
  }

  const result = new Map<TKey, DistributionItem[]>();
  for (const [key, items] of grouped) {
    const sorted = items.sort((a, b) => b.count - a.count);
    const top = sorted.slice(0, topN);
    const restCount = sorted.slice(topN).reduce((acc, x) => acc + x.count, 0);
    const dist: DistributionItem[] = top.map((x) => ({ name: x.name, count: x.count }));
    if (restCount > 0) dist.push({ name: "Others", count: restCount });
    result.set(key, dist);
  }

  return result;
}

/**
 * Get overview statistics for the dashboard (today + yesterday comparison + cost).
 */
export async function getOverviewStats(tzOffsetMinutes = 0): Promise<StatsOverview> {
  if (process.env.NODE_ENV !== "test") {
    await reconcileStaleInProgressRequestLogs().catch(() => undefined);
  }

  const startOfToday = localDayStartUtc(new Date(), tzOffsetMinutes);
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);

  const selectFields = {
    totalRequests: count(requestLogs.id),
    avgDuration: sql<
      string | null
    >`avg(case when ${successfulRequestCondition} then ${requestLogs.durationMs} end)`,
    totalTokens: sum(requestLogs.totalTokens),
    successCount: count(sql`CASE WHEN ${requestLogs.statusCode} BETWEEN 200 AND 299 THEN 1 END`),
    avgTtft: sql<
      string | null
    >`avg(case when ${successfulRequestCondition} then ${requestLogs.ttftMs} end)`,
    totalCacheReadTokens: sum(requestLogs.cacheReadTokens),
    totalEffectivePromptTokens: sql<number>`
      sum(
        case
          when ${requestLogs.promptTokens} >= ${requestLogs.cacheReadTokens}
            then ${requestLogs.promptTokens}
          else ${requestLogs.promptTokens} + ${requestLogs.cacheReadTokens}
        end
      )
    `,
    totalCost: sql<
      string | null
    >`sum(case when ${requestBillingSnapshots.billingStatus} = 'billed' then ${requestBillingSnapshots.finalCost} else 0 end)`,
  };

  const [todayRows, yesterdayRows] = await Promise.all([
    db
      .select(selectFields)
      .from(requestLogs)
      .leftJoin(requestBillingSnapshots, eq(requestLogs.id, requestBillingSnapshots.requestLogId))
      .where(gte(requestLogs.createdAt, startOfToday)),
    db
      .select(selectFields)
      .from(requestLogs)
      .leftJoin(requestBillingSnapshots, eq(requestLogs.id, requestBillingSnapshots.requestLogId))
      .where(
        and(gte(requestLogs.createdAt, startOfYesterday), lt(requestLogs.createdAt, startOfToday))
      ),
  ]);

  function parseRow(row: (typeof todayRows)[0] | undefined) {
    const totalRequests = row?.totalRequests ?? 0;
    const avgDuration = parseFloat(row?.avgDuration || "0") || 0;
    const totalTokens = row?.totalTokens ? Number(row.totalTokens) : 0;
    const successCount = row?.successCount ?? 0;
    const avgTtft = parseFloat(row?.avgTtft || "0") || 0;
    const totalCacheRead = row?.totalCacheReadTokens ? Number(row.totalCacheReadTokens) : 0;
    const totalEffectivePrompt = row?.totalEffectivePromptTokens
      ? Number(row.totalEffectivePromptTokens)
      : 0;
    const totalCost = row?.totalCost ? Number(row.totalCost) : 0;

    const successRate = totalRequests > 0 ? (successCount / totalRequests) * 100 : 100;
    const rawCacheHitRate =
      totalEffectivePrompt > 0 ? (totalCacheRead / totalEffectivePrompt) * 100 : 0;
    const cacheHitRate = Math.min(Math.max(rawCacheHitRate, 0), 100);

    return {
      totalRequests,
      avgDuration: Math.round(avgDuration * 10) / 10,
      totalTokens,
      totalCost: Number(totalCost.toFixed(6)),
      successRate: Math.round(successRate * 10) / 10,
      avgTtft: Math.round(avgTtft * 10) / 10,
      cacheHitRate: Math.round(cacheHitRate * 10) / 10,
    };
  }

  const today = parseRow(todayRows[0]);
  const yesterday = parseRow(yesterdayRows[0]);

  return {
    todayRequests: today.totalRequests,
    avgResponseTimeMs: today.avgDuration,
    totalTokensToday: today.totalTokens,
    totalCostToday: today.totalCost,
    successRateToday: today.successRate,
    avgTtftMs: today.avgTtft,
    cacheHitRate: today.cacheHitRate,
    yesterdayRequests: yesterday.totalRequests,
    yesterdayTotalTokens: yesterday.totalTokens,
    yesterdayCostUsd: yesterday.totalCost,
    yesterdayAvgResponseTimeMs: yesterday.avgDuration,
    yesterdayAvgTtftMs: yesterday.avgTtft,
    yesterdayCacheHitRate: yesterday.cacheHitRate,
  };
}

/**
 * Get time series statistics grouped by upstream, plus an exact whole-period
 * aggregate. Requests without an upstream (routing failures, model-list calls)
 * are included and surface as the "Unknown" series.
 */
export async function getTimeseriesStats(
  rangeType: TimeRange | "custom" = "7d",
  metric: TimeseriesMetric = "requests",
  customStart?: Date,
  customEnd?: Date,
  tzOffsetMinutes = 0
): Promise<StatsTimeseries> {
  if (process.env.NODE_ENV !== "test") {
    await reconcileStaleInProgressRequestLogs().catch(() => undefined);
  }

  let startTime: Date;
  let endTime: Date | undefined;

  if (rangeType === "custom" && customStart && customEnd) {
    startTime = customStart;
    endTime = customEnd;
  } else {
    startTime = getTimeRangeStart(rangeType as TimeRange, tzOffsetMinutes);
  }

  const diffMs = endTime
    ? endTime.getTime() - startTime.getTime()
    : new Date().getTime() - startTime.getTime();
  const granularity = getGranularity(rangeType, diffMs);
  const timeBucketExpr = buildTimeBucketExpr(granularity);
  const selectFields = buildTimeseriesSelectFields(metric, timeBucketExpr);

  // No upstreamId filter: requests that never reached an upstream (routing
  // failures, model-list calls) must still count toward the period totals —
  // they surface as the "Unknown" series in the by-upstream view.
  const whereConditions = [
    gte(requestLogs.createdAt, startTime),
    ...(endTime ? [lt(requestLogs.createdAt, endTime)] : []),
  ];

  const [result, totalResult, [summaryRow]] = await Promise.all([
    db
      .select({
        upstreamId: requestLogs.upstreamId,
        ...selectFields,
      })
      .from(requestLogs)
      .where(and(...whereConditions))
      .groupBy(requestLogs.upstreamId, timeBucketExpr)
      .orderBy(timeBucketExpr),
    db
      .select(selectFields)
      .from(requestLogs)
      .where(and(...whereConditions))
      .groupBy(timeBucketExpr)
      .orderBy(timeBucketExpr),
    // Whole-period aggregate: averages here are computed over the full window
    // (success-only, same predicates as the buckets), so the header summary
    // does not have to re-derive them from bucket averages with wrong weights.
    db
      .select({
        requestCount: count(requestLogs.id),
        totalTokens: sum(requestLogs.totalTokens),
        avgTtft: sql<
          string | null
        >`avg(case when ${successfulRequestCondition} then ${requestLogs.ttftMs} end)`,
        avgDuration: sql<
          string | null
        >`avg(case when ${successfulRequestCondition} then ${requestLogs.durationMs} end)`,
        tpsCompletionTokens: sql<
          number | string | null
        >`sum(case when ${tpsEligibleCondition} then ${requestLogs.completionTokens} else 0 end)`,
        tpsDurationMs: sql<
          number | string | null
        >`sum(case when ${tpsEligibleCondition} then ${requestLogs.durationMs} else 0 end)`,
      })
      .from(requestLogs)
      .where(and(...whereConditions)),
  ]);

  const costMap = new Map<string, number>();
  const totalCostMap = new Map<string, number>();
  if (metric === "cost") {
    const [costResult, totalCostResult] = await Promise.all([
      db
        .select({
          upstreamId: requestLogs.upstreamId,
          timeBucket: timeBucketExpr,
          totalCost: sql<
            string | null
          >`sum(case when ${requestBillingSnapshots.billingStatus} = 'billed' then ${requestBillingSnapshots.finalCost} else 0 end)`,
        })
        .from(requestLogs)
        .leftJoin(requestBillingSnapshots, eq(requestLogs.id, requestBillingSnapshots.requestLogId))
        .where(and(...whereConditions))
        .groupBy(requestLogs.upstreamId, timeBucketExpr)
        .orderBy(timeBucketExpr),
      db
        .select({
          timeBucket: timeBucketExpr,
          totalCost: sql<
            string | null
          >`sum(case when ${requestBillingSnapshots.billingStatus} = 'billed' then ${requestBillingSnapshots.finalCost} else 0 end)`,
        })
        .from(requestLogs)
        .leftJoin(requestBillingSnapshots, eq(requestLogs.id, requestBillingSnapshots.requestLogId))
        .where(and(...whereConditions))
        .groupBy(timeBucketExpr)
        .orderBy(timeBucketExpr),
    ]);

    for (const row of costResult) {
      const key = `${row.upstreamId}|${String(row.timeBucket)}`;
      costMap.set(key, row.totalCost ? Number(row.totalCost) : 0);
    }

    for (const row of totalCostResult) {
      totalCostMap.set(String(row.timeBucket), row.totalCost ? Number(row.totalCost) : 0);
    }
  }

  // Get upstream names
  const upstreamIds = [
    ...new Set(result.map((r) => r.upstreamId).filter((id) => id !== null)),
  ] as string[];
  const upstreamMap = new Map<string | null, string>();

  if (upstreamIds.length > 0) {
    const upstreamList = await db.query.upstreams.findMany({
      where: inArray(upstreams.id, upstreamIds),
      columns: { id: true, name: true },
    });
    for (const u of upstreamList) {
      upstreamMap.set(u.id, u.name);
    }
  }

  // Group data by upstream
  const upstreamData = new Map<string | null, TimeseriesDataPoint[]>();

  for (const row of result) {
    const upstreamId = row.upstreamId;
    if (!upstreamData.has(upstreamId)) {
      upstreamData.set(upstreamId, []);
    }

    const costKey = `${upstreamId}|${String(row.timeBucket)}`;

    upstreamData
      .get(upstreamId)!
      .push(buildTimeseriesDataPoint(row, metric, costMap.get(costKey) ?? 0));
  }

  // Convert to response format
  const series: UpstreamTimeseriesData[] = [];
  for (const [upstreamId, dataPoints] of upstreamData) {
    series.push({
      upstreamId,
      upstreamName: upstreamMap.get(upstreamId) || "Unknown",
      data: dataPoints.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
    });
  }

  series.sort((a, b) => {
    if (a.upstreamName === "Unknown") return 1;
    if (b.upstreamName === "Unknown") return -1;
    return a.upstreamName.localeCompare(b.upstreamName);
  });

  const totalSeries = totalResult
    .map((row) =>
      buildTimeseriesDataPoint(row, metric, totalCostMap.get(String(row.timeBucket)) ?? 0)
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const summaryTpsCompletion =
    summaryRow?.tpsCompletionTokens != null ? Number(summaryRow.tpsCompletionTokens) : 0;
  const summaryTpsDuration =
    summaryRow?.tpsDurationMs != null ? Number(summaryRow.tpsDurationMs) : 0;
  const periodSummary: TimeseriesPeriodSummary = {
    requestCount: summaryRow?.requestCount ?? 0,
    totalTokens: summaryRow?.totalTokens != null ? Number(summaryRow.totalTokens) : 0,
    avgTtftMs: summaryRow?.avgTtft != null ? Math.round(Number(summaryRow.avgTtft) * 10) / 10 : 0,
    avgDurationMs:
      summaryRow?.avgDuration != null ? Math.round(Number(summaryRow.avgDuration) * 10) / 10 : 0,
    avgTps:
      summaryTpsDuration > 0
        ? Math.round((summaryTpsCompletion / summaryTpsDuration) * 1000 * 10) / 10
        : 0,
    // Bucket-level billed costs sum exactly to the period total.
    totalCost:
      metric === "cost" ? [...totalCostMap.values()].reduce((acc, value) => acc + value, 0) : 0,
  };

  return {
    range: rangeType,
    granularity,
    series,
    totalSeries,
    periodSummary,
  };
}

// ===========================================================================
// Rankings / leaderboard
// ===========================================================================

// Shared aggregate SQL fragments. Billing snapshots join 1:1 on the unique
// request_log_id, so aggregating over the joined rows never inflates counts.
const totalCostExpr = sql`sum(case when ${requestBillingSnapshots.billingStatus} = 'billed' then ${requestBillingSnapshots.finalCost} else 0 end)`;
const avgTtftExpr = sql`avg(case when ${successfulRequestCondition} then ${requestLogs.ttftMs} end)`;
const tpsCompletionExpr = sql`sum(case when ${tpsEligibleCondition} then ${requestLogs.completionTokens} else 0 end)`;
const tpsDurationExpr = sql`sum(case when ${tpsEligibleCondition} then ${requestLogs.durationMs} else 0 end)`;
const effectivePromptExpr = sql`
  sum(
    case
      when ${requestLogs.promptTokens} >= ${requestLogs.cacheReadTokens}
        then ${requestLogs.promptTokens}
      else ${requestLogs.promptTokens} + ${requestLogs.cacheReadTokens}
    end
  )
`;
// A request is "completed" once it has a status code; in-progress rows
// (status_code IS NULL) stay out of both sides of the error rate.
const completedCountExpr = sql`count(case when ${requestLogs.statusCode} is not null then 1 end)`;
const errorCountExpr = sql`count(case when ${requestLogs.statusCode} is not null and ${requestLogs.statusCode} not between 200 and 299 then 1 end)`;

interface RankingRow {
  key: string | null;
  requestCount: number;
  totalTokens: string | number | null;
  totalCost: string | null;
  avgTtft: string | null;
  tpsCompletionTokens: string | number | null;
  tpsDurationMs: string | number | null;
  cacheReadTokens: string | number | null;
  effectivePromptTokens: string | number | null;
  completedCount: string | number | null;
  errorCount: string | number | null;
}

const rankingDimensionConfigs = {
  upstreams: {
    groupCol: () => requestLogs.upstreamId,
    extraWhere: () => isNotNull(requestLogs.upstreamId),
  },
  models: {
    groupCol: () => requestLogs.model,
    extraWhere: () => and(isNotNull(requestLogs.model), ne(requestLogs.model, "")),
  },
  api_keys: {
    groupCol: () => requestLogs.apiKeyId,
    extraWhere: () => isNotNull(requestLogs.apiKeyId),
  },
  users: {
    groupCol: () => requestLogs.userId,
    extraWhere: () => isNotNull(requestLogs.userId),
  },
} as const;

export const LEADERBOARD_DIMENSIONS = Object.keys(
  rankingDimensionConfigs
) as LeaderboardDimension[];

export const LEADERBOARD_SORT_FIELDS: LeaderboardSortBy[] = [
  "requests",
  "tokens",
  "cost",
  "ttft",
  "tps",
  "cache_hit",
  "error_rate",
];

function buildRankingOrderBy(sortBy: LeaderboardSortBy, order: LeaderboardSortOrder) {
  const sortExprs: Record<LeaderboardSortBy, ReturnType<typeof sql>> = {
    requests: sql`count(${requestLogs.id})`,
    tokens: sql`coalesce(sum(${requestLogs.totalTokens}), 0)`,
    cost: sql`coalesce(${totalCostExpr}, 0)`,
    ttft: sql`coalesce(${avgTtftExpr}, 0)`,
    tps: sql`case when ${tpsDurationExpr} > 0 then ${tpsCompletionExpr} * 1000.0 / ${tpsDurationExpr} else 0 end`,
    cache_hit: sql`case when ${effectivePromptExpr} > 0 then sum(${requestLogs.cacheReadTokens}) * 1.0 / ${effectivePromptExpr} else 0 end`,
    error_rate: sql`case when ${completedCountExpr} > 0 then ${errorCountExpr} * 1.0 / ${completedCountExpr} else 0 end`,
  };
  // For rate/latency metrics a group can have requests yet no samples (e.g.
  // all requests failed → no TTFT). Their defaulted 0 must not beat real low
  // values under asc, so sample-less groups sink to the bottom either way.
  const noSampleExprs: Partial<Record<LeaderboardSortBy, ReturnType<typeof sql>>> = {
    ttft: sql`${avgTtftExpr} is null`,
    tps: sql`${tpsDurationExpr} <= 0`,
    cache_hit: sql`${effectivePromptExpr} <= 0`,
    error_rate: sql`${completedCountExpr} <= 0`,
  };
  const keys: ReturnType<typeof sql>[] = [];
  const noSample = noSampleExprs[sortBy];
  if (noSample) keys.push(sql`case when ${noSample} then 1 else 0 end asc`);
  keys.push(order === "asc" ? sql`${sortExprs[sortBy]} asc` : sql`${sortExprs[sortBy]} desc`);
  return keys;
}

async function queryRankingRows(
  dimension: LeaderboardDimension,
  timeFilter: ReturnType<typeof gte> | ReturnType<typeof and>,
  sortBy: LeaderboardSortBy,
  order: LeaderboardSortOrder,
  limit?: number
): Promise<RankingRow[]> {
  const config = rankingDimensionConfigs[dimension];
  const groupCol = config.groupCol();

  const query = db
    .select({
      key: groupCol,
      requestCount: count(requestLogs.id),
      totalTokens: sum(requestLogs.totalTokens),
      totalCost: sql<string | null>`${totalCostExpr}`,
      avgTtft: sql<string | null>`${avgTtftExpr}`,
      tpsCompletionTokens: sql<number>`${tpsCompletionExpr}`,
      tpsDurationMs: sql<number>`${tpsDurationExpr}`,
      cacheReadTokens: sum(requestLogs.cacheReadTokens),
      effectivePromptTokens: sql<number>`${effectivePromptExpr}`,
      completedCount: sql<number>`${completedCountExpr}`,
      errorCount: sql<number>`${errorCountExpr}`,
    })
    .from(requestLogs)
    .leftJoin(requestBillingSnapshots, eq(requestLogs.id, requestBillingSnapshots.requestLogId))
    .where(and(timeFilter, config.extraWhere()))
    .groupBy(groupCol)
    // Deterministic tiebreaker on the group key: ties would otherwise land in
    // DB-defined order, flipping between the current and comparison windows
    // (phantom rank arrows) and across the limit cutoff.
    .orderBy(...buildRankingOrderBy(sortBy, order), sql`${groupCol} asc`);

  const rows = await (limit === undefined ? query : query.limit(limit));

  return rows as RankingRow[];
}

function buildRankingMetrics(row: RankingRow): LeaderboardMetrics {
  const tpsCompletion = row.tpsCompletionTokens != null ? Number(row.tpsCompletionTokens) : 0;
  const tpsDuration = row.tpsDurationMs != null ? Number(row.tpsDurationMs) : 0;
  const cacheRead = row.cacheReadTokens != null ? Number(row.cacheReadTokens) : 0;
  const effectivePrompt = row.effectivePromptTokens != null ? Number(row.effectivePromptTokens) : 0;
  const completed = row.completedCount != null ? Number(row.completedCount) : 0;
  const errors = row.errorCount != null ? Number(row.errorCount) : 0;
  const rawCacheHit = effectivePrompt > 0 ? (cacheRead / effectivePrompt) * 100 : 0;

  return {
    requestCount: row.requestCount,
    totalTokens: row.totalTokens != null ? Number(row.totalTokens) : 0,
    totalCostUsd: row.totalCost != null ? Number(row.totalCost) : 0,
    avgTtftMs: row.avgTtft != null ? Math.round(Number(row.avgTtft) * 10) / 10 : 0,
    avgTps: tpsDuration > 0 ? Math.round((tpsCompletion / tpsDuration) * 1000 * 10) / 10 : 0,
    cacheHitRate: Math.round(Math.min(Math.max(rawCacheHit, 0), 100) * 10) / 10,
    errorRate: completed > 0 ? Math.round((errors / completed) * 100 * 10) / 10 : 0,
  };
}

/**
 * Per-group model distribution for upstream/api-key/user rankings.
 */
async function queryModelDistribution(
  dimension: "upstreams" | "api_keys" | "users",
  timeFilter: ReturnType<typeof gte> | ReturnType<typeof and>,
  keys: string[]
): Promise<Map<string, DistributionItem[]>> {
  if (keys.length === 0) return new Map();
  const groupCol = rankingDimensionConfigs[dimension].groupCol();

  const distRows = await db
    .select({
      groupKey: groupCol,
      name: requestLogs.model,
      cnt: count(requestLogs.id),
    })
    .from(requestLogs)
    .where(
      and(
        timeFilter,
        inArray(groupCol, keys),
        isNotNull(requestLogs.model),
        ne(requestLogs.model, "")
      )
    )
    .groupBy(groupCol, requestLogs.model);

  return buildDistributionMap(
    distRows.map((r) => ({ groupKey: r.groupKey, name: r.name, cnt: r.cnt }))
  );
}

/**
 * Per-model upstream distribution (model dimension only; resolves upstream names).
 */
async function queryUpstreamDistributionForModels(
  timeFilter: ReturnType<typeof gte> | ReturnType<typeof and>,
  modelNames: string[]
): Promise<Map<string, DistributionItem[]>> {
  if (modelNames.length === 0) return new Map();

  const distRows = await db
    .select({
      groupKey: requestLogs.model,
      upstreamIdRaw: requestLogs.upstreamId,
      cnt: count(requestLogs.id),
    })
    .from(requestLogs)
    .where(
      and(timeFilter, inArray(requestLogs.model, modelNames), isNotNull(requestLogs.upstreamId))
    )
    .groupBy(requestLogs.model, requestLogs.upstreamId);

  const distUpstreamIds = [
    ...new Set(distRows.map((r) => r.upstreamIdRaw).filter(Boolean)),
  ] as string[];
  const distUpstreamNameMap = new Map<string, string>();
  if (distUpstreamIds.length > 0) {
    const details = await db.query.upstreams.findMany({
      where: inArray(upstreams.id, distUpstreamIds),
      columns: { id: true, name: true },
    });
    for (const u of details) distUpstreamNameMap.set(u.id, u.name);
  }

  return buildDistributionMap(
    distRows.map((r) => ({
      groupKey: r.groupKey,
      name: r.upstreamIdRaw ? (distUpstreamNameMap.get(r.upstreamIdRaw) ?? null) : null,
      cnt: r.cnt,
    }))
  );
}

async function queryUpstreamRanking(
  timeFilter: ReturnType<typeof gte> | ReturnType<typeof and>,
  sortBy: LeaderboardSortBy,
  order: LeaderboardSortOrder,
  limit: number
): Promise<LeaderboardUpstreamItem[]> {
  const rows = await queryRankingRows("upstreams", timeFilter, sortBy, order, limit);
  const ids = rows.map((r) => r.key!).filter(Boolean);

  const [details, distMap] = await Promise.all([
    ids.length > 0
      ? db.query.upstreams.findMany({
          where: inArray(upstreams.id, ids),
          columns: { id: true, name: true, routeCapabilities: true },
        })
      : Promise.resolve([]),
    queryModelDistribution("upstreams", timeFilter, ids),
  ]);
  const detailMap = new Map<string, { name: string; providerType: string }>();
  for (const u of details) {
    detailMap.set(u.id, {
      name: u.name,
      providerType: getPrimaryProviderByCapabilities(u.routeCapabilities) ?? "unknown",
    });
  }

  return rows.map((row) => ({
    id: row.key!,
    name: detailMap.get(row.key!)?.name || "Unknown",
    providerType: detailMap.get(row.key!)?.providerType || "unknown",
    ...buildRankingMetrics(row),
    modelDistribution: distMap.get(row.key!) ?? [],
  }));
}

async function queryModelRanking(
  timeFilter: ReturnType<typeof gte> | ReturnType<typeof and>,
  sortBy: LeaderboardSortBy,
  order: LeaderboardSortOrder,
  limit: number
): Promise<LeaderboardModelItem[]> {
  const rows = await queryRankingRows("models", timeFilter, sortBy, order, limit);
  const names = rows.map((r) => r.key!).filter(Boolean);

  const distMap = await queryUpstreamDistributionForModels(timeFilter, names);

  return rows.map((row) => ({
    model: row.key || "Unknown",
    ...buildRankingMetrics(row),
    upstreamDistribution: distMap.get(row.key!) ?? [],
  }));
}

async function queryApiKeyRanking(
  timeFilter: ReturnType<typeof gte> | ReturnType<typeof and>,
  sortBy: LeaderboardSortBy,
  order: LeaderboardSortOrder,
  limit: number
): Promise<LeaderboardApiKeyItem[]> {
  const rows = await queryRankingRows("api_keys", timeFilter, sortBy, order, limit);
  const ids = rows.map((r) => r.key!).filter(Boolean);

  const [details, distMap] = await Promise.all([
    ids.length > 0
      ? db.query.apiKeys.findMany({
          where: inArray(apiKeys.id, ids),
          columns: { id: true, name: true, keyPrefix: true },
        })
      : Promise.resolve([]),
    queryModelDistribution("api_keys", timeFilter, ids),
  ]);
  const detailMap = new Map<string, { name: string; keyPrefix: string }>();
  for (const key of details) {
    detailMap.set(key.id, { name: key.name, keyPrefix: key.keyPrefix });
  }

  return rows.map((row) => ({
    id: row.key!,
    name: detailMap.get(row.key!)?.name || "Unknown",
    keyPrefix: detailMap.get(row.key!)?.keyPrefix || "sk-****",
    ...buildRankingMetrics(row),
    modelDistribution: distMap.get(row.key!) ?? [],
  }));
}

async function queryUserRanking(
  timeFilter: ReturnType<typeof gte> | ReturnType<typeof and>,
  sortBy: LeaderboardSortBy,
  order: LeaderboardSortOrder,
  limit: number
): Promise<LeaderboardUserItem[]> {
  // Owner-level usage attributed through the redundant request_logs.user_id
  // snapshot. Requests without an owner (user_id is null, e.g. admin-token
  // traffic) are excluded so the board only ranks real member accounts.
  const rows = await queryRankingRows("users", timeFilter, sortBy, order, limit);
  const ids = rows.map((r) => r.key!).filter(Boolean);

  const [details, distMap] = await Promise.all([
    ids.length > 0
      ? db.query.users.findMany({
          where: inArray(users.id, ids),
          columns: { id: true, username: true, displayName: true },
        })
      : Promise.resolve([]),
    queryModelDistribution("users", timeFilter, ids),
  ]);
  const detailMap = new Map<string, { username: string; displayName: string }>();
  for (const u of details) {
    detailMap.set(u.id, { username: u.username, displayName: u.displayName });
  }

  return rows.map((row) => ({
    id: row.key!,
    username: detailMap.get(row.key!)?.username || "Unknown",
    displayName: detailMap.get(row.key!)?.displayName || "Unknown",
    ...buildRankingMetrics(row),
    modelDistribution: distMap.get(row.key!) ?? [],
  }));
}

function buildLeaderboardTimeFilter(startTime: Date, endTime: Date | null) {
  return endTime
    ? and(gte(requestLogs.createdAt, startTime), lt(requestLogs.createdAt, endTime))
    : gte(requestLogs.createdAt, startTime);
}

async function queryDimensionRanking(
  dimension: LeaderboardDimension,
  timeFilter: ReturnType<typeof gte> | ReturnType<typeof and>,
  sortBy: LeaderboardSortBy,
  order: LeaderboardSortOrder,
  limit: number
): Promise<LeaderboardItem[]> {
  switch (dimension) {
    case "upstreams":
      return queryUpstreamRanking(timeFilter, sortBy, order, limit);
    case "models":
      return queryModelRanking(timeFilter, sortBy, order, limit);
    case "api_keys":
      return queryApiKeyRanking(timeFilter, sortBy, order, limit);
    case "users":
      return queryUserRanking(timeFilter, sortBy, order, limit);
  }
}

function rankingItemKey(dimension: LeaderboardDimension, item: LeaderboardItem): string {
  return dimension === "models"
    ? (item as LeaderboardModelItem).model
    : (item as LeaderboardUpstreamItem | LeaderboardApiKeyItem | LeaderboardUserItem).id;
}

/**
 * Single-dimension ranking with configurable sort and optional
 * previous-period comparison (rank movement + request-count delta).
 */
export async function getRankings(query: RankingsQuery): Promise<StatsRankings> {
  if (process.env.NODE_ENV !== "test") {
    await reconcileStaleInProgressRequestLogs().catch(() => undefined);
  }

  const {
    dimension,
    sortBy = "requests",
    order = "desc",
    rangeType = "7d",
    customStart,
    customEnd,
    tzOffsetMinutes = 0,
    compare = false,
  } = query;
  const limit = Math.min(50, Math.max(1, query.limit ?? 50));

  const startTime = customStart ?? getTimeRangeStart(rangeType, tzOffsetMinutes);
  const endTime = customEnd ?? null;
  const timeFilter = buildLeaderboardTimeFilter(startTime, endTime);

  // Previous window of equal length, ending where the current one starts.
  // Unlimited on purpose: truncating it at `limit` would mislabel entities
  // that merely ranked below the cutoff last period as brand-new entries.
  const effectiveEnd = endTime ?? new Date();
  const windowMs = effectiveEnd.getTime() - startTime.getTime();
  const prevFilter = buildLeaderboardTimeFilter(
    new Date(startTime.getTime() - windowMs),
    startTime
  );

  const [items, prevRows] = await Promise.all([
    queryDimensionRanking(dimension, timeFilter, sortBy, order, limit),
    compare ? queryRankingRows(dimension, prevFilter, sortBy, order) : Promise.resolve(null),
  ]);

  if (prevRows) {
    const prevMap = new Map<string, { rank: number; requestCount: number }>();
    prevRows.forEach((row, index) => {
      if (row.key) prevMap.set(row.key, { rank: index + 1, requestCount: row.requestCount });
    });

    for (const item of items) {
      const prev = prevMap.get(rankingItemKey(dimension, item));
      item.comparison = prev
        ? { prevRank: prev.rank, prevRequestCount: prev.requestCount }
        : { prevRank: null, prevRequestCount: null };
    }
  }

  return {
    range: customStart ? "custom" : rangeType,
    dimension,
    sortBy,
    order,
    items,
  };
}

/**
 * Get leaderboard statistics for top performers (all four dimensions,
 * request-count order). Kept for the dashboard overview section.
 */
export async function getLeaderboardStats(
  rangeType: TimeRange = "7d",
  limit: number = 5,
  customStart?: Date,
  customEnd?: Date,
  tzOffsetMinutes = 0
): Promise<StatsLeaderboard> {
  if (process.env.NODE_ENV !== "test") {
    await reconcileStaleInProgressRequestLogs().catch(() => undefined);
  }

  const startTime = customStart ?? getTimeRangeStart(rangeType, tzOffsetMinutes);
  const endTime = customEnd ?? null;
  const timeFilter = buildLeaderboardTimeFilter(startTime, endTime);
  limit = Math.min(50, Math.max(1, limit));

  // Sequential on purpose: keeps query order deterministic for tests and
  // avoids bursting the connection pool with 8 concurrent aggregations.
  const apiKeysLeaderboard = await queryApiKeyRanking(timeFilter, "requests", "desc", limit);
  const upstreamsLeaderboard = await queryUpstreamRanking(timeFilter, "requests", "desc", limit);
  const modelsLeaderboard = await queryModelRanking(timeFilter, "requests", "desc", limit);
  const usersLeaderboard = await queryUserRanking(timeFilter, "requests", "desc", limit);

  return {
    range: rangeType,
    apiKeys: apiKeysLeaderboard,
    upstreams: upstreamsLeaderboard,
    models: modelsLeaderboard,
    users: usersLeaderboard,
  };
}
