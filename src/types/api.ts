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
 * Provider type for routing and authentication
 */
export type ProviderType = "anthropic" | "openai" | "google" | "custom";
export type RouteCapability =
  | "anthropic_messages"
  | "codex_responses"
  | "openai_chat_compatible"
  | "openai_extended"
  | "gemini_native_generate"
  | "gemini_code_assist_internal";
export type RouteMatchSource = "path";

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
  open_duration?: number; // seconds
  probe_interval?: number; // seconds
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

export interface AffinityMigrationConfig {
  enabled: boolean;
  metric: "tokens" | "length";
  threshold: number;
}

export interface UpstreamCreate {
  name: string;
  base_url: string;
  api_key: string;
  description?: string | null;
  is_default?: boolean;
  timeout?: number;
  weight?: number; // Load balancing weight (default: 1)
  priority?: number; // Priority tier (default: 0, lower = higher priority)
  route_capabilities?: RouteCapability[] | null; // Path routing capability set
  allowed_models?: string[] | null; // List of supported model names
  model_redirects?: Record<string, string> | null; // Model name mapping
  circuit_breaker_config?: CircuitBreakerConfig | null; // Circuit breaker configuration
  affinity_migration?: AffinityMigrationConfig | null; // Session affinity migration configuration
  billing_input_multiplier?: number;
  billing_output_multiplier?: number;
  spending_limit?: number | null;
  spending_period_type?: "daily" | "monthly" | "rolling" | null;
  spending_period_hours?: number | null;
}

export interface UpstreamUpdate {
  name?: string;
  base_url?: string;
  api_key?: string; // 留空表示不更新
  description?: string | null;
  is_default?: boolean;
  timeout?: number;
  is_active?: boolean;
  weight?: number; // Load balancing weight
  priority?: number; // Priority tier (lower = higher priority)
  route_capabilities?: RouteCapability[] | null; // Path routing capability set
  allowed_models?: string[] | null; // List of supported model names
  model_redirects?: Record<string, string> | null; // Model name mapping
  circuit_breaker_config?: CircuitBreakerConfig | null; // Circuit breaker configuration
  affinity_migration?: AffinityMigrationConfig | null; // Session affinity migration configuration
  billing_input_multiplier?: number;
  billing_output_multiplier?: number;
  spending_limit?: number | null;
  spending_period_type?: "daily" | "monthly" | "rolling" | null;
  spending_period_hours?: number | null;
}

export interface UpstreamResponse {
  id: string; // UUID
  name: string;
  base_url: string;
  description: string | null;
  api_key_masked: string; // "sk-***1234"
  is_default: boolean;
  timeout: number;
  is_active: boolean;
  weight: number; // Load balancing weight
  priority: number; // Priority tier (lower = higher priority)
  health_status?: UpstreamHealthResponse | null; // Health status (populated when requested)
  circuit_breaker?: CircuitBreakerStatus | null; // Circuit breaker status
  route_capabilities: RouteCapability[]; // Path routing capability set
  allowed_models: string[] | null; // List of supported model names
  model_redirects: Record<string, string> | null; // Model name mapping
  affinity_migration: AffinityMigrationConfig | null; // Session affinity migration configuration
  billing_input_multiplier?: number;
  billing_output_multiplier?: number;
  spending_limit?: number | null;
  spending_period_type?: string | null;
  spending_period_hours?: number | null;
  created_at: string; // ISO 8601 date string
  updated_at: string; // ISO 8601 date string
}

// Type alias for convenience
export type Upstream = UpstreamResponse;

// ========== Upstream Quota 相关类型 ==========

export interface UpstreamQuotaStatus {
  upstream_id: string;
  upstream_name: string;
  current_spending: number;
  spending_limit: number;
  spending_period_type: string;
  spending_period_hours: number | null;
  percent_used: number;
  is_exceeded: boolean;
  resets_at: string | null;
  estimated_recovery_at: string | null;
}

export interface UpstreamQuotaStatusResponse {
  items: UpstreamQuotaStatus[];
}

/**
 * Request body for testing upstream connection before saving
 */
