/**
 * API 类型定义
 * 与后端 Pydantic schemas 保持一致
 */

// ========== API Key 相关类型 ==========

export interface APIKeyCreate {
  name: string;
  description?: string | null;
  upstream_ids: string[]; // UUID[]
  expires_at?: string | null; // ISO 8601 date string
}

export interface APIKeyUpdate {
  name?: string;
  description?: string | null;
  is_active?: boolean;
  expires_at?: string | null; // ISO 8601 date string
  upstream_ids?: string[]; // UUID[]
}

export interface APIKeyResponse {
  id: string; // UUID
  key_prefix: string;
  name: string;
  description: string | null;
  upstream_ids: string[]; // UUID[]
  is_active: boolean;
  expires_at: string | null; // ISO 8601 date string
  created_at: string; // ISO 8601 date string
  updated_at: string; // ISO 8601 date string
}

// Type alias for convenience
export type APIKey = APIKeyResponse;

export interface APIKeyCreateResponse extends APIKeyResponse {
  key_value: string; // 完整 key，仅在创建时返回一次
}

export interface APIKeyRevealResponse {
  id: string; // UUID
  key_value: string; // 完整解密后的 key
  key_prefix: string;
  name: string;
}

// ========== Load Balancing 相关类型 ==========

/**
 * Load balancer strategy for upstream groups
 */
export type LoadBalancerStrategy = "round_robin" | "weighted" | "least_connections";

/**
 * Supported AI provider types (for API compatibility)
 */
export type Provider = "openai" | "anthropic";

/**
 * Provider type for model-based routing
 */
export type ProviderType = "anthropic" | "openai" | "google" | "custom";

// ========== Upstream Group 相关类型 ==========

export interface UpstreamGroupCreate {
  name: string;
  provider: Provider;
  strategy?: LoadBalancerStrategy;
  health_check_interval?: number; // seconds (default: 30)
  health_check_timeout?: number; // seconds (default: 10)
  is_active?: boolean;
  config?: string | null; // JSON config
}

export interface UpstreamGroupUpdate {
  name?: string;
  provider?: Provider;
  strategy?: LoadBalancerStrategy;
  health_check_interval?: number;
  health_check_timeout?: number;
  is_active?: boolean;
  config?: string | null;
}

export interface UpstreamGroupResponse {
  id: string; // UUID
  name: string;
  provider: Provider;
  strategy: LoadBalancerStrategy;
  health_check_interval: number;
  health_check_timeout: number;
  is_active: boolean;
  config: string | null;
  upstream_count?: number; // Optional count of upstreams in group
  healthy_count?: number; // Optional count of healthy upstreams
  created_at: string; // ISO 8601 date string
  updated_at: string; // ISO 8601 date string
}

// Type alias for convenience
export type UpstreamGroup = UpstreamGroupResponse;

// ========== Upstream Health 相关类型 ==========

export interface UpstreamHealthResponse {
  id?: string; // UUID
  upstream_id: string; // UUID
  upstream_name?: string; // Optional upstream name for display
  is_healthy: boolean;
  last_check_at: string | null; // ISO 8601 date string
  last_success_at: string | null; // ISO 8601 date string
  failure_count: number;
  latency_ms: number | null;
  error_message: string | null;
}

// ========== Circuit Breaker 相关类型 ==========

export type CircuitBreakerState = "closed" | "open" | "half_open";

export interface CircuitBreakerConfig {
  failure_threshold?: number;
  success_threshold?: number;
  open_duration?: number; // milliseconds
  probe_interval?: number; // milliseconds
}

export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  failure_count: number;
  success_count: number;
  last_failure_at: string | null; // ISO 8601 date string
  opened_at: string | null; // ISO 8601 date string
  config: CircuitBreakerConfig | null;
}

export interface CircuitBreakerDetailResponse {
  id: string;
  upstream_id: string;
  upstream_name: string;
  state: CircuitBreakerState;
  failure_count: number;
  success_count: number;
  last_failure_at: string | null;
  opened_at: string | null;
  last_probe_at: string | null;
  config: CircuitBreakerConfig | null;
  created_at: string;
  updated_at: string;
}

// Type alias for convenience
export type UpstreamHealth = UpstreamHealthResponse;

// ========== Upstream 相关类型 ==========

export interface UpstreamCreate {
  name: string;
  provider: Provider;
  base_url: string;
  api_key: string;
  description?: string | null;
  is_default?: boolean;
  timeout?: number;
  group_id?: string | null; // UUID - optional group membership
  weight?: number; // Load balancing weight (default: 1)
  provider_type?: ProviderType | null; // Provider type for model-based routing
  allowed_models?: string[] | null; // List of supported model names
  model_redirects?: Record<string, string> | null; // Model name mapping
  circuit_breaker_config?: CircuitBreakerConfig | null; // Circuit breaker configuration
}

