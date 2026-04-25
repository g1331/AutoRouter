import type {
  UpstreamResponse as ServiceUpstreamResponse,
  PaginatedUpstreams,
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
  RequestThinkingConfig,
  ReasoningEffort,
  RouteCapability,
  RoutingDecisionLog,
  RoutingFailureStage,
  RequestLifecycleStatus,
  UpstreamQueuePolicy,
} from "@/types/api";
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
import type {
  BillingOverviewStats,
  UpstreamBillingMultiplierItem,
  PaginatedRecentBillingDetails,
  RecentBillingDetailItem,
} from "@/lib/services/billing-management-service";
import type {
  BillingSyncSummary,
  BillingManualPriceOverrideRecord,
  BillingUnresolvedModel,
  BillingModelPriceCatalogItem,
  PaginatedBillingModelPrices,
  BillingTierRuleRecord,
} from "@/lib/services/billing-price-service";

// ========== Helper Utilities ==========

/**
 * Convert a Date to ISO string, or return null if the date is null/undefined.
 */
export function toISOStringOrNull(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

// ========== Upstream API Response Types ==========

/**
 * API response format for circuit breaker status
 */
export interface UpstreamCircuitBreakerApiResponse {
  state: "closed" | "open" | "half_open";
  failure_count: number;
  success_count: number;
  last_failure_at: string | null;
  opened_at: string | null;
}

/**
 * API response format for upstream (snake_case).
 * This matches the actual response format used by the API routes.
 */
export interface UpstreamApiResponse {
  id: string;
  name: string;
  base_url: string;
  official_website_url: string | null;
  api_key_masked: string;
  is_default: boolean;
  timeout: number;
  is_active: boolean;
  current_concurrency: number;
  max_concurrency: number | null;
  queue_policy: UpstreamQueuePolicy | null;
  config: string | null;
  weight: number;
  priority: number;
  route_capabilities: RouteCapability[];
  allowed_models: string[] | null;
  model_redirects: Record<string, string> | null;
  model_discovery: {
    mode: import("@/types/api").UpstreamModelDiscoveryMode;
    custom_endpoint: string | null;
    enable_lite_llm_fallback: boolean;
  } | null;
  model_catalog:
    | {
        model: string;
        source: import("@/types/api").UpstreamModelCatalogSource;
      }[]
    | null;
  model_catalog_updated_at: string | null;
  model_catalog_last_status: import("@/types/api").UpstreamModelCatalogStatus | null;
  model_catalog_last_error: string | null;
  model_catalog_last_failed_at: string | null;
  model_rules:
    | {
        type: import("@/types/api").UpstreamModelRuleType;
        value: string;
        target_model: string | null;
        source: import("@/types/api").UpstreamModelRuleSource;
        display_label: string | null;
      }[]
    | null;
  affinity_migration: {
    enabled: boolean;
    metric: "tokens" | "length";
    threshold: number;
  } | null;
  billing_input_multiplier: number;
  billing_output_multiplier: number;
  spending_rules:
    | { period_type: "daily" | "monthly" | "rolling"; limit: number; period_hours?: number }[]
    | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  circuit_breaker: UpstreamCircuitBreakerApiResponse | null;
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

// ========== Upstream Transformers ==========

/**
 * Transform a service layer upstream response to API response format.
 * Converts camelCase properties to snake_case for API consistency.
 */
export function transformUpstreamToApi(upstream: ServiceUpstreamResponse): UpstreamApiResponse {
  return {
    id: upstream.id,
    name: upstream.name,
    base_url: upstream.baseUrl,
    official_website_url: upstream.officialWebsiteUrl ?? null,
    api_key_masked: upstream.apiKeyMasked,
    is_default: upstream.isDefault,
    timeout: upstream.timeout,
    is_active: upstream.isActive,
    current_concurrency: upstream.currentConcurrency,
    max_concurrency: upstream.maxConcurrency ?? null,
    queue_policy: upstream.queuePolicy ?? null,
    config: upstream.config,
    weight: upstream.weight,
    priority: upstream.priority,
    route_capabilities: upstream.routeCapabilities,
    allowed_models: upstream.allowedModels,
    model_redirects: upstream.modelRedirects,
    model_discovery: upstream.modelDiscovery
      ? {
          mode: upstream.modelDiscovery.mode,
          custom_endpoint: upstream.modelDiscovery.customEndpoint,
          enable_lite_llm_fallback: upstream.modelDiscovery.enableLiteLlmFallback,
        }
      : null,
    model_catalog:
      upstream.modelCatalog?.map((entry) => ({
        model: entry.model,
        source: entry.source,
      })) ?? null,
    model_catalog_updated_at: upstream.modelCatalogUpdatedAt?.toISOString() ?? null,
    model_catalog_last_status: upstream.modelCatalogLastStatus ?? null,
    model_catalog_last_error: upstream.modelCatalogLastError ?? null,
    model_catalog_last_failed_at: upstream.modelCatalogLastFailedAt?.toISOString() ?? null,
    model_rules:
      upstream.modelRules?.map((rule) => ({
        type: rule.type,
        value: rule.value,
        target_model: rule.targetModel,
        source: rule.source,
        display_label: rule.displayLabel,
      })) ?? null,
    affinity_migration: upstream.affinityMigration,
    billing_input_multiplier: upstream.billingInputMultiplier ?? 1,
    billing_output_multiplier: upstream.billingOutputMultiplier ?? 1,
    spending_rules: upstream.spendingRules ?? null,
    last_used_at: upstream.lastUsedAt?.toISOString() ?? null,
    created_at: upstream.createdAt.toISOString(),
    updated_at: upstream.updatedAt.toISOString(),
    circuit_breaker: upstream.circuitBreaker
      ? {
          state: upstream.circuitBreaker.state,
          failure_count: upstream.circuitBreaker.failureCount,
          success_count: upstream.circuitBreaker.successCount,
          last_failure_at: upstream.circuitBreaker.lastFailureAt?.toISOString() ?? null,
          opened_at: upstream.circuitBreaker.openedAt?.toISOString() ?? null,
        }
      : null,
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
  access_mode: "unrestricted" | "restricted";
  upstream_ids: string[];
  spending_rules:
    | { period_type: "daily" | "monthly" | "rolling"; limit: number; period_hours?: number }[]
    | null;
  spending_rule_statuses: {
    period_type: "daily" | "monthly" | "rolling";
    period_hours: number | null;
    current_spending: number;
    spending_limit: number;
    percent_used: number;
    is_exceeded: boolean;
    resets_at: string | null;
    estimated_recovery_at: string | null;
  }[];
  is_quota_exceeded: boolean;
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
    access_mode: apiKey.accessMode,
    upstream_ids: apiKey.upstreamIds,
    spending_rules: apiKey.spendingRules,
    spending_rule_statuses: apiKey.spendingRuleStatuses.map((rule) => ({
      period_type: rule.periodType,
      period_hours: rule.periodHours,
      current_spending: rule.currentSpending,
      spending_limit: rule.spendingLimit,
      percent_used: rule.percentUsed,
      is_exceeded: rule.isExceeded,
      resets_at: toISOStringOrNull(rule.resetsAt),
      estimated_recovery_at: toISOStringOrNull(rule.estimatedRecoveryAt),
    })),
    is_quota_exceeded: apiKey.isQuotaExceeded,
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
    access_mode: result.accessMode,
    upstream_ids: result.upstreamIds,
    spending_rules: result.spendingRules,
    spending_rule_statuses: result.spendingRuleStatuses.map((rule) => ({
      period_type: rule.periodType,
      period_hours: rule.periodHours,
      current_spending: rule.currentSpending,
      spending_limit: rule.spendingLimit,
      percent_used: rule.percentUsed,
      is_exceeded: rule.isExceeded,
      resets_at: toISOStringOrNull(rule.resetsAt),
      estimated_recovery_at: toISOStringOrNull(rule.estimatedRecoveryAt),
    })),
    is_quota_exceeded: result.isQuotaExceeded,
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
  api_key_name: string | null;
  api_key_prefix: string | null;
  upstream_id: string | null;
  upstream_name: string | null;
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
  routing_type: string | null;
  priority_tier: number | null;
  group_name: string | null; // Deprecated: kept for historical data
  lb_strategy: string | null; // Deprecated: kept for historical data
  failover_attempts: number;
  failover_history: FailoverAttempt[] | null;
  routing_decision: RoutingDecisionLog | null;
  thinking_config: RequestThinkingConfig | null;
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
  lifecycle_status: RequestLifecycleStatus;
  did_send_upstream: boolean | null;
  failure_stage: RoutingFailureStage | null;
  upstream_error: {
    status_code: number | null;
    error_type: FailoverAttempt["error_type"] | null;
    error_message: string | null;
    response_body_excerpt: string | null;
  } | null;
  stage_timings_ms: {
    total_ms: number | null;
    decision_ms: number | null;
    upstream_response_ms: number | null;
    first_token_ms: number | null;
    generation_ms: number | null;
    gateway_processing_ms: number | null;
  };
  billing_status?: "billed" | "unbilled" | null;
  unbillable_reason?: string | null;
  price_source?: string | null;
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
  created_at: string;
}

function maskSecretValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 6) return "***";
  return `${trimmed.slice(0, 3)}***${trimmed.slice(-3)}`;
}

function sanitizeAuthHeaderValue(value: string): string {
  const trimmed = value.trim();
  const firstSpaceIndex = trimmed.indexOf(" ");
  if (firstSpaceIndex === -1) return maskSecretValue(trimmed);
  const scheme = trimmed.slice(0, firstSpaceIndex).trim();
  const token = trimmed.slice(firstSpaceIndex + 1).trim();
  if (!token) return scheme;
  return `${scheme} ${maskSecretValue(token)}`;
}

function sanitizeHeaderValueForApi(headerNameLower: string, value: string): string {
  if (!value) return "";
  if (value.includes("***")) return value;
  switch (headerNameLower) {
    case "authorization":
    case "proxy-authorization":
      return sanitizeAuthHeaderValue(value);
    case "x-api-key":
    case "x-goog-api-key":
      return maskSecretValue(value);
    case "cookie":
    case "set-cookie":
      return "***";
    default:
      return value;
  }
}

function normalizeHeaderDiffForApi(
  input: unknown
): NonNullable<RequestLogApiResponse["header_diff"]> | null {
  if (!input || typeof input !== "object") return null;
  const data = input as Record<string, unknown>;

  const inbound_count = typeof data.inbound_count === "number" ? data.inbound_count : 0;
  const outbound_count = typeof data.outbound_count === "number" ? data.outbound_count : 0;

  const droppedRaw = data.dropped;
  const dropped: Array<{ header: string; value: string }> = Array.isArray(droppedRaw)
    ? droppedRaw
        .map((item) => {
          if (typeof item === "string") return { header: item, value: "" };
          if (!item || typeof item !== "object") return null;
          const header = (item as { header?: unknown }).header;
          const value = (item as { value?: unknown }).value;
          if (typeof header !== "string") return null;
          return { header, value: typeof value === "string" ? value : "" };
        })
        .filter((item): item is { header: string; value: string } => item !== null)
    : [];

  const compensatedRaw = data.compensated;
  const compensated: Array<{ header: string; source: string; value: string }> = Array.isArray(
    compensatedRaw
  )
    ? compensatedRaw
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const header = (item as { header?: unknown }).header;
          const source = (item as { source?: unknown }).source;
          const value = (item as { value?: unknown }).value;
          if (typeof header !== "string" || typeof source !== "string") return null;
          return { header, source, value: typeof value === "string" ? value : "" };
        })
        .filter((item): item is { header: string; source: string; value: string } => item !== null)
    : [];

  const unchangedRaw = data.unchanged;
  const unchanged: Array<{ header: string; value: string }> = Array.isArray(unchangedRaw)
    ? unchangedRaw
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const header = (item as { header?: unknown }).header;
          const value = (item as { value?: unknown }).value;
          if (typeof header !== "string") return null;
          return { header, value: typeof value === "string" ? value : "" };
        })
        .filter((item): item is { header: string; value: string } => item !== null)
    : [];

  const authReplacedRaw = data.auth_replaced;
  let auth_replaced: NonNullable<RequestLogApiResponse["header_diff"]>["auth_replaced"] = null;
  if (typeof authReplacedRaw === "string") {
    auth_replaced = { header: authReplacedRaw, inbound_value: null, outbound_value: "" };
  } else if (authReplacedRaw && typeof authReplacedRaw === "object") {
    const header = (authReplacedRaw as { header?: unknown }).header;
    const inbound_value = (authReplacedRaw as { inbound_value?: unknown }).inbound_value;
    const outbound_value = (authReplacedRaw as { outbound_value?: unknown }).outbound_value;
    if (typeof header === "string" && typeof outbound_value === "string") {
      auth_replaced = {
        header,
        inbound_value: typeof inbound_value === "string" ? inbound_value : null,
        outbound_value,
      };
    }
  }

  const sanitizeEntry = <T extends { header: string; value: string }>(entry: T): T => ({
    ...entry,
    value: sanitizeHeaderValueForApi(entry.header.toLowerCase(), entry.value),
  });

  const sanitizedAuthReplaced = auth_replaced
    ? {
        header: auth_replaced.header,
        inbound_value:
          auth_replaced.inbound_value === null
            ? null
            : sanitizeHeaderValueForApi(
                auth_replaced.header.toLowerCase(),
                auth_replaced.inbound_value
              ),
        outbound_value: sanitizeHeaderValueForApi(
          auth_replaced.header.toLowerCase(),
          auth_replaced.outbound_value
        ),
      }
    : null;

  return {
    inbound_count,
    outbound_count,
    dropped: dropped.map(sanitizeEntry),
    auth_replaced: sanitizedAuthReplaced,
    compensated: compensated.map((entry) => ({
      ...entry,
      value: sanitizeHeaderValueForApi(entry.header.toLowerCase(), entry.value),
    })),
    unchanged: unchanged.map(sanitizeEntry),
  };
}

