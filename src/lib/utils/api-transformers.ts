import type {
  UpstreamResponse as ServiceUpstreamResponse,
  PaginatedUpstreams,
  UpstreamGroupResponse as ServiceUpstreamGroupResponse,
  PaginatedUpstreamGroups,
} from "@/lib/services/upstream-crud";
import type {
  ApiKeyListItem,
  ApiKeyCreateResult,
  ApiKeyRevealResult,
  PaginatedApiKeys,
} from "@/lib/services/key-manager";
import type {
  RequestLogResponse,
  PaginatedRequestLogs,
  FailoverAttempt,
} from "@/lib/services/request-logger";
import type {
  StatsOverview,
  StatsTimeseries,
  StatsLeaderboard,
  TimeRange,
  TimeseriesDataPoint,
  UpstreamTimeseriesData,
  LeaderboardApiKeyItem,
  LeaderboardUpstreamItem,
  LeaderboardModelItem,
} from "@/lib/services/stats-service";

// ========== Helper Utilities ==========

/**
 * Convert a Date to ISO string, or return null if the date is null/undefined.
 */
export function toISOStringOrNull(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

// ========== Upstream API Response Types ==========

/**
 * API response format for upstream (snake_case).
 * This matches the actual response format used by the API routes.
 */
export interface UpstreamApiResponse {
  id: string;
  name: string;
  provider: string;
  base_url: string;
  api_key_masked: string;
  is_default: boolean;
  timeout: number;
  is_active: boolean;
  config: string | null;
  group_id: string | null;
  weight: number;
  group_name: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Paginated API response format.
 */
export interface PaginatedApiResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/**
 * API response format for upstream group (snake_case).
 * This matches the actual response format used by the API routes.
 */
export interface UpstreamGroupApiResponse {
  id: string;
  name: string;
  provider: string;
  strategy: string;
  health_check_interval: number;
  health_check_timeout: number;
  is_active: boolean;
  config: string | null;
  created_at: string;
  updated_at: string;
}

// ========== Upstream Transformers ==========

/**
 * Transform a service layer upstream response to API response format.
 * Converts camelCase properties to snake_case for API consistency.
 */
export function transformUpstreamToApi(upstream: ServiceUpstreamResponse): UpstreamApiResponse {
  return {
    id: upstream.id,
    name: upstream.name,
    provider: upstream.provider,
    base_url: upstream.baseUrl,
    api_key_masked: upstream.apiKeyMasked,
    is_default: upstream.isDefault,
    timeout: upstream.timeout,
    is_active: upstream.isActive,
    config: upstream.config,
    group_id: upstream.groupId,
    weight: upstream.weight,
    group_name: upstream.groupName,
    created_at: upstream.createdAt.toISOString(),
    updated_at: upstream.updatedAt.toISOString(),
  };
}

/**
 * Transform paginated upstream results to API response format.
 */
export function transformPaginatedUpstreams(
  result: PaginatedUpstreams
): PaginatedApiResponse<UpstreamApiResponse> {
  return {
    items: result.items.map(transformUpstreamToApi),
    total: result.total,
    page: result.page,
    page_size: result.pageSize,
    total_pages: result.totalPages,
  };
}

// ========== Upstream Group Transformers ==========

/**
 * Transform a service layer upstream group response to API response format.
 * Converts camelCase properties to snake_case for API consistency.
 */
export function transformUpstreamGroupToApi(
  group: ServiceUpstreamGroupResponse
): UpstreamGroupApiResponse {
  return {
    id: group.id,
    name: group.name,
    provider: group.provider,
    strategy: group.strategy,
    health_check_interval: group.healthCheckInterval,
    health_check_timeout: group.healthCheckTimeout,
    is_active: group.isActive,
    config: group.config,
    created_at: group.createdAt.toISOString(),
    updated_at: group.updatedAt.toISOString(),
  };
}

/**
 * Transform paginated upstream group results to API response format.
 */
export function transformPaginatedUpstreamGroups(
  result: PaginatedUpstreamGroups
): PaginatedApiResponse<UpstreamGroupApiResponse> {
  return {
    items: result.items.map(transformUpstreamGroupToApi),
    total: result.total,
    page: result.page,
    page_size: result.pageSize,
    total_pages: result.totalPages,
  };
}

// ========== ApiKey API Response Types ==========

/**
 * API response format for API key (snake_case).
 * This matches the actual response format used by the API routes.
 */
export interface ApiKeyApiResponse {
  id: string;
  key_prefix: string;
  name: string;
  description: string | null;
  upstream_ids: string[];
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * API response format for newly created API key (snake_case).
 * Includes key_value which is only returned on creation.
 */
export interface ApiKeyCreateApiResponse extends ApiKeyApiResponse {
  key_value: string;
}

/**
 * API response format for revealed API key (snake_case).
 * Only includes essential fields for security.
 */
export interface ApiKeyRevealApiResponse {
  id: string;
  key_value: string;
  key_prefix: string;
  name: string;
}

// ========== ApiKey Transformers ==========

/**
 * Transform a service layer API key to API response format.
 * Converts camelCase properties to snake_case for API consistency.
 */
export function transformApiKeyToApi(apiKey: ApiKeyListItem): ApiKeyApiResponse {
  return {
    id: apiKey.id,
    key_prefix: apiKey.keyPrefix,
    name: apiKey.name,
    description: apiKey.description,
    upstream_ids: apiKey.upstreamIds,
    is_active: apiKey.isActive,
    expires_at: toISOStringOrNull(apiKey.expiresAt),
    created_at: apiKey.createdAt.toISOString(),
    updated_at: apiKey.updatedAt.toISOString(),
  };
}

/**
 * Transform a newly created API key to API response format.
 * Includes the full key value which is only available on creation.
 */
export function transformApiKeyCreateToApi(result: ApiKeyCreateResult): ApiKeyCreateApiResponse {
  return {
    id: result.id,
    key_value: result.keyValue,
    key_prefix: result.keyPrefix,
    name: result.name,
    description: result.description,
    upstream_ids: result.upstreamIds,
    is_active: result.isActive,
    expires_at: toISOStringOrNull(result.expiresAt),
    created_at: result.createdAt.toISOString(),
    updated_at: result.updatedAt.toISOString(),
  };
}

/**
 * Transform a revealed API key to API response format.
 * Only includes essential fields for security.
 */
export function transformApiKeyRevealToApi(result: ApiKeyRevealResult): ApiKeyRevealApiResponse {
  return {
    id: result.id,
    key_value: result.keyValue,
    key_prefix: result.keyPrefix,
    name: result.name,
  };
}

/**
 * Transform paginated API key results to API response format.
 */
export function transformPaginatedApiKeys(
  result: PaginatedApiKeys
): PaginatedApiResponse<ApiKeyApiResponse> {
  return {
    items: result.items.map(transformApiKeyToApi),
    total: result.total,
    page: result.page,
    page_size: result.pageSize,
    total_pages: result.totalPages,
  };
}

// ========== RequestLog API Response Types ==========

/**
 * API response format for request log (snake_case).
 * This matches the actual response format used by the API routes.
 */
export interface RequestLogApiResponse {
  id: string;
  api_key_id: string | null;
  upstream_id: string | null;
  upstream_name: string | null;
  method: string | null;
  path: string | null;
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  status_code: number | null;
  duration_ms: number | null;
  error_message: string | null;
  // Routing decision fields
  routing_type: string | null;
  group_name: string | null;
  lb_strategy: string | null;
  failover_attempts: number;
  failover_history: FailoverAttempt[] | null;
  created_at: string;
}

// ========== RequestLog Transformers ==========

/**
 * Transform a service layer request log to API response format.
 * Converts camelCase properties to snake_case for API consistency.
 */
export function transformRequestLogToApi(log: RequestLogResponse): RequestLogApiResponse {
  return {
    id: log.id,
    api_key_id: log.apiKeyId,
    upstream_id: log.upstreamId,
    upstream_name: log.upstreamName,
    method: log.method,
    path: log.path,
    model: log.model,
    prompt_tokens: log.promptTokens,
    completion_tokens: log.completionTokens,
    total_tokens: log.totalTokens,
    cached_tokens: log.cachedTokens,
    reasoning_tokens: log.reasoningTokens,
    cache_creation_tokens: log.cacheCreationTokens,
    cache_read_tokens: log.cacheReadTokens,
    status_code: log.statusCode,
    duration_ms: log.durationMs,
    error_message: log.errorMessage,
    // Routing decision fields
    routing_type: log.routingType,
    group_name: log.groupName,
    lb_strategy: log.lbStrategy,
    failover_attempts: log.failoverAttempts,
    failover_history: log.failoverHistory,
    created_at: log.createdAt.toISOString(),
  };
}

/**
 * Transform paginated request log results to API response format.
 */
export function transformPaginatedRequestLogs(
  result: PaginatedRequestLogs
): PaginatedApiResponse<RequestLogApiResponse> {
  return {
    items: result.items.map(transformRequestLogToApi),
    total: result.total,
    page: result.page,
    page_size: result.pageSize,
    total_pages: result.totalPages,
  };
}

// ========== Stats API Response Types ==========

/**
 * API response format for overview stats (snake_case).
 */
export interface StatsOverviewApiResponse {
  today_requests: number;
  avg_response_time_ms: number;
  total_tokens_today: number;
  success_rate_today: number;
}

/**
 * API response format for timeseries data point (snake_case).
 */
export interface TimeseriesDataPointApiResponse {
  timestamp: string;
  request_count: number;
  total_tokens: number;
  avg_duration_ms: number;
}

/**
 * API response format for upstream timeseries data (snake_case).
 */
export interface UpstreamTimeseriesApiResponse {
  upstream_id: string | null;
  upstream_name: string;
  data: TimeseriesDataPointApiResponse[];
}

/**
 * API response format for timeseries stats (snake_case).
 */
export interface StatsTimeseriesApiResponse {
  range: TimeRange;
  granularity: "hour" | "day";
  series: UpstreamTimeseriesApiResponse[];
}

/**
 * API response format for leaderboard API key item (snake_case).
 */
export interface LeaderboardApiKeyApiResponse {
  id: string;
  name: string;
  key_prefix: string;
  request_count: number;
  total_tokens: number;
}

/**
 * API response format for leaderboard upstream item (snake_case).
 */
export interface LeaderboardUpstreamApiResponse {
  id: string;
  name: string;
  provider: string;
  request_count: number;
  total_tokens: number;
}

/**
 * API response format for leaderboard model item (snake_case).
 */
export interface LeaderboardModelApiResponse {
  model: string;
  request_count: number;
  total_tokens: number;
}

/**
 * API response format for leaderboard stats (snake_case).
 */
export interface StatsLeaderboardApiResponse {
  range: TimeRange;
  api_keys: LeaderboardApiKeyApiResponse[];
  upstreams: LeaderboardUpstreamApiResponse[];
  models: LeaderboardModelApiResponse[];
}

// ========== Stats Transformers ==========

/**
 * Transform a service layer overview stats to API response format.
 * Converts camelCase properties to snake_case for API consistency.
 */
export function transformStatsOverviewToApi(stats: StatsOverview): StatsOverviewApiResponse {
  return {
    today_requests: stats.todayRequests,
    avg_response_time_ms: stats.avgResponseTimeMs,
    total_tokens_today: stats.totalTokensToday,
    success_rate_today: stats.successRateToday,
  };
}

/**
 * Transform a timeseries data point to API response format.
 */
export function transformTimeseriesDataPointToApi(
  dataPoint: TimeseriesDataPoint
): TimeseriesDataPointApiResponse {
  return {
    timestamp: dataPoint.timestamp.toISOString(),
    request_count: dataPoint.requestCount,
    total_tokens: dataPoint.totalTokens,
    avg_duration_ms: dataPoint.avgDurationMs,
  };
}

/**
 * Transform upstream timeseries data to API response format.
 */
export function transformUpstreamTimeseriesToApi(
  series: UpstreamTimeseriesData
): UpstreamTimeseriesApiResponse {
  return {
    upstream_id: series.upstreamId,
    upstream_name: series.upstreamName,
    data: series.data.map(transformTimeseriesDataPointToApi),
  };
}

/**
 * Transform a service layer timeseries stats to API response format.
 * Converts camelCase properties to snake_case for API consistency.
 */
export function transformStatsTimeseriesToApi(stats: StatsTimeseries): StatsTimeseriesApiResponse {
  return {
    range: stats.range,
    granularity: stats.granularity,
    series: stats.series.map(transformUpstreamTimeseriesToApi),
  };
}

/**
 * Transform a leaderboard API key item to API response format.
 */
export function transformLeaderboardApiKeyToApi(
  item: LeaderboardApiKeyItem
): LeaderboardApiKeyApiResponse {
  return {
    id: item.id,
    name: item.name,
    key_prefix: item.keyPrefix,
    request_count: item.requestCount,
    total_tokens: item.totalTokens,
  };
}

/**
 * Transform a leaderboard upstream item to API response format.
 */
export function transformLeaderboardUpstreamToApi(
  item: LeaderboardUpstreamItem
): LeaderboardUpstreamApiResponse {
  return {
    id: item.id,
    name: item.name,
    provider: item.provider,
    request_count: item.requestCount,
    total_tokens: item.totalTokens,
  };
}

/**
 * Transform a leaderboard model item to API response format.
 */
export function transformLeaderboardModelToApi(
  item: LeaderboardModelItem
): LeaderboardModelApiResponse {
  return {
    model: item.model,
    request_count: item.requestCount,
    total_tokens: item.totalTokens,
  };
}

/**
 * Transform a service layer leaderboard stats to API response format.
 * Converts camelCase properties to snake_case for API consistency.
 */
export function transformStatsLeaderboardToApi(
  stats: StatsLeaderboard
): StatsLeaderboardApiResponse {
  return {
    range: stats.range,
    api_keys: stats.apiKeys.map(transformLeaderboardApiKeyToApi),
    upstreams: stats.upstreams.map(transformLeaderboardUpstreamToApi),
    models: stats.models.map(transformLeaderboardModelToApi),
  };
}
