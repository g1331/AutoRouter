import { config } from "../utils/config";
import * as pgSchema from "./schema-pg";
import * as sqliteSchema from "./schema-sqlite";

const schema = (config.dbType === "sqlite" ? sqliteSchema : pgSchema) as typeof pgSchema;

export const apiKeys = schema.apiKeys;
export const upstreams = schema.upstreams;
export const upstreamHealth = schema.upstreamHealth;
export const apiKeyUpstreams = schema.apiKeyUpstreams;
export const circuitBreakerStates = schema.circuitBreakerStates;
export const requestLogs = schema.requestLogs;
export const compensationRules = schema.compensationRules;
export const billingModelPrices = schema.billingModelPrices;
export const billingManualPriceOverrides = schema.billingManualPriceOverrides;
export const billingPriceSyncHistory = schema.billingPriceSyncHistory;
export const requestBillingSnapshots = schema.requestBillingSnapshots;

export const apiKeysRelations = schema.apiKeysRelations;
export const upstreamsRelations = schema.upstreamsRelations;
export const upstreamHealthRelations = schema.upstreamHealthRelations;
export const circuitBreakerStatesRelations = schema.circuitBreakerStatesRelations;
export const apiKeyUpstreamsRelations = schema.apiKeyUpstreamsRelations;
export const requestLogsRelations = schema.requestLogsRelations;
export const requestBillingSnapshotsRelations = schema.requestBillingSnapshotsRelations;

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
