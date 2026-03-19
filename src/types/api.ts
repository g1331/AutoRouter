/**
 * API type definitions
 * Keep consistent with backend Pydantic schemas
 */

export type { RouteCapability, RouteMatchSource } from "@/lib/route-capabilities";
import type { RouteCapability, RouteMatchSource } from "@/lib/route-capabilities";

// ========== API Key Types ==========

export type APIKeyAccessMode = "unrestricted" | "restricted";

export interface APIKeyCreate {
  name: string;
  description?: string | null;
  access_mode?: APIKeyAccessMode;
  upstream_ids: string[]; // UUID[]
  expires_at?: string | null; // ISO 8601 date string
}

export interface APIKeyUpdate {
  name?: string;
  description?: string | null;
  is_active?: boolean;
  access_mode?: APIKeyAccessMode;
  expires_at?: string | null; // ISO 8601 date string
  upstream_ids?: string[]; // UUID[]
}

export interface APIKeyResponse {
  id: string; // UUID
  key_prefix: string;
  name: string;
  description: string | null;
  access_mode: APIKeyAccessMode;
  upstream_ids: string[]; // UUID[]
  is_active: boolean;
  expires_at: string | null; // ISO 8601 date string
  created_at: string; // ISO 8601 date string
  updated_at: string; // ISO 8601 date string
}

// Type alias for convenience
export type APIKey = APIKeyResponse;

export interface APIKeyCreateResponse extends APIKeyResponse {
  key_value: string; // Full key value, only returned on create
}

export interface APIKeyRevealResponse {
  id: string; // UUID
  key_value: string; // Full decrypted key value
  key_prefix: string;
  name: string;
}

// ========== Load Balancing Types ==========

/**
 * Provider type for routing and authentication
 */
export type ProviderType = "anthropic" | "openai" | "google" | "custom";

// ========== Upstream Health Types ==========

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

// ========== Circuit Breaker Types ==========

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

// ========== Upstream Types ==========

export interface AffinityMigrationConfig {
  enabled: boolean;
  metric: "tokens" | "length";
  threshold: number;
}

export interface UpstreamCreate {
  name: string;
  base_url: string;
  official_website_url?: string | null;
  api_key: string;
  description?: string | null;
  is_default?: boolean;
  timeout?: number;
  max_concurrency?: number | null;
  weight?: number; // Load balancing weight (default: 1)
  priority?: number; // Priority tier (default: 0, lower = higher priority)
  route_capabilities?: RouteCapability[] | null; // Path routing capability set
  allowed_models?: string[] | null; // List of supported model names
  model_redirects?: Record<string, string> | null; // Model name mapping
  circuit_breaker_config?: CircuitBreakerConfig | null; // Circuit breaker configuration
  affinity_migration?: AffinityMigrationConfig | null; // Session affinity migration configuration
  billing_input_multiplier?: number;
  billing_output_multiplier?: number;
  spending_rules?:
    | { period_type: "daily" | "monthly" | "rolling"; limit: number; period_hours?: number }[]
    | null;
}

export interface UpstreamUpdate {
  name?: string;
  base_url?: string;
  official_website_url?: string | null;
  api_key?: string; // Empty means do not update
  description?: string | null;
  is_default?: boolean;
  timeout?: number;
  is_active?: boolean;
  max_concurrency?: number | null;
  weight?: number; // Load balancing weight
  priority?: number; // Priority tier (lower = higher priority)
  route_capabilities?: RouteCapability[] | null; // Path routing capability set
  allowed_models?: string[] | null; // List of supported model names
  model_redirects?: Record<string, string> | null; // Model name mapping
  circuit_breaker_config?: CircuitBreakerConfig | null; // Circuit breaker configuration
  affinity_migration?: AffinityMigrationConfig | null; // Session affinity migration configuration
  billing_input_multiplier?: number;
  billing_output_multiplier?: number;
  spending_rules?:
    | { period_type: "daily" | "monthly" | "rolling"; limit: number; period_hours?: number }[]
    | null;
}

export interface UpstreamResponse {
  id: string; // UUID
  name: string;
  base_url: string;
  official_website_url?: string | null;
  description: string | null;
  api_key_masked: string; // "sk-***1234"
  is_default: boolean;
  timeout: number;
  is_active: boolean;
  current_concurrency?: number;
  max_concurrency?: number | null;
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
  spending_rules?:
    | { period_type: "daily" | "monthly" | "rolling"; limit: number; period_hours?: number }[]
    | null;
  last_used_at?: string | null;
  created_at: string; // ISO 8601 date string
  updated_at: string; // ISO 8601 date string
}

// Type alias for convenience
export type Upstream = UpstreamResponse;

// ========== Upstream Quota Types ==========

