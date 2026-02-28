import {
  boolean,
  doublePrecision,
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * API keys distributed to downstream clients.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyHash: varchar("key_hash", { length: 128 }).notNull().unique(),
    keyValueEncrypted: text("key_value_encrypted"),
    keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    userId: uuid("user_id"), // Reserved for future user system
    isActive: boolean("is_active").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("api_keys_key_hash_idx").on(table.keyHash),
    index("api_keys_is_active_idx").on(table.isActive),
  ]
);

/**
 * AI service provider upstream configurations.
 */
export const upstreams = pgTable(
  "upstreams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 64 }).notNull().unique(),
    baseUrl: text("base_url").notNull(),
    apiKeyEncrypted: text("api_key_encrypted").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    timeout: integer("timeout").notNull().default(60),
    isActive: boolean("is_active").notNull().default(true),
    config: text("config"), // JSON stored as text
    weight: integer("weight").notNull().default(1),
    priority: integer("priority").notNull().default(0),
    routeCapabilities: json("route_capabilities").$type<string[] | null>(), // Path routing capabilities
    allowedModels: json("allowed_models").$type<string[] | null>(), // JSON array of supported model names
    modelRedirects: json("model_redirects").$type<Record<string, string> | null>(), // JSON object mapping incoming model to target model
    affinityMigration: json("affinity_migration").$type<{
      enabled: boolean;
      metric: "tokens" | "length";
      threshold: number;
    } | null>(), // Session affinity migration configuration
    billingInputMultiplier: doublePrecision("billing_input_multiplier").notNull().default(1),
    billingOutputMultiplier: doublePrecision("billing_output_multiplier").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
export const upstreamHealth = pgTable(
  "upstream_health",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    upstreamId: uuid("upstream_id")
      .notNull()
      .unique()
      .references(() => upstreams.id, { onDelete: "cascade" }),
    isHealthy: boolean("is_healthy").notNull().default(true),
    lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
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
export const apiKeyUpstreams = pgTable(
  "api_key_upstreams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apiKeyId: uuid("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    upstreamId: uuid("upstream_id")
      .notNull()
      .references(() => upstreams.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
export const circuitBreakerStates = pgTable(
  "circuit_breaker_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    upstreamId: uuid("upstream_id")
      .notNull()
      .unique()
      .references(() => upstreams.id, { onDelete: "cascade" }),
    state: varchar("state", { length: 16 }).notNull().default("closed"), // 'closed' | 'open' | 'half_open'
    failureCount: integer("failure_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    lastProbeAt: timestamp("last_probe_at", { withTimezone: true }),
    config: json("config").$type<{
      failureThreshold?: number;
      successThreshold?: number;
      openDuration?: number;
      probeInterval?: number;
    } | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("circuit_breaker_states_upstream_id_idx").on(table.upstreamId),
    index("circuit_breaker_states_state_idx").on(table.state),
  ]
);

/**
 * Request audit logs for analytics and billing.
 */
export const requestLogs = pgTable(
  "request_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    upstreamId: uuid("upstream_id").references(() => upstreams.id, { onDelete: "set null" }),
    method: varchar("method", { length: 10 }),
    path: text("path"),
    model: varchar("model", { length: 128 }),
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
    routingType: varchar("routing_type", { length: 16 }), // 'direct' | 'provider_type' | 'tiered'
    groupName: varchar("group_name", { length: 64 }), // Deprecated: kept for historical data
    lbStrategy: varchar("lb_strategy", { length: 32 }), // Deprecated: kept for historical data
    priorityTier: integer("priority_tier"), // Priority tier of the selected upstream
    failoverAttempts: integer("failover_attempts").notNull().default(0), // Number of failover attempts
    failoverHistory: text("failover_history"), // JSON array of failover attempt records
    routingDecision: text("routing_decision"), // JSON object with complete routing decision info
    // Session affinity fields
    sessionId: text("session_id"),
    affinityHit: boolean("affinity_hit").notNull().default(false),
    affinityMigrated: boolean("affinity_migrated").notNull().default(false),
    // Performance metrics fields
    ttftMs: integer("ttft_ms"),
    isStream: boolean("is_stream").notNull().default(false),
    // Header compensation fields
    sessionIdCompensated: boolean("session_id_compensated").notNull().default(false),
    headerDiff: json("header_diff").$type<{
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
export const billingModelPrices = pgTable(
  "billing_model_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    model: varchar("model", { length: 255 }).notNull(),
    inputPricePerMillion: doublePrecision("input_price_per_million").notNull(),
    outputPricePerMillion: doublePrecision("output_price_per_million").notNull(),
    source: varchar("source", { length: 32 }).notNull(), // openrouter | litellm
    isActive: boolean("is_active").notNull().default(true),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
export const billingManualPriceOverrides = pgTable(
  "billing_manual_price_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    model: varchar("model", { length: 255 }).notNull().unique(),
    inputPricePerMillion: doublePrecision("input_price_per_million").notNull(),
    outputPricePerMillion: doublePrecision("output_price_per_million").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("billing_manual_price_overrides_model_idx").on(table.model)]
);

/**
 * Price synchronization history for dashboard status.
 */
export const billingPriceSyncHistory = pgTable(
  "billing_price_sync_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: varchar("status", { length: 16 }).notNull(), // success | partial | failed
    source: varchar("source", { length: 32 }), // openrouter | litellm | none
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("billing_price_sync_history_created_at_idx").on(table.createdAt)]
);

/**
 * Immutable billing snapshot for each request log row.
 */
export const requestBillingSnapshots = pgTable(
  "request_billing_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestLogId: uuid("request_log_id")
      .notNull()
      .unique()
      .references(() => requestLogs.id, { onDelete: "cascade" }),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    upstreamId: uuid("upstream_id").references(() => upstreams.id, { onDelete: "set null" }),
    model: varchar("model", { length: 255 }),
    billingStatus: varchar("billing_status", { length: 16 }).notNull(), // billed | unbilled
    unbillableReason: varchar("unbillable_reason", { length: 64 }),
    priceSource: varchar("price_source", { length: 32 }), // manual | openrouter | litellm
    baseInputPricePerMillion: doublePrecision("base_input_price_per_million"),
    baseOutputPricePerMillion: doublePrecision("base_output_price_per_million"),
    inputMultiplier: doublePrecision("input_multiplier"),
    outputMultiplier: doublePrecision("output_multiplier"),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    finalCost: doublePrecision("final_cost"),
    currency: varchar("currency", { length: 8 }).notNull().default("USD"),
    billedAt: timestamp("billed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
export const compensationRules = pgTable(
  "compensation_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 128 }).notNull().unique(),
    isBuiltin: boolean("is_builtin").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
    capabilities: json("capabilities").$type<string[]>().notNull(),
    targetHeader: varchar("target_header", { length: 128 }).notNull(),
    sources: json("sources").$type<string[]>().notNull(),
    mode: varchar("mode", { length: 32 }).notNull().default("missing_only"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