// ========== RequestLog Transformers ==========

const MAX_UPSTREAM_ERROR_EXCERPT_CHARS = 2048;

function clampNonNegativeMs(value: number | null | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return Math.max(0, Math.trunc(value));
}

function deriveLifecycleStatus(
  statusCode: number | null,
  didSendUpstream: boolean | null
): RequestLifecycleStatus {
  if (typeof statusCode === "number") {
    if (statusCode >= 200 && statusCode < 300) {
      return "completed_success";
    }
    if (statusCode >= 400) {
      return "completed_failed";
    }
    return "unknown";
  }

  if (didSendUpstream === false) {
    return "decision";
  }
  if (didSendUpstream === true) {
    return "requesting";
  }
  return "unknown";
}

function getLastSentFailoverAttempt(
  failoverHistory: FailoverAttempt[] | null
): FailoverAttempt | null {
  if (!failoverHistory || failoverHistory.length === 0) {
    return null;
  }
  for (let index = failoverHistory.length - 1; index >= 0; index -= 1) {
    const attempt = failoverHistory[index];
    if (attempt.error_type !== "concurrency_full") {
      return attempt;
    }
  }
  return null;
}

function toUpstreamErrorExcerpt(
  responseBodyText: string | null | undefined,
  responseBodyJson: unknown
): string | null {
  if (typeof responseBodyText === "string" && responseBodyText.trim()) {
    return responseBodyText.slice(0, MAX_UPSTREAM_ERROR_EXCERPT_CHARS);
  }
  if (responseBodyJson == null) {
    return null;
  }
  try {
    return JSON.stringify(responseBodyJson).slice(0, MAX_UPSTREAM_ERROR_EXCERPT_CHARS);
  } catch {
    return null;
  }
}