export interface TestUpstreamRequest {
  name?: string; // Optional name for the upstream
  route_capabilities: RouteCapability[];
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
  upstream_provider_type?: string;
  upstream_base_url?: string;
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
  response_headers?: Record<string, string>;
  response_body_text?: string | null;
  response_body_json?: unknown | null;
}

/**
 * Routing type for request logs
 */
export type RoutingType = "direct" | "provider_type" | "tiered";

/**
 * Circuit breaker state for routing decision log
 */
export type RoutingCircuitState = "closed" | "open" | "half_open";

/**
 * Routing decision type
 */
export type RoutingDecisionType = "provider_type" | "path_capability" | "group" | "none";

/**
 * Failure stage for request lifecycle diagnostics.
 */
export type RoutingFailureStage =
  | "auth_filter"
  | "candidate_selection"
  | "upstream_request"
  | "upstream_response"
  | "downstream_streaming";

/**
 * Candidate upstream in routing decision
 */
export interface RoutingCandidate {
  id: string;
  name: string;
  weight: number;
  circuit_state: RoutingCircuitState;
}

/**
 * Exclusion reason for routing decision
 */
export type ExclusionReason = "circuit_open" | "model_not_allowed" | "unhealthy";

/**
 * Excluded upstream in routing decision
 */
export interface RoutingExcluded {
  id: string;
  name: string;
  reason: ExclusionReason;
}

/**
 * Complete routing decision log stored in database
 */
export interface RoutingDecisionLog {
  // Model resolution
  original_model: string;
  resolved_model: string;
  model_redirect_applied: boolean;

  // Routing decision
  provider_type: string | null;
  routing_type: RoutingDecisionType;
  matched_route_capability?: RouteCapability | null;
  route_match_source?: RouteMatchSource | null;
  capability_candidates_count?: number | null;

  // Candidate upstreams (simplified, only key info)
  candidates: RoutingCandidate[];

  // Excluded upstreams
  excluded: RoutingExcluded[];

  // Statistics
  candidate_count: number;
  final_candidate_count: number;

  // Selection info
  selected_upstream_id: string | null;
  candidate_upstream_id?: string | null;
  actual_upstream_id?: string | null;
  did_send_upstream?: boolean;
  failure_stage?: RoutingFailureStage | null;
  selection_strategy: string; // lb_strategy
}

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
  routing_duration_ms: number | null;
  error_message: string | null;
  // Routing decision fields
  routing_type: RoutingType | null;
  group_name: string | null; // Deprecated: kept for historical data
  lb_strategy: string | null; // Deprecated: kept for historical data
  priority_tier: number | null; // Priority tier of the selected upstream
  failover_attempts: number;
  failover_history: FailoverAttempt[] | null;
  routing_decision: RoutingDecisionLog | null; // Complete routing decision info
  // Session affinity fields
  session_id: string | null;
  affinity_hit: boolean;
  affinity_migrated: boolean;
  // Performance metrics fields
  ttft_ms: number | null;
  is_stream: boolean;
  // Header compensation fields
  session_id_compensated: boolean;
  header_diff: {
    inbound_count: number;
    outbound_count: number;
    dropped: Array<{ header: string; value: string }>;
    auth_replaced: {
      header: string;
      inbound_value: string | null;
      outbound_value: string;
    } | null;
    compensated: Array<{ header: string; source: string; value: string }>;
    unchanged: Array<{ header: string; value: string }>;
  } | null;
  billing_status?: "billed" | "unbilled" | null;
  unbillable_reason?: string | null;
  price_source?: "manual" | "openrouter" | "litellm" | null;
  base_input_price_per_million?: number | null;
  base_output_price_per_million?: number | null;
  base_cache_read_input_price_per_million?: number | null;
  base_cache_write_input_price_per_million?: number | null;
  input_multiplier?: number | null;
  output_multiplier?: number | null;
  billed_input_tokens?: number | null;
  cache_read_cost?: number | null;
  cache_write_cost?: number | null;
  final_cost?: number | null;
  currency?: string | null;
  billed_at?: string | null;
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
export type PaginatedRequestLogsResponse = PaginatedResponse<RequestLogResponse>;

// ========== Billing 相关类型 ==========

export interface BillingSyncResponse {
  status: "success" | "partial" | "failed";
  source: "litellm" | null;
  success_count: number;
  failure_count: number;
  failure_reason: string | null;
  synced_at: string;
}