export interface UpstreamQuotaRuleStatus {
  period_type: "daily" | "monthly" | "rolling";
  period_hours: number | null;
  current_spending: number;
  spending_limit: number;
  percent_used: number;
  is_exceeded: boolean;
  resets_at: string | null;
  estimated_recovery_at: string | null;
}

export interface UpstreamQuotaStatus {
  upstream_id: string;
  upstream_name: string;
  is_exceeded: boolean;
  rules: UpstreamQuotaRuleStatus[];
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

// ========== Request Log Types ==========

export type FailoverErrorType =
  | "timeout"
  | "http_5xx"
  | "http_4xx"
  | "http_429"
  | "connection_error"
  | "circuit_open"
  | "concurrency_full";

export interface RoutingRetryReason {
  previous_upstream_id: string | null;
  previous_upstream_name: string | null;
  previous_error_type: FailoverErrorType | null;
  previous_error_message: string | null;
}

export type RoutingSelectionReasonCode =
  | "affinity_hit"
  | "affinity_migrated"
  | "weighted_selection"
  | "half_open_probe"
  | "single_candidate_remaining";

export interface RoutingSelectionReason {
  code: RoutingSelectionReasonCode;
  selected_upstream_id: string | null;
  selected_tier?: number | null;
  selected_circuit_state?: RoutingCircuitState | null;
  candidate_count?: number | null;
  final_candidate_count?: number | null;
  retry_reason?: RoutingRetryReason | null;
}

/**
 * Failover attempt record in request log
 */
export interface FailoverAttempt {
  upstream_id: string;
  upstream_name: string;
  upstream_provider_type?: string;
  upstream_base_url?: string;
  attempted_at: string; // ISO 8601 date string
  error_type: FailoverErrorType;
  error_message: string;
  status_code?: number | null;
  response_headers?: Record<string, string>;
  response_body_text?: string | null;
  response_body_json?: unknown | null;
  selection_reason?: RoutingSelectionReason | null;
  header_diff?: RequestLogResponse["header_diff"];
}

/**
 * Routing type for request logs
 */
export type RoutingType = "direct" | "provider_type" | "tiered";

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "enabled";

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
 * Derived request lifecycle status for log stage visualization.
 */
export type RequestLifecycleStatus =
  | "decision"
  | "requesting"
  | "completed_success"
  | "completed_failed"
  | "unknown";

/**
 * Aggregated upstream error summary for quick diagnostics.
 */
export interface UpstreamErrorSummary {
  status_code: number | null;
  error_type: FailoverAttempt["error_type"] | null;
  error_message: string | null;
  response_body_excerpt: string | null;
}

/**
 * Unified stage timing breakdown derived from request log metrics.
 */
export interface RequestStageTimings {
  total_ms: number | null;
  decision_ms: number | null;
  upstream_response_ms: number | null;
  first_token_ms: number | null;
  generation_ms: number | null;
  gateway_processing_ms: number | null;
}

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
export type ExclusionReason =
  | "circuit_open"
  | "model_not_allowed"
  | "unhealthy"
  | "concurrency_full";

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
  final_selection_reason?: RoutingSelectionReason | null;
  selection_strategy: string; // lb_strategy
}

export type RequestThinkingProvider = "openai" | "anthropic" | "google";
export type RequestThinkingProtocol =
  | "openai_responses"
  | "openai_chat"
  | "anthropic_messages"
  | "gemini_generate";
export type RequestThinkingMode = "reasoning" | "thinking" | "adaptive" | "manual";

export interface RequestThinkingConfig {
  provider: RequestThinkingProvider;
  protocol: RequestThinkingProtocol;
  mode: RequestThinkingMode;
  level: string | null;
  budget_tokens: number | null;
  include_thoughts: boolean | null;
  source_paths: string[];
}

export interface RequestLogResponse {
  id: string; // UUID
  api_key_id: string | null; // UUID
  upstream_id: string | null; // UUID
  upstream_name: string | null; // Upstream display name
  method: string | null;
  path: string | null;
  model: string | null;
  reasoning_effort?: ReasoningEffort | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
  cache_creation_tokens: number;
  cache_creation_5m_tokens: number;
  cache_creation_1h_tokens: number;
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
  thinking_config?: RequestThinkingConfig | null;
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
  lifecycle_status?: RequestLifecycleStatus;
  did_send_upstream?: boolean | null;
  failure_stage?: RoutingFailureStage | null;
  upstream_error?: UpstreamErrorSummary | null;
  stage_timings_ms?: RequestStageTimings | null;
  billing_status?: "billed" | "unbilled" | null;
  unbillable_reason?: string | null;
  price_source?: "manual" | "openrouter" | "litellm" | null;
  base_input_price_per_million?: number | null;
  base_output_price_per_million?: number | null;
  base_cache_read_input_price_per_million?: number | null;
  base_cache_write_input_price_per_million?: number | null;
  matched_rule_type?: "flat" | "tiered" | null;
  matched_rule_display_label?: string | null;
  applied_tier_threshold?: number | null;
  model_max_input_tokens?: number | null;
  model_max_output_tokens?: number | null;
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

// ========== Pagination Types ==========

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

// ========== Billing Types ==========

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
  max_input_tokens: number | null;
  max_output_tokens: number | null;
  synced_tier_rules: BillingTierRule[];
  source: "litellm";
  is_active: boolean;
  synced_at: string;
  updated_at: string;
}

