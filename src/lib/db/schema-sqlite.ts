import { randomUUID } from "crypto";
import { index, integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

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
    userId: text("user_id"), // Reserved for future user system
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("api_keys_key_hash_idx").on(table.keyHash),
    index("api_keys_is_active_idx").on(table.isActive),
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
    apiKeyEncrypted: text("api_key_encrypted").notNull(),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    timeout: integer("timeout").notNull().default(60),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    config: text("config"), // JSON stored as text
    weight: integer("weight").notNull().default(1),
    priority: integer("priority").notNull().default(0),
    routeCapabilities: text("route_capabilities", { mode: "json" }).$type<string[] | null>(),
    allowedModels: text("allowed_models", { mode: "json" }).$type<string[] | null>(),
    modelRedirects: text("model_redirects", { mode: "json" }).$type<Record<
      string,
      string
    > | null>(),
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
 * Request audit logs for analytics and billing.
 */
export const requestLogs = sqliteTable(
  "request_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    apiKeyId: text("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    upstreamId: text("upstream_id").references(() => upstreams.id, { onDelete: "set null" }),
    method: text("method"),
    path: text("path"),
    model: text("model"),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    cacheCreationTokens: integer("cache_creation_tokens").notNull().default(0),
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
    index("request_logs_upstream_id_idx").on(table.upstreamId),
    index("request_logs_created_at_idx").on(table.createdAt),
    index("request_logs_routing_type_idx").on(table.routingType),
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
    upstreamId: text("upstream_id").references(() => upstreams.id, { onDelete: "set null" }),
    model: text("model"),
    billingStatus: text("billing_status").notNull(), // billed | unbilled
    unbillableReason: text("unbillable_reason"),
    priceSource: text("price_source"), // manual | openrouter | litellm
    baseInputPricePerMillion: real("base_input_price_per_million"),
    baseOutputPricePerMillion: real("base_output_price_per_million"),
    baseCacheReadInputPricePerMillion: real("base_cache_read_input_price_per_million"),
    baseCacheWriteInputPricePerMillion: real("base_cache_write_input_price_per_million"),
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
export const apiKeysRelations = relations(apiKeys, ({ many }) => ({
  upstreams: many(apiKeyUpstreams),
  requestLogs: many(requestLogs),
}));

export const upstreamsRelations = relations(upstreams, ({ one, many }) => ({
  health: one(upstreamHealth, {
    fields: [upstreams.id],
    references: [upstreamHealth.upstreamId],
  }),
  circuitBreaker: one(circuitBreakerStates, {
    fields: [upstreams.id],
    references: [circuitBreakerStates.upstreamId],
  }),
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

export const circuitBreakerStatesRelations = relations(circuitBreakerStates, ({ one }) => ({
  upstream: one(upstreams, {
    fields: [circuitBreakerStates.upstreamId],
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

// Type exports
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type Upstream = typeof upstreams.$inferSelect;
export type NewUpstream = typeof upstreams.$inferInsert;
export type UpstreamHealth = typeof upstreamHealth.$inferSelect;
export type NewUpstreamHealth = typeof upstreamHealth.$inferInsert;
export type ApiKeyUpstream = typeof apiKeyUpstreams.$inferSelect;
export type NewApiKeyUpstream = typeof apiKeyUpstreams.$inferInsert;
export type RequestLog = typeof requestLogs.$inferSelect;
export type NewRequestLog = typeof requestLogs.$inferInsert;
export type CircuitBreakerState = typeof circuitBreakerStates.$inferSelect;
export type NewCircuitBreakerState = typeof circuitBreakerStates.$inferInsert;
export type BillingModelPrice = typeof billingModelPrices.$inferSelect;
export type NewBillingModelPrice = typeof billingModelPrices.$inferInsert;
export type BillingManualPriceOverride = typeof billingManualPriceOverrides.$inferSelect;
export type NewBillingManualPriceOverride = typeof billingManualPriceOverrides.$inferInsert;
export type BillingPriceSyncHistory = typeof billingPriceSyncHistory.$inferSelect;
export type NewBillingPriceSyncHistory = typeof billingPriceSyncHistory.$inferInsert;
export type RequestBillingSnapshot = typeof requestBillingSnapshots.$inferSelect;
export type NewRequestBillingSnapshot = typeof requestBillingSnapshots.$inferInsert;
