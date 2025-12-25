import {
  boolean,
  index,
  integer,
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
    provider: varchar("provider", { length: 32 }).notNull(),
    baseUrl: text("base_url").notNull(),
    apiKeyEncrypted: text("api_key_encrypted").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    timeout: integer("timeout").notNull().default(60),
    isActive: boolean("is_active").notNull().default(true),
    config: text("config"), // JSON stored as text
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("upstreams_name_idx").on(table.name),
    index("upstreams_is_active_idx").on(table.isActive),
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
    statusCode: integer("status_code"),
    durationMs: integer("duration_ms"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("request_logs_api_key_id_idx").on(table.apiKeyId),
    index("request_logs_upstream_id_idx").on(table.upstreamId),
    index("request_logs_created_at_idx").on(table.createdAt),
  ]
);

// Relations
export const apiKeysRelations = relations(apiKeys, ({ many }) => ({
  upstreams: many(apiKeyUpstreams),
  requestLogs: many(requestLogs),
}));

export const upstreamsRelations = relations(upstreams, ({ many }) => ({
  apiKeys: many(apiKeyUpstreams),
  requestLogs: many(requestLogs),
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
}));

// Type exports
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type Upstream = typeof upstreams.$inferSelect;
export type NewUpstream = typeof upstreams.$inferInsert;
export type ApiKeyUpstream = typeof apiKeyUpstreams.$inferSelect;
export type NewApiKeyUpstream = typeof apiKeyUpstreams.$inferInsert;
export type RequestLog = typeof requestLogs.$inferSelect;
export type NewRequestLog = typeof requestLogs.$inferInsert;