export type PaginatedBillingModelPricesResponse = PaginatedResponse<BillingModelPrice>;

export interface BillingTierRule {
  id: string;
  model: string;
  source: "litellm" | "manual";
  threshold_input_tokens: number;
  display_label: string | null;
  input_price_per_million: number;
  output_price_per_million: number;
  cache_read_input_price_per_million: number | null;
  cache_write_input_price_per_million: number | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BillingTierRulesResponse {
  items: BillingTierRule[];
  total: number;
}

export interface BillingCreateTierRule {
  model: string;
  threshold_input_tokens: number;
  display_label?: string | null;
  input_price_per_million: number;
  output_price_per_million: number;
  cache_read_input_price_per_million?: number | null;
  cache_write_input_price_per_million?: number | null;
  note?: string | null;
}

export interface BillingUpdateTierRule {
  threshold_input_tokens?: number;
  display_label?: string | null;
  input_price_per_million?: number;
  output_price_per_million?: number;
  cache_read_input_price_per_million?: number | null;
  cache_write_input_price_per_million?: number | null;
  note?: string | null;
  is_active?: boolean;
}

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
  matched_rule_type: "flat" | "tiered" | null;
  matched_rule_display_label: string | null;
  applied_tier_threshold: number | null;
  model_max_input_tokens: number | null;
  model_max_output_tokens: number | null;
  input_multiplier: number | null;
  output_multiplier: number | null;
  cache_read_cost: number | null;
  cache_write_cost: number | null;
  final_cost: number | null;
  currency: string;
}

export type PaginatedRecentBillingDetailsResponse = PaginatedResponse<RecentBillingDetail>;

// ========== Header Compensation Types ==========

export interface CompensationRule {
  id: string;
  name: string;
  is_builtin: boolean;
  enabled: boolean;
  capabilities: RouteCapability[];
  target_header: string;
  sources: string[];
  mode: string;
  created_at: string;
  updated_at: string;
}

export interface CompensationRuleCreate {
  name: string;
  enabled?: boolean;
  capabilities: RouteCapability[];
  target_header: string;
  sources: string[];
  mode?: string;
}

export interface CompensationRuleUpdate {
  name?: string;
  enabled?: boolean;
  capabilities?: RouteCapability[];
  target_header?: string;
  sources?: string[];
  mode?: string;
}

// ========== Error Response Types ==========

export interface ErrorDetail {
  error: string;
  message: string;
  request_id?: string;
}

// ========== Statistics Types ==========

export type TimeRange = "today" | "7d" | "30d";

export interface DistributionItem {
  name: string;
  count: number;
}

export interface StatsOverviewResponse {
  today_requests: number;
  avg_response_time_ms: number;
  total_tokens_today: number;
  total_cost_today: number;
  success_rate_today: number;
  avg_ttft_ms: number;
  cache_hit_rate: number;
  yesterday_requests: number;
  yesterday_total_tokens: number;
  yesterday_cost_usd: number;
  yesterday_avg_response_time_ms: number;
  yesterday_avg_ttft_ms: number;
  yesterday_cache_hit_rate: number;
}

export interface TimeseriesDataPoint {
  timestamp: string; // ISO 8601 date string
  request_count: number;
  total_tokens: number;
  avg_duration_ms: number;
  avg_ttft_ms?: number;
  avg_tps?: number;
  total_cost?: number;
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
  total_cost_usd: number;
  model_distribution: DistributionItem[];
}

export interface LeaderboardUpstreamItem {
  id: string; // UUID
  name: string;
  provider_type: string;
  request_count: number;
  total_tokens: number;
  avg_ttft_ms: number;
  avg_tps: number;
  cache_hit_rate: number;
  total_cost_usd: number;
  model_distribution: DistributionItem[];
}

export interface LeaderboardModelItem {
  model: string;
  request_count: number;
  total_tokens: number;
  avg_ttft_ms: number;
  avg_tps: number;
  upstream_distribution: DistributionItem[];
}

export interface StatsLeaderboardResponse {
  range: string;
  api_keys: LeaderboardAPIKeyItem[];
  upstreams: LeaderboardUpstreamItem[];
  models: LeaderboardModelItem[];
}