export interface UpstreamUpdate {
  name?: string;
  provider?: Provider;
  base_url?: string;
  api_key?: string; // 留空表示不更新
  description?: string | null;
  is_default?: boolean;
  timeout?: number;
  group_id?: string | null; // UUID - optional group membership (null to remove from group)
  weight?: number; // Load balancing weight
  provider_type?: ProviderType | null; // Provider type for model-based routing
  allowed_models?: string[] | null; // List of supported model names
  model_redirects?: Record<string, string> | null; // Model name mapping
  circuit_breaker_config?: CircuitBreakerConfig | null; // Circuit breaker configuration
}

export interface UpstreamResponse {
  id: string; // UUID
  name: string;
  provider: Provider;
  base_url: string;
  description: string | null;
  api_key_masked: string; // "sk-***1234"
  is_default: boolean;
  timeout: number;
  is_active: boolean;
  group_id: string | null; // UUID - group membership
  weight: number; // Load balancing weight
  group_name?: string | null; // Group name for display (populated when grouped)
  health_status?: UpstreamHealthResponse | null; // Health status (populated when requested)
  circuit_breaker?: CircuitBreakerStatus | null; // Circuit breaker status
  provider_type: ProviderType | null; // Provider type for model-based routing
  allowed_models: string[] | null; // List of supported model names
  model_redirects: Record<string, string> | null; // Model name mapping
  created_at: string; // ISO 8601 date string
  updated_at: string; // ISO 8601 date string
}

// Type alias for convenience
export type Upstream = UpstreamResponse;

/**
 * Request body for testing upstream connection before saving
 */
export interface TestUpstreamRequest {
  name?: string; // Optional name for the upstream
  provider: "openai" | "anthropic";
  base_url: string;
  api_key: string;
  timeout?: number; // Optional timeout in seconds (defaults to 10)
}

/**
 * Response from upstream connection test endpoint
 */
export interface TestUpstreamResponse {
  success: boolean; // Whether the test was successful
  message: string; // Human-readable status message
  latency_ms: number | null; // Response time in milliseconds (null if test failed before making request)
  status_code: number | null; // HTTP status code from the test request (null if network error)
  error_type?: "authentication" | "network" | "timeout" | "invalid_response" | "unknown"; // Error type for failed tests
  error_details?: string; // Detailed error message for debugging
  tested_at: string; // ISO 8601 date string of when the test was performed
}

// ========== Request Log 相关类型 ==========

/**
 * Failover attempt record in request log
 */
export interface FailoverAttempt {
  upstream_id: string;
  upstream_name: string;
  attempted_at: string; // ISO 8601 date string
  error_type:
    | "timeout"
    | "http_5xx"
    | "http_4xx"
    | "http_429"
    | "connection_error"
    | "circuit_open";
  error_message: string;
  status_code?: number | null;
}

/**
 * Routing type for request logs
 */
export type RoutingType = "direct" | "group" | "default";

export interface RequestLogResponse {
  id: string; // UUID
  api_key_id: string | null; // UUID
  upstream_id: string | null; // UUID
  upstream_name: string | null; // Upstream display name
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
  routing_type: RoutingType | null;
  group_name: string | null;
  lb_strategy: string | null;
  failover_attempts: number;
  failover_history: FailoverAttempt[] | null;
  created_at: string; // ISO 8601 date string
}

// Type alias for convenience
export type RequestLog = RequestLogResponse;

// ========== 分页相关类型 ==========

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export type PaginatedAPIKeysResponse = PaginatedResponse<APIKeyResponse>;
export type PaginatedUpstreamsResponse = PaginatedResponse<UpstreamResponse>;
export type PaginatedUpstreamGroupsResponse = PaginatedResponse<UpstreamGroupResponse>;
export type PaginatedRequestLogsResponse = PaginatedResponse<RequestLogResponse>;

// ========== 错误响应类型 ==========

export interface ErrorDetail {
  error: string;
  message: string;
  request_id?: string;
}

// ========== 统计相关类型 ==========

export type TimeRange = "today" | "7d" | "30d";

export interface StatsOverviewResponse {
  today_requests: number;
  avg_response_time_ms: number;
  total_tokens_today: number;
  success_rate_today: number;
}

export interface TimeseriesDataPoint {
  timestamp: string; // ISO 8601 date string
  request_count: number;
  total_tokens: number;
  avg_duration_ms: number;
}

export interface UpstreamTimeseriesData {
  upstream_id: string | null; // UUID
  upstream_name: string;
  data: TimeseriesDataPoint[];
}

export interface StatsTimeseriesResponse {
  range: string;
  granularity: string;
  series: UpstreamTimeseriesData[];
}

export interface LeaderboardAPIKeyItem {
  id: string; // UUID
  name: string;
  key_prefix: string;
  request_count: number;
  total_tokens: number;
}

export interface LeaderboardUpstreamItem {
  id: string; // UUID
  name: string;
  provider: string;
  request_count: number;
  total_tokens: number;
}

export interface LeaderboardModelItem {
  model: string;
  request_count: number;
  total_tokens: number;
}

export interface StatsLeaderboardResponse {
  range: string;
  api_keys: LeaderboardAPIKeyItem[];
  upstreams: LeaderboardUpstreamItem[];
  models: LeaderboardModelItem[];
}
