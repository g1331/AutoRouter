import { config } from "../utils/config";
import * as pgSchema from "./schema-pg";
import * as sqliteSchema from "./schema-sqlite";

const schema = (config.dbType === "sqlite" ? sqliteSchema : pgSchema) as typeof pgSchema;

export const apiKeys = schema.apiKeys;
export const upstreamGroups = schema.upstreamGroups;
export const upstreams = schema.upstreams;
export const upstreamHealth = schema.upstreamHealth;
export const apiKeyUpstreams = schema.apiKeyUpstreams;
export const circuitBreakerStates = schema.circuitBreakerStates;
export const requestLogs = schema.requestLogs;

export const apiKeysRelations = schema.apiKeysRelations;
export const upstreamGroupsRelations = schema.upstreamGroupsRelations;
export const upstreamsRelations = schema.upstreamsRelations;
export const upstreamHealthRelations = schema.upstreamHealthRelations;
export const circuitBreakerStatesRelations = schema.circuitBreakerStatesRelations;
export const apiKeyUpstreamsRelations = schema.apiKeyUpstreamsRelations;
export const requestLogsRelations = schema.requestLogsRelations;

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type UpstreamGroup = typeof upstreamGroups.$inferSelect;
export type NewUpstreamGroup = typeof upstreamGroups.$inferInsert;
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
