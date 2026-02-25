import { and, gte, sql, count, sum, avg, inArray, isNotNull, ne } from "drizzle-orm";
import { db, requestLogs, apiKeys, upstreams } from "../db";
import { config } from "../utils/config";
import { getPrimaryProviderByCapabilities } from "@/lib/route-capabilities";

export type TimeRange = "today" | "7d" | "30d";

export interface StatsOverview {
  todayRequests: number;
  avgResponseTimeMs: number;
  totalTokensToday: number;
  successRateToday: number;
}

export interface TimeseriesDataPoint {
  timestamp: Date;
  requestCount: number;
  totalTokens: number;
  avgDurationMs: number;
}

export interface UpstreamTimeseriesData {
  upstreamId: string | null;
  upstreamName: string;
  data: TimeseriesDataPoint[];
}

export interface StatsTimeseries {
  range: TimeRange;
  granularity: "hour" | "day";
  series: UpstreamTimeseriesData[];
}

export interface LeaderboardApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  requestCount: number;
  totalTokens: number;
}

export interface LeaderboardUpstreamItem {
  id: string;
  name: string;
  providerType: string;
  requestCount: number;
  totalTokens: number;
}

export interface LeaderboardModelItem {
  model: string;
  requestCount: number;
  totalTokens: number;
}

export interface StatsLeaderboard {
  range: TimeRange;
  apiKeys: LeaderboardApiKeyItem[];
  upstreams: LeaderboardUpstreamItem[];
  models: LeaderboardModelItem[];
}

/**
 * Calculate the start datetime for a given time range.
 */
function getTimeRangeStart(rangeType: TimeRange): Date {
  const now = new Date();

  if (rangeType === "today") {
    // Start of today (midnight UTC)
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  } else if (rangeType === "7d") {
    // 7 days ago at midnight
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  } else if (rangeType === "30d") {
    // 30 days ago at midnight
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  }

  // Default to today
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Determine the appropriate granularity for a time range.
 */
function getGranularity(rangeType: TimeRange): "hour" | "day" {
  return rangeType === "today" ? "hour" : "day";
}

/**
 * Get overview statistics for the dashboard.
 */
export async function getOverviewStats(): Promise<StatsOverview> {
  const startOfToday = getTimeRangeStart("today");

  const result = await db
    .select({
      totalRequests: count(requestLogs.id),
      avgDuration: avg(requestLogs.durationMs),
      totalTokens: sum(requestLogs.totalTokens),
      successCount: count(sql`CASE WHEN ${requestLogs.statusCode} BETWEEN 200 AND 299 THEN 1 END`),
    })
    .from(requestLogs)
    .where(gte(requestLogs.createdAt, startOfToday));

  const row = result[0];
  const totalRequests = row?.totalRequests || 0;
  const avgDuration = row?.avgDuration ? Number(row.avgDuration) : 0;
  const totalTokens = row?.totalTokens ? Number(row.totalTokens) : 0;
  const successCount = row?.successCount || 0;

  const successRate = totalRequests > 0 ? (successCount / totalRequests) * 100 : 100;

  return {
    todayRequests: totalRequests,
    avgResponseTimeMs: Math.round(avgDuration * 10) / 10,
    totalTokensToday: totalTokens,
    successRateToday: Math.round(successRate * 10) / 10,
  };
}

/**
 * Get time series statistics grouped by upstream.
 */
export async function getTimeseriesStats(rangeType: TimeRange = "7d"): Promise<StatsTimeseries> {
  const startTime = getTimeRangeStart(rangeType);
  const granularity = getGranularity(rangeType);

  // Time bucket expression: PG uses date_trunc, SQLite uses strftime
  const timeBucketExpr =
    config.dbType === "sqlite"
      ? granularity === "hour"
        ? sql<Date>`strftime('%Y-%m-%d %H:00:00', datetime(${requestLogs.createdAt} / 1000, 'unixepoch'))`
        : sql<Date>`strftime('%Y-%m-%d', datetime(${requestLogs.createdAt} / 1000, 'unixepoch'))`
      : granularity === "hour"
        ? sql<Date>`date_trunc('hour', ${requestLogs.createdAt})`
        : sql<Date>`date_trunc('day', ${requestLogs.createdAt})`;

  const result = await db
    .select({
      upstreamId: requestLogs.upstreamId,
      timeBucket: timeBucketExpr,
      requestCount: count(requestLogs.id),
      totalTokens: sum(requestLogs.totalTokens),
      avgDuration: avg(requestLogs.durationMs),
    })
    .from(requestLogs)
    .where(gte(requestLogs.createdAt, startTime))
    .groupBy(requestLogs.upstreamId, timeBucketExpr)
    .orderBy(timeBucketExpr);

  // Get upstream names
  const upstreamIds = [
    ...new Set(result.map((r) => r.upstreamId).filter((id) => id !== null)),
  ] as string[];
  const upstreamMap = new Map<string | null, string>([[null, "Unknown"]]);

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

    upstreamData.get(upstreamId)!.push({
      timestamp,
      requestCount: row.requestCount,
      totalTokens: row.totalTokens ? Number(row.totalTokens) : 0,
      avgDurationMs: row.avgDuration ? Math.round(Number(row.avgDuration) * 10) / 10 : 0,
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

  // Sort series by upstream name (put "Unknown" last)
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
  const startTime = getTimeRangeStart(rangeType);
  limit = Math.min(50, Math.max(1, limit));

  // API Keys Leaderboard
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

  // Fetch API key details
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

  const apiKeysLeaderboard: LeaderboardApiKeyItem[] = apiKeysResult.map((row) => ({
    id: row.apiKeyId!,
    name: apiKeyMap.get(row.apiKeyId!)?.name || "Unknown",
    keyPrefix: apiKeyMap.get(row.apiKeyId!)?.keyPrefix || "sk-****",
    requestCount: row.requestCount,
    totalTokens: row.totalTokens ? Number(row.totalTokens) : 0,
  }));

  // Upstreams Leaderboard
  const upstreamsResult = await db
    .select({
      upstreamId: requestLogs.upstreamId,
      requestCount: count(requestLogs.id),
      totalTokens: sum(requestLogs.totalTokens),
    })
    .from(requestLogs)
    .where(and(gte(requestLogs.createdAt, startTime), isNotNull(requestLogs.upstreamId)))
    .groupBy(requestLogs.upstreamId)
    .orderBy(sql`count(${requestLogs.id}) DESC`)
    .limit(limit);

  // Fetch upstream details
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

  const upstreamsLeaderboard: LeaderboardUpstreamItem[] = upstreamsResult.map((row) => ({
    id: row.upstreamId!,
    name: upstreamMap.get(row.upstreamId!)?.name || "Unknown",
    providerType: upstreamMap.get(row.upstreamId!)?.providerType || "unknown",
    requestCount: row.requestCount,
    totalTokens: row.totalTokens ? Number(row.totalTokens) : 0,
  }));

  // Models Leaderboard
  const modelsResult = await db
    .select({
      model: requestLogs.model,
      requestCount: count(requestLogs.id),
      totalTokens: sum(requestLogs.totalTokens),
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

  const modelsLeaderboard: LeaderboardModelItem[] = modelsResult.map((row) => ({
    model: row.model || "Unknown",
    requestCount: row.requestCount,
    totalTokens: row.totalTokens ? Number(row.totalTokens) : 0,
  }));

  return {
    range: rangeType,
    apiKeys: apiKeysLeaderboard,
    upstreams: upstreamsLeaderboard,
    models: modelsLeaderboard,
  };
}