export interface BillingOverviewResponse {
  today_cost_usd: number;
  month_cost_usd: number;
  unresolved_model_count: number;
  latest_sync: BillingSyncResponse | null;
}

export interface BillingManualOverride {
  id: string;
  model: string;
  input_price_per_million: number;
  output_price_per_million: number;
  cache_read_input_price_per_million: number | null;
  cache_write_input_price_per_million: number | null;
  note: string | null;
  has_official_price?: boolean;
  created_at: string;
  updated_at: string;
}

export interface BillingCreateManualOverride {
  model: string;
  input_price_per_million: number;
  output_price_per_million: number;
  cache_read_input_price_per_million?: number | null;
  cache_write_input_price_per_million?: number | null;
  note?: string | null;
}

export interface BillingUpdateManualOverride {
  input_price_per_million?: number;
  output_price_per_million?: number;
  cache_read_input_price_per_million?: number | null;
  cache_write_input_price_per_million?: number | null;
  note?: string | null;
}

export interface BillingUnresolvedModel {
  model: string;
  occurrences: number;
  last_seen_at: string;
  last_upstream_id: string | null;
  last_upstream_name: string | null;
  has_manual_override: boolean;
}

export interface BillingUnresolvedModelsResponse {
  items: BillingUnresolvedModel[];
  total: number;
}

export interface BillingManualOverridesResponse {
  items: BillingManualOverride[];
  total: number;
}

export interface BillingResetManualOverridesResponse {
  deleted_count: number;
  missing_official_models: string[];
}

export interface BillingModelPrice {
  id: string;
  model: string;
  input_price_per_million: number;
  output_price_per_million: number;
  cache_read_input_price_per_million: number | null;
  cache_write_input_price_per_million: number | null;
  source: "litellm";
  is_active: boolean;
  synced_at: string;
  updated_at: string;
}

export type PaginatedBillingModelPricesResponse = PaginatedResponse<BillingModelPrice>;

export interface UpstreamBillingMultiplier {
  id: string;
  name: string;
  is_active: boolean;
  input_multiplier: number;
  output_multiplier: number;
}

export interface UpstreamBillingMultipliersResponse {
  items: UpstreamBillingMultiplier[];
  total: number;
}

export interface UpdateUpstreamBillingMultiplier {
  input_multiplier?: number;
  output_multiplier?: number;
}

export interface RecentBillingDetail {
  request_log_id: string;
  created_at: string;
  model: string | null;
  upstream_id: string | null;
  upstream_name: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  price_source: string | null;
  billing_status: "billed" | "unbilled";
  unbillable_reason: string | null;
  base_input_price_per_million: number | null;
  base_output_price_per_million: number | null;
  base_cache_read_input_price_per_million: number | null;
  base_cache_write_input_price_per_million: number | null;
  input_multiplier: number | null;
  output_multiplier: number | null;
  cache_read_cost: number | null;
  cache_write_cost: number | null;
  final_cost: number | null;
  currency: string;
}

export type PaginatedRecentBillingDetailsResponse = PaginatedResponse<RecentBillingDetail>;

// ========== 补偿规则相关类型 ==========

export interface CompensationRule {
  id: string;
  name: string;
  is_builtin: boolean;
  enabled: boolean;
  capabilities: string[];
  target_header: string;
  sources: string[];
  mode: string;
  created_at: string;
  updated_at: string;
}

export interface CompensationRuleCreate {
  name: string;
  enabled?: boolean;
  capabilities: string[];
  target_header: string;
  sources: string[];
  mode?: string;
}

export interface CompensationRuleUpdate {
  name?: string;
  enabled?: boolean;
  capabilities?: string[];
  target_header?: string;
  sources?: string[];
  mode?: string;
}

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
  avg_ttft_ms: number;
  cache_hit_rate: number;
}

export interface TimeseriesDataPoint {
  timestamp: string; // ISO 8601 date string
  request_count: number;
  total_tokens: number;
  avg_duration_ms: number;
  avg_ttft_ms?: number;
  avg_tps?: number;
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
  provider_type: string;
  request_count: number;
  total_tokens: number;
  avg_ttft_ms: number;
  avg_tps: number;
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
