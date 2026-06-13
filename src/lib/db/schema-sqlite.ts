import { randomUUID } from "crypto";
import { index, integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import type {
  UpstreamModelCatalogEntry,
  UpstreamModelCatalogStatus,
  UpstreamModelDiscoveryConfig,
  UpstreamModelRule,
} from "@/lib/services/upstream-model-types";
import type { RouteCapability } from "@/lib/route-capabilities";

type UpstreamQueuePolicy = {
  enabled: boolean;
  timeout_ms: number;
  max_queue_length?: number | null;
};

type UpstreamFailureRuleConfig = {
  useGlobalRules: boolean;
};

type UpstreamFailureRuleMatch = {
  statusCodes?: number[] | null;
  errorTypes?: string[] | null;
  bodyPattern?: string | null;
  headerName?: string | null;
  headerPattern?: string | null;
};

/**
 * Platform users for the multi-user admin/member system.
 */
export const users = sqliteTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull().default("member"), // 'admin' | 'member'
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [index("users_role_idx").on(table.role)]
);

/**
 * API keys distributed to downstream clients.
 */
export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    keyHash: text("key_hash").notNull().unique(),
    keyValueEncrypted: text("key_value_encrypted"),
    keyPrefix: text("key_prefix").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    accessMode: text("access_mode").notNull().default("unrestricted"),
    allowedModels: text("allowed_models", { mode: "json" }).$type<string[] | null>(),
    spendingRules: text("spending_rules", { mode: "json" }).$type<
      | { period_type: "daily" | "monthly" | "rolling"; limit: number; period_hours?: number }[]
      | null
    >(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    // Mirror of schema-pg: records that the inactive state was imposed by an
    // admin. A member cannot re-enable a key while this is set.
    disabledByAdmin: integer("disabled_by_admin", { mode: "boolean" }).notNull().default(false),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("api_keys_key_hash_idx").on(table.keyHash),
    index("api_keys_is_active_idx").on(table.isActive),
    index("api_keys_user_id_idx").on(table.userId),
  ]
);

/**
 * AI service provider upstream configurations.
 */
export const upstreams = sqliteTable(
  "upstreams",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    name: text("name").notNull().unique(),
    baseUrl: text("base_url").notNull(),
    officialWebsiteUrl: text("official_website_url"),
    apiKeyEncrypted: text("api_key_encrypted").notNull(),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    timeout: integer("timeout").notNull().default(60),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    maxConcurrency: integer("max_concurrency"),
    config: text("config"), // JSON stored as text
    weight: integer("weight").notNull().default(1),
    priority: integer("priority").notNull().default(0),
    routeCapabilities: text("route_capabilities", { mode: "json" }).$type<string[] | null>(),
    allowedModels: text("allowed_models", { mode: "json" }).$type<string[] | null>(),
    modelRedirects: text("model_redirects", { mode: "json" }).$type<Record<
      string,
      string
    > | null>(),
    modelDiscovery: text("model_discovery", {
      mode: "json",
    }).$type<UpstreamModelDiscoveryConfig | null>(),
    modelCatalog: text("model_catalog", { mode: "json" }).$type<
      UpstreamModelCatalogEntry[] | null
    >(),
    modelCatalogUpdatedAt: integer("model_catalog_updated_at", { mode: "timestamp_ms" }),
    modelCatalogLastStatus: text(
      "model_catalog_last_status"
    ).$type<UpstreamModelCatalogStatus | null>(),
    modelCatalogLastError: text("model_catalog_last_error"),
    modelCatalogLastFailedAt: integer("model_catalog_last_failed_at", { mode: "timestamp_ms" }),
    modelRules: text("model_rules", { mode: "json" }).$type<UpstreamModelRule[] | null>(),
    queuePolicy: text("queue_policy", { mode: "json" }).$type<UpstreamQueuePolicy | null>(),
    failureRuleConfig: text("failure_rule_config", {
      mode: "json",
    }).$type<UpstreamFailureRuleConfig | null>(),
    affinityMigration: text("affinity_migration", { mode: "json" }).$type<{
      enabled: boolean;
      metric: "tokens" | "length";
      threshold: number;
    } | null>(), // Session affinity migration configuration
    billingInputMultiplier: real("billing_input_multiplier").notNull().default(1),
    billingOutputMultiplier: real("billing_output_multiplier").notNull().default(1),
    spendingRules: text("spending_rules", { mode: "json" }).$type<
      | { period_type: "daily" | "monthly" | "rolling"; limit: number; period_hours?: number }[]
      | null
    >(),
    // CLIProxyAPI 关联字段，仅 CLI OAuth 上游有值，普通上游为空。
    cliproxyInstanceId: text("cliproxy_instance_id").references(() => cliproxyInstances.id, {
      onDelete: "set null",
    }),
    cliproxyAuthFileName: text("cliproxy_auth_file_name"),
    cliproxyProvider: text("cliproxy_provider"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("upstreams_name_idx").on(table.name),
    index("upstreams_is_active_idx").on(table.isActive),
    index("upstreams_priority_idx").on(table.priority),
  ]
);