function deriveUpstreamErrorSummary(
  failoverHistory: FailoverAttempt[] | null,
  didSendUpstream: boolean | null
): RequestLogApiResponse["upstream_error"] {
  if (didSendUpstream === false) {
    return null;
  }

  const attempt = getLastSentFailoverAttempt(failoverHistory);
  if (!attempt) {
    return null;
  }

  return {
    status_code: attempt.status_code ?? null,
    error_type: attempt.error_type ?? null,
    error_message: attempt.error_message ?? null,
    response_body_excerpt: toUpstreamErrorExcerpt(
      attempt.response_body_text ?? null,
      attempt.response_body_json ?? null
    ),
  };
}

function deriveStageTimings(
  log: RequestLogResponse,
  didSendUpstream: boolean | null
): RequestLogApiResponse["stage_timings_ms"] {
  const totalMs = clampNonNegativeMs(log.durationMs);
  const decisionMs = clampNonNegativeMs(log.routingDurationMs);
  const firstTokenMs = log.isStream ? clampNonNegativeMs(log.ttftMs) : null;

  let upstreamResponseMs: number | null = null;
  if (didSendUpstream === true && totalMs != null && decisionMs != null) {
    upstreamResponseMs = Math.max(0, totalMs - decisionMs);
  }

  let generationMs: number | null = null;
  if (log.isStream && upstreamResponseMs != null && firstTokenMs != null) {
    generationMs = Math.max(0, upstreamResponseMs - firstTokenMs);
  }

  let gatewayProcessingMs: number | null = null;
  if (didSendUpstream === false && totalMs != null) {
    gatewayProcessingMs = decisionMs != null ? Math.max(0, totalMs - decisionMs) : totalMs;
  }

  return {
    total_ms: totalMs,
    decision_ms: decisionMs,
    upstream_response_ms: didSendUpstream === true ? upstreamResponseMs : null,
    first_token_ms: firstTokenMs,
    generation_ms: generationMs,
    gateway_processing_ms: gatewayProcessingMs,
  };
}

