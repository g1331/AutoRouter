import { and, gte, lt, sql, count, sum, inArray, isNotNull, ne, eq } from "drizzle-orm";
import { db, requestLogs, apiKeys, upstreams, requestBillingSnapshots } from "../db";
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

export interface StatsTimeseries {
  range: TimeRange | "custom";
  granularity: "hour" | "day";
  series: UpstreamTimeseriesData[];
}

export interface LeaderboardApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  requestCount: number;
  totalTokens: number;
  totalCostUsd: number;
  modelDistribution: DistributionItem[];
}

export interface LeaderboardUpstreamItem {
  id: string;
  name: string;
  providerType: string;
  requestCount: number;
  totalTokens: number;
  avgTtftMs: number;
  avgTps: number;
  cacheHitRate: number;
  totalCostUsd: number;
  modelDistribution: DistributionItem[];
}

export interface LeaderboardModelItem {
  model: string;
  requestCount: number;
  totalTokens: number;
  avgTtftMs: number;
  avgTps: number;
  upstreamDistribution: DistributionItem[];
}

export interface StatsLeaderboard {
  range: TimeRange;
  apiKeys: LeaderboardApiKeyItem[];
  upstreams: LeaderboardUpstreamItem[];
  models: LeaderboardModelItem[];
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
function getTimeRangeStart(rangeType: TimeRange): Date {
  const now = new Date();

  if (rangeType === "today") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  } else if (rangeType === "7d") {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  } else if (rangeType === "30d") {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  }

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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
function buildTimeBucketExpr(granularity: "hour" | "day") {
  if (config.dbType === "sqlite") {
    return granularity === "hour"
      ? sql<Date>`strftime('%Y-%m-%d %H:00:00', datetime(${requestLogs.createdAt} / 1000, 'unixepoch'))`
      : sql<Date>`strftime('%Y-%m-%d', datetime(${requestLogs.createdAt} / 1000, 'unixepoch'))`;
  }
  return granularity === "hour"
    ? sql<Date>`date_trunc('hour', ${requestLogs.createdAt})`
    : sql<Date>`date_trunc('day', ${requestLogs.createdAt})`;
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
export async function getOverviewStats(): Promise<StatsOverview> {
  if (process.env.NODE_ENV !== "test") {
    await reconcileStaleInProgressRequestLogs().catch(() => undefined);
  }

  const now = new Date();
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
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
 * Get time series statistics grouped by upstream.
 * Filters out null upstreamId (deleted upstreams).
 */
export async function getTimeseriesStats(
  rangeType: TimeRange | "custom" = "7d",
  metric: TimeseriesMetric = "requests",
  customStart?: Date,
  customEnd?: Date
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
    startTime = getTimeRangeStart(rangeType as TimeRange);
  }

  const diffMs = endTime
    ? endTime.getTime() - startTime.getTime()
    : new Date().getTime() - startTime.getTime();
  const granularity = getGranularity(rangeType, diffMs);
  const timeBucketExpr = buildTimeBucketExpr(granularity);

  const whereConditions = [
    gte(requestLogs.createdAt, startTime),
    isNotNull(requestLogs.upstreamId),
    ...(endTime ? [lt(requestLogs.createdAt, endTime)] : []),
  ];

  // Main timeseries query
  const result = await db
    .select({
      upstreamId: requestLogs.upstreamId,
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
    })
    .from(requestLogs)
    .where(and(...whereConditions))
    .groupBy(requestLogs.upstreamId, timeBucketExpr)
    .orderBy(timeBucketExpr);

  // Separate cost query when metric is "cost"
  const costMap = new Map<string, number>();
  if (metric === "cost") {
    const costResult = await db
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
      .orderBy(timeBucketExpr);

    for (const row of costResult) {
      const key = `${row.upstreamId}|${String(row.timeBucket)}`;
      costMap.set(key, row.totalCost ? Number(row.totalCost) : 0);
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

    const rawTimeBucket: unknown = row.timeBucket;
    let timestamp: Date;

    if (rawTimeBucket instanceof Date) {
      timestamp = rawTimeBucket;
    } else if (typeof rawTimeBucket === "string") {
      const normalized =
        rawTimeBucket.endsWith("Z") || rawTimeBucket.includes("+")
          ? rawTimeBucket
          : rawTimeBucket + "Z";
      timestamp = new Date(normalized);
    } else {
      timestamp = new Date(rawTimeBucket as number);
    }

    const costKey = `${upstreamId}|${String(row.timeBucket)}`;

    upstreamData.get(upstreamId)!.push({
      timestamp,
      requestCount: row.requestCount,
      totalTokens: row.totalTokens ? Number(row.totalTokens) : 0,
      avgDurationMs: row.avgDuration ? Math.round(Number(row.avgDuration) * 10) / 10 : 0,
      ...(metric === "ttft" && "avgTtft" in row
        ? { avgTtftMs: row.avgTtft ? Math.round(Number(row.avgTtft) * 10) / 10 : 0 }
        : {}),
      ...(metric === "tps" && "totalCompletionTokens" in row && "totalDurationMs" in row
        ? (() => {
            const compTokens = row.totalCompletionTokens ? Number(row.totalCompletionTokens) : 0;
            const dur = row.totalDurationMs ? Number(row.totalDurationMs) : 0;
            return {
              avgTps: dur > 0 ? Math.round((compTokens / dur) * 1000 * 10) / 10 : 0,
            };
          })()
        : {}),
      ...(metric === "cost" ? { totalCost: costMap.get(costKey) ?? 0 } : {}),
    });
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

  return {
    range: rangeType,
    granularity,
    series,
  };
}

/**
 * Get leaderboard statistics for top performers.
 */
export async function getLeaderboardStats(
  rangeType: TimeRange = "7d",
  limit: number = 5
): Promise<StatsLeaderboard> {
  if (process.env.NODE_ENV !== "test") {
    await reconcileStaleInProgressRequestLogs().catch(() => undefined);
  }

  const startTime = getTimeRangeStart(rangeType);
  limit = Math.min(50, Math.max(1, limit));

  // === API Keys Leaderboard ===
  const apiKeysResult = await db
    .select({
      apiKeyId: requestLogs.apiKeyId,
      requestCount: count(requestLogs.id),
      totalTokens: sum(requestLogs.totalTokens),
    })
    .from(requestLogs)
    .where(and(gte(requestLogs.createdAt, startTime), isNotNull(requestLogs.apiKeyId)))
    .groupBy(requestLogs.apiKeyId)
    .orderBy(sql`count(${requestLogs.id}) DESC`)
    .limit(limit);

  const apiKeyIds = apiKeysResult.map((r) => r.apiKeyId!);
  const apiKeyMap = new Map<string, { name: string; keyPrefix: string }>();

  if (apiKeyIds.length > 0) {
    const keyDetails = await db.query.apiKeys.findMany({
      where: inArray(apiKeys.id, apiKeyIds),
      columns: { id: true, name: true, keyPrefix: true },
    });
    for (const key of keyDetails) {
      apiKeyMap.set(key.id, { name: key.name, keyPrefix: key.keyPrefix });
    }
  }

  // API key costs
  const apiKeyCostMap = new Map<string, number>();
  if (apiKeyIds.length > 0) {
    const costRows = await db
      .select({
        apiKeyId: requestLogs.apiKeyId,
        totalCost: sql<
          string | null
        >`sum(case when ${requestBillingSnapshots.billingStatus} = 'billed' then ${requestBillingSnapshots.finalCost} else 0 end)`,
      })
      .from(requestLogs)
      .leftJoin(requestBillingSnapshots, eq(requestLogs.id, requestBillingSnapshots.requestLogId))
      .where(and(gte(requestLogs.createdAt, startTime), inArray(requestLogs.apiKeyId, apiKeyIds)))
      .groupBy(requestLogs.apiKeyId);
    for (const row of costRows) {
      if (row.apiKeyId) {
        apiKeyCostMap.set(row.apiKeyId, row.totalCost ? Number(row.totalCost) : 0);
      }
    }
  }

  // API key model distributions
  const apiKeyModelDistMap = new Map<string, DistributionItem[]>();
  if (apiKeyIds.length > 0) {
    const distRows = await db
      .select({
        groupKey: requestLogs.apiKeyId,
        name: requestLogs.model,
        cnt: count(requestLogs.id),
      })
      .from(requestLogs)
      .where(
        and(
          gte(requestLogs.createdAt, startTime),
          inArray(requestLogs.apiKeyId, apiKeyIds),
          isNotNull(requestLogs.model),
          ne(requestLogs.model, "")
        )
      )
      .groupBy(requestLogs.apiKeyId, requestLogs.model);

    const mapped = buildDistributionMap(
      distRows.map((r) => ({ groupKey: r.groupKey, name: r.name, cnt: r.cnt }))
    );
    for (const [k, v] of mapped) apiKeyModelDistMap.set(k, v);
  }

  const apiKeysLeaderboard: LeaderboardApiKeyItem[] = apiKeysResult.map((row) => ({
    id: row.apiKeyId!,
    name: apiKeyMap.get(row.apiKeyId!)?.name || "Unknown",
    keyPrefix: apiKeyMap.get(row.apiKeyId!)?.keyPrefix || "sk-****",
    requestCount: row.requestCount,
    totalTokens: row.totalTokens ? Number(row.totalTokens) : 0,
    totalCostUsd: apiKeyCostMap.get(row.apiKeyId!) ?? 0,
    modelDistribution: apiKeyModelDistMap.get(row.apiKeyId!) ?? [],
  }));

  // === Upstreams Leaderboard ===
  const upstreamsResult = await db
    .select({
      upstreamId: requestLogs.upstreamId,
      requestCount: count(requestLogs.id),
      totalTokens: sum(requestLogs.totalTokens),
      avgTtft: sql<
        string | null
      >`avg(case when ${successfulRequestCondition} then ${requestLogs.ttftMs} end)`,
      totalCompletionTokens: sql<number>`sum(case when ${tpsEligibleCondition} then ${requestLogs.completionTokens} else 0 end)`,
      totalDurationMs: sql<number>`sum(case when ${tpsEligibleCondition} then ${requestLogs.durationMs} else 0 end)`,
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
    })
    .from(requestLogs)
    .where(and(gte(requestLogs.createdAt, startTime), isNotNull(requestLogs.upstreamId)))
    .groupBy(requestLogs.upstreamId)
    .orderBy(sql`count(${requestLogs.id}) DESC`)
    .limit(limit);

  const upstreamIds = upstreamsResult.map((r) => r.upstreamId!);
  const upstreamMap = new Map<string, { name: string; providerType: string }>();

  if (upstreamIds.length > 0) {
    const upstreamDetails = await db.query.upstreams.findMany({
      where: inArray(upstreams.id, upstreamIds),
      columns: { id: true, name: true, routeCapabilities: true },
    });
    for (const u of upstreamDetails) {
      upstreamMap.set(u.id, {
        name: u.name,
        providerType: getPrimaryProviderByCapabilities(u.routeCapabilities) ?? "unknown",
      });
    }
  }

  // Upstream costs
  const upstreamCostMap = new Map<string, number>();
  if (upstreamIds.length > 0) {
    const costRows = await db
      .select({
        upstreamId: requestLogs.upstreamId,
        totalCost: sql<
          string | null
        >`sum(case when ${requestBillingSnapshots.billingStatus} = 'billed' then ${requestBillingSnapshots.finalCost} else 0 end)`,
      })
      .from(requestLogs)
      .leftJoin(requestBillingSnapshots, eq(requestLogs.id, requestBillingSnapshots.requestLogId))
      .where(
        and(gte(requestLogs.createdAt, startTime), inArray(requestLogs.upstreamId, upstreamIds))
      )
      .groupBy(requestLogs.upstreamId);
    for (const row of costRows) {
      if (row.upstreamId) {
        upstreamCostMap.set(row.upstreamId, row.totalCost ? Number(row.totalCost) : 0);
      }
    }
  }

  // Upstream model distributions
  const upstreamModelDistMap = new Map<string, DistributionItem[]>();
  if (upstreamIds.length > 0) {
    const distRows = await db
      .select({
        groupKey: requestLogs.upstreamId,
        name: requestLogs.model,
        cnt: count(requestLogs.id),
      })
      .from(requestLogs)
      .where(
        and(
          gte(requestLogs.createdAt, startTime),
          inArray(requestLogs.upstreamId, upstreamIds),
          isNotNull(requestLogs.model),
          ne(requestLogs.model, "")
        )
      )
      .groupBy(requestLogs.upstreamId, requestLogs.model);

    const mapped = buildDistributionMap(
      distRows.map((r) => ({ groupKey: r.groupKey, name: r.name, cnt: r.cnt }))
    );
    for (const [k, v] of mapped) upstreamModelDistMap.set(k, v);
  }

  const upstreamsLeaderboard: LeaderboardUpstreamItem[] = upstreamsResult.map((row) => {
    const compTokens = row.totalCompletionTokens ? Number(row.totalCompletionTokens) : 0;
    const dur = row.totalDurationMs ? Number(row.totalDurationMs) : 0;
    const cacheRead = row.totalCacheReadTokens ? Number(row.totalCacheReadTokens) : 0;
    const effectivePrompt = row.totalEffectivePromptTokens
      ? Number(row.totalEffectivePromptTokens)
      : 0;
    const rawCacheHit = effectivePrompt > 0 ? (cacheRead / effectivePrompt) * 100 : 0;

    return {
      id: row.upstreamId!,
      name: upstreamMap.get(row.upstreamId!)?.name || "Unknown",
      providerType: upstreamMap.get(row.upstreamId!)?.providerType || "unknown",
      requestCount: row.requestCount,
      totalTokens: row.totalTokens ? Number(row.totalTokens) : 0,
      avgTtftMs: row.avgTtft ? Math.round(Number(row.avgTtft) * 10) / 10 : 0,
      avgTps: dur > 0 ? Math.round((compTokens / dur) * 1000 * 10) / 10 : 0,
      cacheHitRate: Math.round(Math.min(Math.max(rawCacheHit, 0), 100) * 10) / 10,
      totalCostUsd: upstreamCostMap.get(row.upstreamId!) ?? 0,
      modelDistribution: upstreamModelDistMap.get(row.upstreamId!) ?? [],
    };
  });

  // === Models Leaderboard ===
  const modelsResult = await db
    .select({
      model: requestLogs.model,
      requestCount: count(requestLogs.id),
      totalTokens: sum(requestLogs.totalTokens),
      avgTtft: sql<
        string | null
      >`avg(case when ${successfulRequestCondition} then ${requestLogs.ttftMs} end)`,
      totalCompletionTokens: sql<number>`sum(case when ${tpsEligibleCondition} then ${requestLogs.completionTokens} else 0 end)`,
      totalDurationMs: sql<number>`sum(case when ${tpsEligibleCondition} then ${requestLogs.durationMs} else 0 end)`,
    })
    .from(requestLogs)
    .where(
      and(
        gte(requestLogs.createdAt, startTime),
        isNotNull(requestLogs.model),
        ne(requestLogs.model, "")
      )
    )
    .groupBy(requestLogs.model)
    .orderBy(sql`count(${requestLogs.id}) DESC`)
    .limit(limit);

  const modelNames = modelsResult.map((r) => r.model!);

  // Model upstream distributions
  const modelUpstreamDistMap = new Map<string, DistributionItem[]>();
  if (modelNames.length > 0) {
    const distRows = await db
      .select({
        groupKey: requestLogs.model,
        upstreamIdRaw: requestLogs.upstreamId,
        cnt: count(requestLogs.id),
      })
      .from(requestLogs)
      .where(
        and(
          gte(requestLogs.createdAt, startTime),
          inArray(requestLogs.model, modelNames),
          isNotNull(requestLogs.upstreamId)
        )
      )
      .groupBy(requestLogs.model, requestLogs.upstreamId);

    // Map upstream IDs to names
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

    const mapped = buildDistributionMap(
      distRows.map((r) => ({
        groupKey: r.groupKey,
        name: r.upstreamIdRaw ? (distUpstreamNameMap.get(r.upstreamIdRaw) ?? null) : null,
        cnt: r.cnt,
      }))
    );
    for (const [k, v] of mapped) modelUpstreamDistMap.set(k, v);
  }

  const modelsLeaderboard: LeaderboardModelItem[] = modelsResult.map((row) => {
    const compTokens = row.totalCompletionTokens ? Number(row.totalCompletionTokens) : 0;
    const dur = row.totalDurationMs ? Number(row.totalDurationMs) : 0;

    return {
      model: row.model || "Unknown",
      requestCount: row.requestCount,
      totalTokens: row.totalTokens ? Number(row.totalTokens) : 0,
      avgTtftMs: row.avgTtft ? Math.round(Number(row.avgTtft) * 10) / 10 : 0,
      avgTps: dur > 0 ? Math.round((compTokens / dur) * 1000 * 10) / 10 : 0,
      upstreamDistribution: modelUpstreamDistMap.get(row.model!) ?? [],
    };
  });

  return {
    range: rangeType,
    apiKeys: apiKeysLeaderboard,
    upstreams: upstreamsLeaderboard,
    models: modelsLeaderboard,
  };
}