/**
 * Health status tracking for upstreams.
 */
export const upstreamHealth = sqliteTable(
  "upstream_health",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    upstreamId: text("upstream_id")
      .notNull()
      .unique()
      .references(() => upstreams.id, { onDelete: "cascade" }),
    isHealthy: integer("is_healthy", { mode: "boolean" }).notNull().default(true),
    lastCheckAt: integer("last_check_at", { mode: "timestamp_ms" }),
    lastSuccessAt: integer("last_success_at", { mode: "timestamp_ms" }),
    failureCount: integer("failure_count").notNull().default(0),
    latencyMs: integer("latency_ms"),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("upstream_health_upstream_id_idx").on(table.upstreamId),
    index("upstream_health_is_healthy_idx").on(table.isHealthy),
  ]
);

/**
 * Diagnostic probe results for upstream route capabilities and client profiles.
 */
export const upstreamProbeResults = sqliteTable(
  "upstream_probe_results",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    upstreamId: text("upstream_id")
      .notNull()
      .references(() => upstreams.id, { onDelete: "cascade" }),
    routeCapability: text("route_capability").$type<RouteCapability>().notNull(),
    clientProfile: text("client_profile").notNull(),
    probeTemplateId: text("probe_template_id").notNull(),
    probeKind: text("probe_kind").notNull(),
    status: text("status").notNull(),
    layer: text("layer").notNull(),
    success: integer("success", { mode: "boolean" }).notNull().default(false),
    latencyMs: integer("latency_ms"),
    firstByteLatencyMs: integer("first_byte_latency_ms"),
    completedLatencyMs: integer("completed_latency_ms"),
    statusCode: integer("status_code"),
    errorType: text("error_type"),
    errorMessage: text("error_message"),
    responseBody: text("response_body"),
    probeUrl: text("probe_url"),
    model: text("model"),
    checkedAt: integer("checked_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    unique("upstream_probe_results_identity_unique").on(
      table.upstreamId,
      table.routeCapability,
      table.clientProfile,
      table.probeTemplateId
    ),
    index("upstream_probe_results_upstream_id_idx").on(table.upstreamId),
    index("upstream_probe_results_status_idx").on(table.status),
    index("upstream_probe_results_checked_at_idx").on(table.checkedAt),
  ]
);

/**
 * Join table mapping API keys to authorized upstreams.
 */