/**
 * Transform a service layer request log to API response format.
 * Converts camelCase properties to snake_case for API consistency.
 */
export function transformRequestLogToApi(log: RequestLogResponse): RequestLogApiResponse {
  const hasBillingFields =
    log.billingStatus !== undefined ||
    log.unbillableReason !== undefined ||
    log.priceSource !== undefined ||
    log.baseInputPricePerMillion !== undefined ||
    log.baseOutputPricePerMillion !== undefined ||
    log.baseCacheReadInputPricePerMillion !== undefined ||
    log.baseCacheWriteInputPricePerMillion !== undefined ||
    log.matchedRuleType !== undefined ||
    log.matchedRuleDisplayLabel !== undefined ||
    log.appliedTierThreshold !== undefined ||
    log.modelMaxInputTokens !== undefined ||
    log.modelMaxOutputTokens !== undefined ||
    log.inputMultiplier !== undefined ||
    log.outputMultiplier !== undefined ||
    log.billedInputTokens !== undefined ||
    log.cacheReadCost !== undefined ||
    log.cacheWriteCost !== undefined ||
    log.finalCost !== undefined ||
    log.currency !== undefined ||
    log.billedAt !== undefined;
  const didSendUpstream =
    typeof log.routingDecision?.did_send_upstream === "boolean"
      ? log.routingDecision.did_send_upstream
      : null;
  const failureStage = log.routingDecision?.failure_stage ?? null;
  const lifecycleStatus = deriveLifecycleStatus(log.statusCode, didSendUpstream);
  const upstreamError = deriveUpstreamErrorSummary(log.failoverHistory, didSendUpstream);
  const stageTimings = deriveStageTimings(log, didSendUpstream);

  return {
    id: log.id,
    api_key_id: log.apiKeyId,
    api_key_name: log.apiKeyName,
    api_key_prefix: log.apiKeyPrefix,
    upstream_id: log.upstreamId,
    upstream_name: log.upstreamName,
    method: log.method,
    path: log.path,
    model: log.model,
    reasoning_effort: log.reasoningEffort ?? null,
    prompt_tokens: log.promptTokens,
    completion_tokens: log.completionTokens,
    total_tokens: log.totalTokens,
    cached_tokens: log.cachedTokens,
    reasoning_tokens: log.reasoningTokens,
    cache_creation_tokens: log.cacheCreationTokens,
    cache_creation_5m_tokens: log.cacheCreation5mTokens ?? 0,
    cache_creation_1h_tokens: log.cacheCreation1hTokens ?? 0,
    cache_read_tokens: log.cacheReadTokens,
    status_code: log.statusCode,
    duration_ms: log.durationMs,
    routing_duration_ms: log.routingDurationMs,
    error_message: log.errorMessage,
    // Routing decision fields
    routing_type: log.routingType,
    priority_tier: log.priorityTier,
    group_name: log.groupName,
    lb_strategy: log.lbStrategy,
    failover_attempts: log.failoverAttempts,
    failover_history: log.failoverHistory,
    routing_decision: log.routingDecision,
    thinking_config: log.thinkingConfig ?? null,
    session_id: log.sessionId,
    affinity_hit: log.affinityHit,
    affinity_migrated: log.affinityMigrated,
    ttft_ms: log.ttftMs,
    is_stream: log.isStream,
    session_id_compensated: log.sessionIdCompensated,
    header_diff: normalizeHeaderDiffForApi(log.headerDiff),
    lifecycle_status: lifecycleStatus,
    did_send_upstream: didSendUpstream,
    failure_stage: failureStage,
    upstream_error: upstreamError,
    stage_timings_ms: stageTimings,
    ...(hasBillingFields
      ? {
          billing_status: log.billingStatus,
          unbillable_reason: log.unbillableReason,
          price_source: log.priceSource,
          base_input_price_per_million: log.baseInputPricePerMillion,
          base_output_price_per_million: log.baseOutputPricePerMillion,
          base_cache_read_input_price_per_million: log.baseCacheReadInputPricePerMillion,
          base_cache_write_input_price_per_million: log.baseCacheWriteInputPricePerMillion,
          matched_rule_type: log.matchedRuleType,
          matched_rule_display_label: log.matchedRuleDisplayLabel,
          applied_tier_threshold: log.appliedTierThreshold,
          model_max_input_tokens: log.modelMaxInputTokens,
          model_max_output_tokens: log.modelMaxOutputTokens,
          input_multiplier: log.inputMultiplier,
          output_multiplier: log.outputMultiplier,
          billed_input_tokens: log.billedInputTokens,
          cache_read_cost: log.cacheReadCost,
          cache_write_cost: log.cacheWriteCost,
          final_cost: log.finalCost,
          currency: log.currency,
          billed_at: toISOStringOrNull(log.billedAt),
        }
      : {}),
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

// ========== Billing API Response Types ==========

export interface BillingOverviewApiResponse {
  today_cost_usd: number;
  month_cost_usd: number;
  unresolved_model_count: number;
  latest_sync: BillingSyncApiResponse | null;
}

export interface BillingSyncApiResponse {
  status: "success" | "partial" | "failed";
  source: "litellm" | null;
  success_count: number;
  failure_count: number;
  failure_reason: string | null;
  synced_at: string;
}

export interface BillingManualOverrideApiResponse {
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

export interface BillingUnresolvedModelApiResponse {
  model: string;
  occurrences: number;
  last_seen_at: string;
  last_upstream_id: string | null;
  last_upstream_name: string | null;
  has_manual_override: boolean;
}

export interface UpstreamBillingMultiplierApiResponse {
  id: string;
  name: string;
  is_active: boolean;
  input_multiplier: number;
  output_multiplier: number;
}

export interface RecentBillingDetailApiResponse {
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

export interface BillingModelPriceApiResponse {
  id: string;
  model: string;
  input_price_per_million: number;
  output_price_per_million: number;
  cache_read_input_price_per_million: number | null;
  cache_write_input_price_per_million: number | null;
  max_input_tokens: number | null;
  max_output_tokens: number | null;
  synced_tier_rules: BillingTierRuleApiResponse[];
  source: "litellm";
  is_active: boolean;
  synced_at: string;
  updated_at: string;
}

export interface BillingTierRuleApiResponse {
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

export function transformBillingTierRuleToApi(
  item: BillingTierRuleRecord
): BillingTierRuleApiResponse {
  return {
    id: item.id,
    model: item.model,
    source: item.source,
    threshold_input_tokens: item.thresholdInputTokens,
    display_label: item.displayLabel,
    input_price_per_million: item.inputPricePerMillion,
    output_price_per_million: item.outputPricePerMillion,
    cache_read_input_price_per_million: item.cacheReadInputPricePerMillion,
    cache_write_input_price_per_million: item.cacheWriteInputPricePerMillion,
    note: item.note,
    is_active: item.isActive,
    created_at: item.createdAt.toISOString(),
    updated_at: item.updatedAt.toISOString(),
  };
}

export function transformBillingSyncToApi(sync: BillingSyncSummary): BillingSyncApiResponse {
  return {
    status: sync.status,
    source: sync.source,
    success_count: sync.successCount,
    failure_count: sync.failureCount,
    failure_reason: sync.failureReason,
    synced_at: sync.syncedAt.toISOString(),
  };
}

export function transformBillingOverviewToApi(
  stats: BillingOverviewStats
): BillingOverviewApiResponse {
  return {
    today_cost_usd: stats.todayCostUsd,
    month_cost_usd: stats.monthCostUsd,
    unresolved_model_count: stats.unresolvedModelCount,
    latest_sync: stats.latestSync ? transformBillingSyncToApi(stats.latestSync) : null,
  };
}

export function transformBillingManualOverrideToApi(
  override: BillingManualPriceOverrideRecord
): BillingManualOverrideApiResponse {
  return {
    id: override.id,
    model: override.model,
    input_price_per_million: override.inputPricePerMillion,
    output_price_per_million: override.outputPricePerMillion,
    cache_read_input_price_per_million: override.cacheReadInputPricePerMillion,
    cache_write_input_price_per_million: override.cacheWriteInputPricePerMillion,
    note: override.note,
    has_official_price: override.hasOfficialPrice,
    created_at: override.createdAt.toISOString(),
    updated_at: override.updatedAt.toISOString(),
  };
}

export function transformBillingUnresolvedModelToApi(
  model: BillingUnresolvedModel
): BillingUnresolvedModelApiResponse {
  return {
    model: model.model,
    occurrences: model.occurrences,
    last_seen_at: model.lastSeenAt.toISOString(),
    last_upstream_id: model.lastUpstreamId,
    last_upstream_name: model.lastUpstreamName,
    has_manual_override: model.hasManualOverride,
  };
}

export function transformUpstreamBillingMultiplierToApi(
  item: UpstreamBillingMultiplierItem
): UpstreamBillingMultiplierApiResponse {
  return {
    id: item.id,
    name: item.name,
    is_active: item.isActive,
    input_multiplier: item.inputMultiplier,
    output_multiplier: item.outputMultiplier,
  };
}

export function transformRecentBillingDetailToApi(
  item: RecentBillingDetailItem
): RecentBillingDetailApiResponse {
  return {
    request_log_id: item.requestLogId,
    created_at: item.createdAt.toISOString(),
    model: item.model,
    upstream_id: item.upstreamId,
    upstream_name: item.upstreamName,
    prompt_tokens: item.promptTokens,
    completion_tokens: item.completionTokens,
    total_tokens: item.totalTokens,
    cache_read_tokens: item.cacheReadTokens,
    cache_write_tokens: item.cacheWriteTokens,
    price_source: item.priceSource,
    billing_status: item.billingStatus,
    unbillable_reason: item.unbillableReason,
    base_input_price_per_million: item.baseInputPricePerMillion,
    base_output_price_per_million: item.baseOutputPricePerMillion,
    base_cache_read_input_price_per_million: item.baseCacheReadInputPricePerMillion,
    base_cache_write_input_price_per_million: item.baseCacheWriteInputPricePerMillion,
    matched_rule_type: item.matchedRuleType,
    matched_rule_display_label: item.matchedRuleDisplayLabel,
    applied_tier_threshold: item.appliedTierThreshold,
    model_max_input_tokens: item.modelMaxInputTokens,
    model_max_output_tokens: item.modelMaxOutputTokens,
    input_multiplier: item.inputMultiplier,
    output_multiplier: item.outputMultiplier,
    cache_read_cost: item.cacheReadCost,
    cache_write_cost: item.cacheWriteCost,
    final_cost: item.finalCost,
    currency: item.currency,
  };
}

export function transformBillingModelPriceToApi(
  item: BillingModelPriceCatalogItem
): BillingModelPriceApiResponse {
  return {
    id: item.id,
    model: item.model,
    input_price_per_million: item.inputPricePerMillion,
    output_price_per_million: item.outputPricePerMillion,
    cache_read_input_price_per_million: item.cacheReadInputPricePerMillion,
    cache_write_input_price_per_million: item.cacheWriteInputPricePerMillion,
    max_input_tokens: item.maxInputTokens,
    max_output_tokens: item.maxOutputTokens,
    synced_tier_rules: item.syncedTierRules.map(transformBillingTierRuleToApi),
    source: item.source,
    is_active: item.isActive,
    synced_at: item.syncedAt.toISOString(),
    updated_at: item.updatedAt.toISOString(),
  };
}

export function transformPaginatedBillingModelPrices(
  result: PaginatedBillingModelPrices
): PaginatedApiResponse<BillingModelPriceApiResponse> {
  return {
    items: result.items.map(transformBillingModelPriceToApi),
    total: result.total,
    page: result.page,
    page_size: result.pageSize,
    total_pages: result.totalPages,
  };
}

export function transformPaginatedRecentBillingDetails(
  result: PaginatedRecentBillingDetails
): PaginatedApiResponse<RecentBillingDetailApiResponse> {
  return {
    items: result.items.map(transformRecentBillingDetailToApi),
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

/**
 * API response format for timeseries data point (snake_case).
 */
export interface TimeseriesDataPointApiResponse {
  timestamp: string;
  request_count: number;
  total_tokens: number;
  avg_duration_ms: number;
  avg_ttft_ms?: number;
  avg_tps?: number;
  total_cost?: number;
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
  range: TimeRange | "custom";
  granularity: "hour" | "day";
  series: UpstreamTimeseriesApiResponse[];
  total_series: TimeseriesDataPointApiResponse[];
}

export interface DistributionItemApiResponse {
  name: string;
  count: number;
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
  total_cost_usd: number;
  model_distribution: DistributionItemApiResponse[];
}

/**
 * API response format for leaderboard upstream item (snake_case).
 */
export interface LeaderboardUpstreamApiResponse {
  id: string;
  name: string;
  provider_type: string;
  request_count: number;
  total_tokens: number;
  avg_ttft_ms: number;
  avg_tps: number;
  cache_hit_rate: number;
  total_cost_usd: number;
  model_distribution: DistributionItemApiResponse[];
}

/**
 * API response format for leaderboard model item (snake_case).
 */
export interface LeaderboardModelApiResponse {
  model: string;
  request_count: number;
  total_tokens: number;
  avg_ttft_ms: number;
  avg_tps: number;
  upstream_distribution: DistributionItemApiResponse[];
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
    total_cost_today: stats.totalCostToday,
    success_rate_today: stats.successRateToday,
    avg_ttft_ms: stats.avgTtftMs,
    cache_hit_rate: stats.cacheHitRate,
    yesterday_requests: stats.yesterdayRequests,
    yesterday_total_tokens: stats.yesterdayTotalTokens,
    yesterday_cost_usd: stats.yesterdayCostUsd,
    yesterday_avg_response_time_ms: stats.yesterdayAvgResponseTimeMs,
    yesterday_avg_ttft_ms: stats.yesterdayAvgTtftMs,
    yesterday_cache_hit_rate: stats.yesterdayCacheHitRate,
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
    ...(dataPoint.avgTtftMs !== undefined ? { avg_ttft_ms: dataPoint.avgTtftMs } : {}),
    ...(dataPoint.avgTps !== undefined ? { avg_tps: dataPoint.avgTps } : {}),
    ...(dataPoint.totalCost !== undefined ? { total_cost: dataPoint.totalCost } : {}),
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
    total_series: (stats.totalSeries ?? []).map(transformTimeseriesDataPointToApi),
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
    total_cost_usd: item.totalCostUsd,
    model_distribution: item.modelDistribution,
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
    provider_type: item.providerType,
    request_count: item.requestCount,
    total_tokens: item.totalTokens,
    avg_ttft_ms: item.avgTtftMs,
    avg_tps: item.avgTps,
    cache_hit_rate: item.cacheHitRate,
    total_cost_usd: item.totalCostUsd,
    model_distribution: item.modelDistribution,
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
    avg_ttft_ms: item.avgTtftMs,
    avg_tps: item.avgTps,
    upstream_distribution: item.upstreamDistribution,
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