export const apiKeyUpstreams = sqliteTable(
  "api_key_upstreams",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    apiKeyId: text("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    upstreamId: text("upstream_id")
      .notNull()
      .references(() => upstreams.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("api_key_upstreams_api_key_id_idx").on(table.apiKeyId),
    index("api_key_upstreams_upstream_id_idx").on(table.upstreamId),
    unique("uq_api_key_upstream").on(table.apiKeyId, table.upstreamId),
  ]
);

/**
 * Upstreams a user is allowed to authorize for self-service API keys.
 */
export const userUpstreams = sqliteTable(
  "user_upstreams",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    upstreamId: text("upstream_id")
      .notNull()
      .references(() => upstreams.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("user_upstreams_user_id_idx").on(table.userId),
    index("user_upstreams_upstream_id_idx").on(table.upstreamId),
    unique("uq_user_upstream").on(table.userId, table.upstreamId),
  ]
);

/**
 * Circuit breaker states for upstream health management.
 */
export const circuitBreakerStates = sqliteTable(
  "circuit_breaker_states",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    upstreamId: text("upstream_id")
      .notNull()
      .unique()
      .references(() => upstreams.id, { onDelete: "cascade" }),
    state: text("state").notNull().default("closed"), // 'closed' | 'open' | 'half_open'
    failureCount: integer("failure_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    lastFailureAt: integer("last_failure_at", { mode: "timestamp_ms" }),
    openedAt: integer("opened_at", { mode: "timestamp_ms" }),
    lastProbeAt: integer("last_probe_at", { mode: "timestamp_ms" }),
    config: text("config", { mode: "json" }).$type<{
      failureThreshold?: number;
      successThreshold?: number;
      openDuration?: number;
      probeInterval?: number;
      firstByteTimeout?: number;
      streamIdleTimeout?: number;
    } | null>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("circuit_breaker_states_upstream_id_idx").on(table.upstreamId),
    index("circuit_breaker_states_state_idx").on(table.state),
  ]
);

/**
 * Custom upstream failure rules that can suppress circuit-breaker failure counts.
 * upstream_id = NULL means a global rule; non-NULL means an upstream-local rule.
 */
export const upstreamFailureRules = sqliteTable(
  "upstream_failure_rules",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    upstreamId: text("upstream_id").references(() => upstreams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    priority: integer("priority").notNull().default(0),
    match: text("match", { mode: "json" }).$type<UpstreamFailureRuleMatch>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("upstream_failure_rules_upstream_id_idx").on(table.upstreamId),
    index("upstream_failure_rules_enabled_idx").on(table.enabled),
    index("upstream_failure_rules_priority_idx").on(table.priority),
  ]
);

/**
 * Request audit logs for analytics and billing.
 */
export const requestLogs = sqliteTable(
  "request_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    apiKeyId: text("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    apiKeyName: text("api_key_name"),
    apiKeyPrefix: text("api_key_prefix"),
    upstreamId: text("upstream_id").references(() => upstreams.id, { onDelete: "set null" }),
    method: text("method"),
    path: text("path"),
    model: text("model"),
    reasoningEffort: text("reasoning_effort"),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    cacheCreationTokens: integer("cache_creation_tokens").notNull().default(0),
    cacheCreation5mTokens: integer("cache_creation_5m_tokens").notNull().default(0),
    cacheCreation1hTokens: integer("cache_creation_1h_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    statusCode: integer("status_code"),
    durationMs: integer("duration_ms"),
    routingDurationMs: integer("routing_duration_ms"),
    errorMessage: text("error_message"),
    // Routing decision fields
    routingType: text("routing_type"), // 'direct' | 'provider_type' | 'tiered'
    groupName: text("group_name"), // Deprecated: kept for historical data
    lbStrategy: text("lb_strategy"), // Deprecated: kept for historical data
    priorityTier: integer("priority_tier"), // Priority tier of the selected upstream
    failoverAttempts: integer("failover_attempts").notNull().default(0), // Number of failover attempts
    failoverHistory: text("failover_history"), // JSON array of failover attempt records
    routingDecision: text("routing_decision"), // JSON object with complete routing decision info
    thinkingConfig: text("thinking_config"), // JSON object with normalized request thinking config
    // Session affinity fields
    sessionId: text("session_id"),
    affinityHit: integer("affinity_hit", { mode: "boolean" }).notNull().default(false),
    affinityMigrated: integer("affinity_migrated", { mode: "boolean" }).notNull().default(false),
    // Performance metrics fields
    ttftMs: integer("ttft_ms"),
    isStream: integer("is_stream", { mode: "boolean" }).notNull().default(false),
    // Header compensation fields
    sessionIdCompensated: integer("session_id_compensated", { mode: "boolean" })
      .notNull()
      .default(false),
    headerDiff: text("header_diff", { mode: "json" }).$type<{
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
    } | null>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("request_logs_api_key_id_idx").on(table.apiKeyId),
    index("request_logs_user_id_idx").on(table.userId),
    index("request_logs_upstream_id_idx").on(table.upstreamId),
    index("request_logs_created_at_idx").on(table.createdAt),
    index("request_logs_routing_type_idx").on(table.routingType),
  ]
);

/**
 * Runtime configuration for traffic recording.
 */
export const trafficRecordingSettings = sqliteTable("traffic_recording_settings", {
  id: text("id").primaryKey().default("default"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  mode: text("mode").notNull().default("failure"),
  redactSensitive: integer("redact_sensitive", { mode: "boolean" }).notNull().default(true),
  retentionDays: integer("retention_days").notNull().default(7),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
});

/**
 * Searchable index for recorded traffic fixture files.
 */
export const trafficRecordings = sqliteTable(
  "traffic_recordings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    requestLogId: text("request_log_id").references(() => requestLogs.id, {
      onDelete: "set null",
    }),
    apiKeyId: text("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    upstreamId: text("upstream_id").references(() => upstreams.id, { onDelete: "set null" }),
    method: text("method"),
    path: text("path"),
    model: text("model"),
    statusCode: integer("status_code"),
    outcome: text("outcome").notNull(),
    fixturePath: text("fixture_path").notNull().unique(),
    fixtureSizeBytes: integer("fixture_size_bytes").notNull().default(0),
    requestSizeBytes: integer("request_size_bytes").notNull().default(0),
    responseSizeBytes: integer("response_size_bytes").notNull().default(0),
    redacted: integer("redacted", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("traffic_recordings_request_log_id_idx").on(table.requestLogId),
    index("traffic_recordings_api_key_id_idx").on(table.apiKeyId),
    index("traffic_recordings_upstream_id_idx").on(table.upstreamId),
    index("traffic_recordings_status_code_idx").on(table.statusCode),
    index("traffic_recordings_model_idx").on(table.model),
    index("traffic_recordings_created_at_idx").on(table.createdAt),
  ]
);

/**
 * Synced model price catalog from external sources.
 */
export const billingModelPrices = sqliteTable(
  "billing_model_prices",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    model: text("model").notNull(),
    inputPricePerMillion: real("input_price_per_million").notNull(),
    outputPricePerMillion: real("output_price_per_million").notNull(),
    cacheReadInputPricePerMillion: real("cache_read_input_price_per_million"),
    cacheWriteInputPricePerMillion: real("cache_write_input_price_per_million"),
    maxInputTokens: integer("max_input_tokens"),
    maxOutputTokens: integer("max_output_tokens"),
    source: text("source").notNull(), // openrouter | litellm
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    syncedAt: integer("synced_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("billing_model_prices_model_idx").on(table.model),
    index("billing_model_prices_source_idx").on(table.source),
    unique("uq_billing_model_prices_model_source").on(table.model, table.source),
  ]
);

/**
 * Manual model price overrides from admin.
 */
export const billingManualPriceOverrides = sqliteTable(
  "billing_manual_price_overrides",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    model: text("model").notNull().unique(),
    inputPricePerMillion: real("input_price_per_million").notNull(),
    outputPricePerMillion: real("output_price_per_million").notNull(),
    cacheReadInputPricePerMillion: real("cache_read_input_price_per_million"),
    cacheWriteInputPricePerMillion: real("cache_write_input_price_per_million"),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [index("billing_manual_price_overrides_model_idx").on(table.model)]
);

/**
 * Tiered pricing rules for models with context-length-dependent pricing.
 * When a request's prompt token count exceeds threshold_input_tokens,
 * the tier's prices replace the base prices for cost calculation.
 */
export const billingTierRules = sqliteTable(
  "billing_tier_rules",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    model: text("model").notNull(),
    source: text("source").notNull(), // litellm | manual
    thresholdInputTokens: integer("threshold_input_tokens").notNull(),
    displayLabel: text("display_label"),
    inputPricePerMillion: real("input_price_per_million").notNull(),
    outputPricePerMillion: real("output_price_per_million").notNull(),
    cacheReadInputPricePerMillion: real("cache_read_input_price_per_million"),
    cacheWriteInputPricePerMillion: real("cache_write_input_price_per_million"),
    note: text("note"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("billing_tier_rules_model_idx").on(table.model),
    index("billing_tier_rules_source_idx").on(table.source),
    unique("uq_billing_tier_rules_model_source_threshold").on(
      table.model,
      table.source,
      table.thresholdInputTokens
    ),
  ]
);

/**
 * Price synchronization history for dashboard status.
 */
export const billingPriceSyncHistory = sqliteTable(
  "billing_price_sync_history",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    status: text("status").notNull(), // success | partial | failed
    source: text("source"), // openrouter | litellm | none
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    failureReason: text("failure_reason"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [index("billing_price_sync_history_created_at_idx").on(table.createdAt)]
);

/**
 * Persisted background synchronization task status.
 */
export const backgroundSyncTasks = sqliteTable(
  "background_sync_tasks",
  {
    taskName: text("task_name").primaryKey(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    intervalSeconds: integer("interval_seconds").notNull(),
    startupDelaySeconds: integer("startup_delay_seconds").notNull().default(0),
    lastStartedAt: integer("last_started_at", { mode: "timestamp_ms" }),
    lastFinishedAt: integer("last_finished_at", { mode: "timestamp_ms" }),
    lastSuccessAt: integer("last_success_at", { mode: "timestamp_ms" }),
    lastFailedAt: integer("last_failed_at", { mode: "timestamp_ms" }),
    lastStatus: text("last_status"),
    lastError: text("last_error"),
    lastDurationMs: integer("last_duration_ms"),
    lastSuccessCount: integer("last_success_count").notNull().default(0),
    lastFailureCount: integer("last_failure_count").notNull().default(0),
    nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("background_sync_tasks_enabled_idx").on(table.enabled),
    index("background_sync_tasks_next_run_at_idx").on(table.nextRunAt),
  ]
);

/**
 * Historical runs for background synchronization tasks.
 */
export const backgroundSyncTaskRuns = sqliteTable(
  "background_sync_task_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    taskName: text("task_name").notNull(),
    triggerType: text("trigger_type").notNull(),
    status: text("status").notNull(),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }).notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
    errorSummary: text("error_summary"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("background_sync_task_runs_task_name_idx").on(table.taskName),
    index("background_sync_task_runs_started_at_idx").on(table.startedAt),
    index("background_sync_task_runs_status_idx").on(table.status),
  ]
);

/**
 * Immutable billing snapshot for each request log row.
 */
export const requestBillingSnapshots = sqliteTable(
  "request_billing_snapshots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    requestLogId: text("request_log_id")
      .notNull()
      .unique()
      .references(() => requestLogs.id, { onDelete: "cascade" }),
    apiKeyId: text("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    upstreamId: text("upstream_id").references(() => upstreams.id, { onDelete: "set null" }),
    model: text("model"),
    billingStatus: text("billing_status").notNull(), // billed | unbilled
    unbillableReason: text("unbillable_reason"),
    priceSource: text("price_source"), // manual | openrouter | litellm
    baseInputPricePerMillion: real("base_input_price_per_million"),
    baseOutputPricePerMillion: real("base_output_price_per_million"),
    baseCacheReadInputPricePerMillion: real("base_cache_read_input_price_per_million"),
    baseCacheWriteInputPricePerMillion: real("base_cache_write_input_price_per_million"),
    matchedRuleType: text("matched_rule_type"),
    matchedRuleDisplayLabel: text("matched_rule_display_label"),
    appliedTierThreshold: integer("applied_tier_threshold"),
    modelMaxInputTokens: integer("model_max_input_tokens"),
    modelMaxOutputTokens: integer("model_max_output_tokens"),
    inputMultiplier: real("input_multiplier"),
    outputMultiplier: real("output_multiplier"),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    cacheReadCost: real("cache_read_cost"),
    cacheWriteCost: real("cache_write_cost"),
    finalCost: real("final_cost"),
    currency: text("currency").notNull().default("USD"),
    billedAt: integer("billed_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("request_billing_snapshots_request_log_id_idx").on(table.requestLogId),
    index("request_billing_snapshots_user_id_idx").on(table.userId),
    index("request_billing_snapshots_billing_status_idx").on(table.billingStatus),
    index("request_billing_snapshots_model_idx").on(table.model),
    index("request_billing_snapshots_created_at_idx").on(table.createdAt),
  ]
);

/**
 * Outbound header compensation rules.
 */
export const compensationRules = sqliteTable(
  "compensation_rules",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    name: text("name").notNull().unique(),
    isBuiltin: integer("is_builtin", { mode: "boolean" }).notNull().default(false),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    capabilities: text("capabilities", { mode: "json" }).$type<string[]>().notNull(),
    targetHeader: text("target_header").notNull(),
    sources: text("sources", { mode: "json" }).$type<string[]>().notNull(),
    mode: text("mode").notNull().default("missing_only"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [index("compensation_rules_enabled_idx").on(table.enabled)]
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  apiKeys: many(apiKeys),
  upstreams: many(userUpstreams),
}));

export const userUpstreamsRelations = relations(userUpstreams, ({ one }) => ({
  user: one(users, {
    fields: [userUpstreams.userId],
    references: [users.id],
  }),
  upstream: one(upstreams, {
    fields: [userUpstreams.upstreamId],
    references: [upstreams.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
  upstreams: many(apiKeyUpstreams),
  requestLogs: many(requestLogs),
}));

export const upstreamsRelations = relations(upstreams, ({ one, many }) => ({
  health: one(upstreamHealth, {
    fields: [upstreams.id],
    references: [upstreamHealth.upstreamId],
  }),
  probeResults: many(upstreamProbeResults),
  circuitBreaker: one(circuitBreakerStates, {
    fields: [upstreams.id],
    references: [circuitBreakerStates.upstreamId],
  }),
  failureRules: many(upstreamFailureRules),
  apiKeys: many(apiKeyUpstreams),
  requestLogs: many(requestLogs),
  requestBillingSnapshots: many(requestBillingSnapshots),
}));

export const upstreamHealthRelations = relations(upstreamHealth, ({ one }) => ({
  upstream: one(upstreams, {
    fields: [upstreamHealth.upstreamId],
    references: [upstreams.id],
  }),
}));

export const upstreamProbeResultsRelations = relations(upstreamProbeResults, ({ one }) => ({
  upstream: one(upstreams, {
    fields: [upstreamProbeResults.upstreamId],
    references: [upstreams.id],
  }),
}));

export const circuitBreakerStatesRelations = relations(circuitBreakerStates, ({ one }) => ({
  upstream: one(upstreams, {
    fields: [circuitBreakerStates.upstreamId],
    references: [upstreams.id],
  }),
}));

export const upstreamFailureRulesRelations = relations(upstreamFailureRules, ({ one }) => ({
  upstream: one(upstreams, {
    fields: [upstreamFailureRules.upstreamId],
    references: [upstreams.id],
  }),
}));

export const apiKeyUpstreamsRelations = relations(apiKeyUpstreams, ({ one }) => ({
  apiKey: one(apiKeys, {
    fields: [apiKeyUpstreams.apiKeyId],
    references: [apiKeys.id],
  }),
  upstream: one(upstreams, {
    fields: [apiKeyUpstreams.upstreamId],
    references: [upstreams.id],
  }),
}));

export const requestLogsRelations = relations(requestLogs, ({ one }) => ({
  apiKey: one(apiKeys, {
    fields: [requestLogs.apiKeyId],
    references: [apiKeys.id],
  }),
  upstream: one(upstreams, {
    fields: [requestLogs.upstreamId],
    references: [upstreams.id],
  }),
  billingSnapshot: one(requestBillingSnapshots, {
    fields: [requestLogs.id],
    references: [requestBillingSnapshots.requestLogId],
  }),
}));

export const trafficRecordingsRelations = relations(trafficRecordings, ({ one }) => ({
  requestLog: one(requestLogs, {
    fields: [trafficRecordings.requestLogId],
    references: [requestLogs.id],
  }),
  apiKey: one(apiKeys, {
    fields: [trafficRecordings.apiKeyId],
    references: [apiKeys.id],
  }),
  upstream: one(upstreams, {
    fields: [trafficRecordings.upstreamId],
    references: [upstreams.id],
  }),
}));

export const requestBillingSnapshotsRelations = relations(requestBillingSnapshots, ({ one }) => ({
  requestLog: one(requestLogs, {
    fields: [requestBillingSnapshots.requestLogId],
    references: [requestLogs.id],
  }),
  apiKey: one(apiKeys, {
    fields: [requestBillingSnapshots.apiKeyId],
    references: [apiKeys.id],
  }),
  upstream: one(upstreams, {
    fields: [requestBillingSnapshots.upstreamId],
    references: [upstreams.id],
  }),
}));

/**
 * CLIProxyAPI instances providing CLI OAuth upstream capability.
 */
export const cliproxyInstances = sqliteTable(
  "cliproxy_instances",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    name: text("name").notNull().unique(),
    // Runtime mode: "managed" (sidecar) or "external" (standalone service)
    mode: text("mode").notNull().default("managed"),
    baseUrl: text("base_url").notNull(), // Proxy forwarding base URL
    managementUrl: text("management_url").notNull(), // Management API base URL
    clientApiKeyEncrypted: text("client_api_key_encrypted").notNull(), // Fernet-encrypted
    managementKeyEncrypted: text("management_key_encrypted").notNull(), // Fernet-encrypted
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    description: text("description"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("cliproxy_instances_name_idx").on(table.name),
    index("cliproxy_instances_enabled_idx").on(table.enabled),
  ]
);

/**
 * Cached non-sensitive metadata of CLIProxyAPI OAuth accounts (auth-files).
 * OAuth token material is never stored here; it stays in CLIProxyAPI's auth-dir.
 */
export const cliproxyAuthAccounts = sqliteTable(
  "cliproxy_auth_accounts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    instanceId: text("instance_id")
      .notNull()
      .references(() => cliproxyInstances.id, { onDelete: "cascade" }),
    authFileName: text("auth_file_name").notNull(), // CLIProxyAPI auth-file name
    provider: text("provider").notNull(),
    email: text("email"),
    status: text("status"),
    disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
    prefix: text("prefix"),
    modelCount: integer("model_count").notNull().default(0),
    priority: integer("priority"),
    note: text("note"),
    // Non-sensitive field snapshot from auth-files response; never includes tokens.
    rawMetadata: text("raw_metadata", { mode: "json" }).$type<Record<string, unknown> | null>(),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    unique("cliproxy_auth_accounts_instance_file_unique").on(table.instanceId, table.authFileName),
    index("cliproxy_auth_accounts_instance_id_idx").on(table.instanceId),
  ]
);

export const cliproxyInstancesRelations = relations(cliproxyInstances, ({ many }) => ({
  authAccounts: many(cliproxyAuthAccounts),
}));

export const cliproxyAuthAccountsRelations = relations(cliproxyAuthAccounts, ({ one }) => ({
  instance: one(cliproxyInstances, {
    fields: [cliproxyAuthAccounts.instanceId],
    references: [cliproxyInstances.id],
  }),
}));

// Type exports
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type Upstream = typeof upstreams.$inferSelect;
export type NewUpstream = typeof upstreams.$inferInsert;
export type UpstreamHealth = typeof upstreamHealth.$inferSelect;
export type NewUpstreamHealth = typeof upstreamHealth.$inferInsert;
export type UpstreamProbeResult = typeof upstreamProbeResults.$inferSelect;
export type NewUpstreamProbeResult = typeof upstreamProbeResults.$inferInsert;
export type ApiKeyUpstream = typeof apiKeyUpstreams.$inferSelect;
export type NewApiKeyUpstream = typeof apiKeyUpstreams.$inferInsert;
export type RequestLog = typeof requestLogs.$inferSelect;
export type NewRequestLog = typeof requestLogs.$inferInsert;
export type TrafficRecordingSettings = typeof trafficRecordingSettings.$inferSelect;
export type NewTrafficRecordingSettings = typeof trafficRecordingSettings.$inferInsert;
export type TrafficRecording = typeof trafficRecordings.$inferSelect;
export type NewTrafficRecording = typeof trafficRecordings.$inferInsert;
export type CircuitBreakerState = typeof circuitBreakerStates.$inferSelect;
export type NewCircuitBreakerState = typeof circuitBreakerStates.$inferInsert;
export type UpstreamFailureRule = typeof upstreamFailureRules.$inferSelect;
export type NewUpstreamFailureRule = typeof upstreamFailureRules.$inferInsert;
export type BillingModelPrice = typeof billingModelPrices.$inferSelect;
export type NewBillingModelPrice = typeof billingModelPrices.$inferInsert;
export type BillingManualPriceOverride = typeof billingManualPriceOverrides.$inferSelect;
export type NewBillingManualPriceOverride = typeof billingManualPriceOverrides.$inferInsert;
export type BillingPriceSyncHistory = typeof billingPriceSyncHistory.$inferSelect;
export type NewBillingPriceSyncHistory = typeof billingPriceSyncHistory.$inferInsert;
export type BackgroundSyncTask = typeof backgroundSyncTasks.$inferSelect;
export type NewBackgroundSyncTask = typeof backgroundSyncTasks.$inferInsert;
export type BackgroundSyncTaskRun = typeof backgroundSyncTaskRuns.$inferSelect;
export type NewBackgroundSyncTaskRun = typeof backgroundSyncTaskRuns.$inferInsert;
export type RequestBillingSnapshot = typeof requestBillingSnapshots.$inferSelect;
export type NewRequestBillingSnapshot = typeof requestBillingSnapshots.$inferInsert;
export type CliproxyInstance = typeof cliproxyInstances.$inferSelect;
export type NewCliproxyInstance = typeof cliproxyInstances.$inferInsert;
export type CliproxyAuthAccount = typeof cliproxyAuthAccounts.$inferSelect;
export type NewCliproxyAuthAccount = typeof cliproxyAuthAccounts.$inferInsert;
