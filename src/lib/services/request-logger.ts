import { eq, desc, count, and, gte, lte } from "drizzle-orm";
import { db, requestLogs, type RequestLog } from "../db";
import type { RoutingDecisionLog } from "@/types/api";
import type { HeaderDiff } from "./proxy-client";

export interface LogRequestInput {
  apiKeyId: string | null;
  upstreamId: string | null;
  method: string | null;
  path: string | null;
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  statusCode: number | null;
  durationMs: number | null;
  routingDurationMs?: number | null;
  errorMessage?: string | null;
  // Routing decision fields
  routingType?: "tiered" | "direct" | "provider_type" | null;
  priorityTier?: number | null;
  failoverAttempts?: number;
  failoverHistory?: FailoverAttempt[] | null;
  routingDecision?: RoutingDecisionLog | null;
  // Session affinity fields
  sessionId?: string | null;
  affinityHit?: boolean;
  affinityMigrated?: boolean;
  // Performance metrics fields
  ttftMs?: number | null;
  isStream?: boolean;
  // Header compensation fields
  sessionIdCompensated?: boolean;
  headerDiff?: HeaderDiff | null;
}

/**
 * Minimal request log fields available at request start.
 * Used to create an "in-progress" row that will be updated on completion.
 */
export interface StartRequestLogInput {
  apiKeyId: string | null;
  upstreamId: string | null;
  method: string | null;
  path: string | null;
  model: string | null;
  // Routing decision fields
  routingType?: "tiered" | "direct" | "provider_type" | null;
  priorityTier?: number | null;
  routingDecision?: RoutingDecisionLog | null;
  sessionId?: string | null;
}

/**
 * Fields that can be updated on an existing request log entry.
 * All fields are optional; only provided ones will be updated.
 */
export interface UpdateRequestLogInput {
  apiKeyId?: string | null;
  upstreamId?: string | null;
  method?: string | null;
  path?: string | null;
  model?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  statusCode?: number | null;
  durationMs?: number | null;
  routingDurationMs?: number | null;
  errorMessage?: string | null;
  // Routing decision fields
  routingType?: "tiered" | "direct" | "provider_type" | null;
  priorityTier?: number | null;
  failoverAttempts?: number;
  failoverHistory?: FailoverAttempt[] | null;
  routingDecision?: RoutingDecisionLog | null;
  // Session affinity fields
  sessionId?: string | null;
  affinityHit?: boolean;
  affinityMigrated?: boolean;
  // Performance metrics fields
  ttftMs?: number | null;
  isStream?: boolean;
  // Header compensation fields
  sessionIdCompensated?: boolean;
  headerDiff?: HeaderDiff | null;
}

/**
 * Failover attempt record for tracking routing failures.
 */
export interface FailoverAttempt {
  upstream_id: string;
  upstream_name: string;
  upstream_provider_type?: string;
  upstream_base_url?: string;
  attempted_at: string; // ISO timestamp
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

export interface RequestLogResponse {
  id: string;
  apiKeyId: string | null;
  upstreamId: string | null;
  upstreamName: string | null;
  method: string | null;
  path: string | null;
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  statusCode: number | null;
  durationMs: number | null;
  routingDurationMs: number | null;
  errorMessage: string | null;
  // Routing decision fields
  routingType: string | null;
  priorityTier: number | null;
  groupName: string | null; // Deprecated: kept for historical data
  lbStrategy: string | null; // Deprecated: kept for historical data
  failoverAttempts: number;
  failoverHistory: FailoverAttempt[] | null;
  routingDecision: RoutingDecisionLog | null;
  // Session affinity fields
  sessionId: string | null;
  affinityHit: boolean;
  affinityMigrated: boolean;
  // Performance metrics fields
  ttftMs: number | null;
  isStream: boolean;
  // Header compensation fields
  sessionIdCompensated: boolean;
  headerDiff: HeaderDiff | null;
  billingStatus?: "billed" | "unbilled" | null;
  unbillableReason?: string | null;
  priceSource?: string | null;
  baseInputPricePerMillion?: number | null;
  baseOutputPricePerMillion?: number | null;
  inputMultiplier?: number | null;
  outputMultiplier?: number | null;
  finalCost?: number | null;
  currency?: string | null;
  billedAt?: Date | null;
  createdAt: Date;
}

export interface PaginatedRequestLogs {
  items: RequestLogResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ListRequestLogsFilter {
  apiKeyId?: string;
  upstreamId?: string;
  statusCode?: number;
  startTime?: Date;
  endTime?: Date;
}

function normalizeBillingStatus(value: string | null | undefined): "billed" | "unbilled" | null {
  if (value === "billed" || value === "unbilled") {
    return value;
  }
  return null;
}

function normalizeBillingPriceSource(
  value: string | null | undefined
): "manual" | "openrouter" | "litellm" | null {
  if (value === "manual" || value === "openrouter" || value === "litellm") {
    return value;
  }
  return null;
}

/**
 * Create a request log entry at request start (in-progress).
 * The entry should be completed via updateRequestLog(...).
 */
export async function logRequestStart(input: StartRequestLogInput): Promise<RequestLog> {
  const [logEntry] = await db
    .insert(requestLogs)
    .values({
      apiKeyId: input.apiKeyId,
      upstreamId: input.upstreamId,
      method: input.method,
      path: input.path,
      model: input.model,
      // Keep token fields at 0 until completion.
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      reasoningTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      statusCode: null,
      durationMs: null,
      errorMessage: null,
      // Routing decision fields
      routingType: input.routingType ?? null,
      priorityTier: input.priorityTier ?? null,
      // Failover fields are only known when request finishes.
      failoverAttempts: 0,
      failoverHistory: null,
      routingDecision: input.routingDecision ? JSON.stringify(input.routingDecision) : null,
      sessionId: input.sessionId ?? null,
      createdAt: new Date(),
    })
    .returning();

  return logEntry;
}

/**
 * Update an existing request log entry (e.g. to mark completion).
 * Returns the updated row, or null if no row matched.
 */
export async function updateRequestLog(
  id: string,
  input: UpdateRequestLogInput
): Promise<RequestLog | null> {
  const updateValues: Partial<typeof requestLogs.$inferInsert> = {};

  if (input.apiKeyId !== undefined) updateValues.apiKeyId = input.apiKeyId;
  if (input.upstreamId !== undefined) updateValues.upstreamId = input.upstreamId;
  if (input.method !== undefined) updateValues.method = input.method;
  if (input.path !== undefined) updateValues.path = input.path;
  if (input.model !== undefined) updateValues.model = input.model;

  if (input.promptTokens !== undefined) updateValues.promptTokens = input.promptTokens;
  if (input.completionTokens !== undefined) updateValues.completionTokens = input.completionTokens;
  if (input.totalTokens !== undefined) updateValues.totalTokens = input.totalTokens;
  if (input.cachedTokens !== undefined) updateValues.cachedTokens = input.cachedTokens;
  if (input.reasoningTokens !== undefined) updateValues.reasoningTokens = input.reasoningTokens;
  if (input.cacheCreationTokens !== undefined)
    updateValues.cacheCreationTokens = input.cacheCreationTokens;
  if (input.cacheReadTokens !== undefined) updateValues.cacheReadTokens = input.cacheReadTokens;

  if (input.statusCode !== undefined) updateValues.statusCode = input.statusCode;
  if (input.durationMs !== undefined) updateValues.durationMs = input.durationMs;
  if (input.routingDurationMs !== undefined)
    updateValues.routingDurationMs = input.routingDurationMs;
  if (input.errorMessage !== undefined) updateValues.errorMessage = input.errorMessage;

  if (input.routingType !== undefined) updateValues.routingType = input.routingType;
  if (input.priorityTier !== undefined) updateValues.priorityTier = input.priorityTier;

  if (input.failoverAttempts !== undefined) updateValues.failoverAttempts = input.failoverAttempts;
  if (input.failoverHistory !== undefined) {
    updateValues.failoverHistory = input.failoverHistory
      ? JSON.stringify(input.failoverHistory)
      : null;
  }
  if (input.routingDecision !== undefined) {
    updateValues.routingDecision = input.routingDecision
      ? JSON.stringify(input.routingDecision)
      : null;
  }

  if (input.sessionId !== undefined) updateValues.sessionId = input.sessionId;
  if (input.affinityHit !== undefined) updateValues.affinityHit = input.affinityHit;
  if (input.affinityMigrated !== undefined) updateValues.affinityMigrated = input.affinityMigrated;
  if (input.ttftMs !== undefined) updateValues.ttftMs = input.ttftMs;
  if (input.isStream !== undefined) updateValues.isStream = input.isStream;
  if (input.sessionIdCompensated !== undefined)
    updateValues.sessionIdCompensated = input.sessionIdCompensated;
  if (input.headerDiff !== undefined) updateValues.headerDiff = input.headerDiff ?? null;

  if (Object.keys(updateValues).length === 0) {
    return null;
  }

  const [updated] = await db
    .update(requestLogs)
    .set(updateValues)
    .where(eq(requestLogs.id, id))
    .returning();

  return updated ?? null;
}

/**
 * Record a proxy request to the database.
 */
export async function logRequest(input: LogRequestInput): Promise<RequestLog> {
  const [logEntry] = await db
    .insert(requestLogs)
    .values({
      apiKeyId: input.apiKeyId,
      upstreamId: input.upstreamId,
      method: input.method,
      path: input.path,
      model: input.model,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      cachedTokens: input.cachedTokens ?? 0,
      reasoningTokens: input.reasoningTokens ?? 0,
      cacheCreationTokens: input.cacheCreationTokens ?? 0,
      cacheReadTokens: input.cacheReadTokens ?? 0,
      statusCode: input.statusCode,
      durationMs: input.durationMs,
      routingDurationMs: input.routingDurationMs ?? null,
      errorMessage: input.errorMessage ?? null,
      // Routing decision fields
      routingType: input.routingType ?? null,
      priorityTier: input.priorityTier ?? null,
      failoverAttempts: input.failoverAttempts ?? 0,
      failoverHistory: input.failoverHistory ? JSON.stringify(input.failoverHistory) : null,
      routingDecision: input.routingDecision ? JSON.stringify(input.routingDecision) : null,
      sessionId: input.sessionId ?? null,
      affinityHit: input.affinityHit ?? false,
      affinityMigrated: input.affinityMigrated ?? false,
      ttftMs: input.ttftMs ?? null,
      isStream: input.isStream ?? false,
      sessionIdCompensated: input.sessionIdCompensated ?? false,
      headerDiff: input.headerDiff ?? null,
      createdAt: new Date(),
    })
    .returning();

  // Request logged to database - details available via admin API

  return logEntry;
}

/**
 * Safely extract an integer value from an object.
 */
function getIntValue(data: Record<string, unknown>, key: string, defaultValue: number = 0): number {
  const value = data[key];
  if (typeof value === "number") {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

/**
 * Parse failover history JSON string into typed array.
 */
function parseFailoverHistory(json: string): FailoverAttempt[] | null {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed as FailoverAttempt[];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse routing decision JSON string into typed object.
 */
function parseRoutingDecision(json: string): RoutingDecisionLog | null {
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as RoutingDecisionLog;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract token usage from OpenAI/Anthropic response.
 * Supports both basic tokens and detailed cache/reasoning tokens.
 */
export function extractTokenUsage(responseBody: Record<string, unknown> | null): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  rawInputTokens: number;
} {
  const defaultResult = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    rawInputTokens: 0,
  };

  if (!responseBody) {
    return defaultResult;
  }

  const rawUsage = responseBody.usage;
  if (typeof rawUsage !== "object" || rawUsage === null) {
    return defaultResult;
  }

  const usage = rawUsage as Record<string, unknown>;

  // OpenAI format
  const promptTokens = getIntValue(usage, "prompt_tokens");
  const completionTokens = getIntValue(usage, "completion_tokens");
  const totalTokens = getIntValue(usage, "total_tokens", promptTokens + completionTokens);

  // Detect OpenAI format by key presence (not value) to handle zero-token edge cases
  if ("prompt_tokens" in usage || "completion_tokens" in usage || "total_tokens" in usage) {
    // Extract detailed token info for OpenAI
    let cachedTokens = 0;
    let reasoningTokens = 0;

    // OpenAI prompt_tokens_details.cached_tokens
    const promptDetails = usage.prompt_tokens_details;
    if (typeof promptDetails === "object" && promptDetails !== null) {
      cachedTokens = getIntValue(promptDetails as Record<string, unknown>, "cached_tokens");
    }

    // OpenAI completion_tokens_details.reasoning_tokens
    const completionDetails = usage.completion_tokens_details;
    if (typeof completionDetails === "object" && completionDetails !== null) {
      reasoningTokens = getIntValue(
        completionDetails as Record<string, unknown>,
        "reasoning_tokens"
      );
    }

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      cachedTokens,
      reasoningTokens,
      cacheCreationTokens: 0,
      cacheReadTokens: cachedTokens, // OpenAI cached_tokens is equivalent to cache_read
      rawInputTokens: promptTokens,
    };
  }

  // Detect Anthropic format by key presence (including cache keys for cache-only payloads)
  const inputTokens = getIntValue(usage, "input_tokens");
  const outputTokens = getIntValue(usage, "output_tokens");
  if (
    "input_tokens" in usage ||
    "output_tokens" in usage ||
    "cache_creation_input_tokens" in usage ||
    "cache_read_input_tokens" in usage
  ) {
    // Extract Anthropic cache tokens
    const cacheCreationTokens = getIntValue(usage, "cache_creation_input_tokens");
    const cacheReadTokens = getIntValue(usage, "cache_read_input_tokens");

    // Anthropic may send streaming usage objects where input_tokens is present but 0,
    // while cache_*_input_tokens carries the real input usage.
    const cacheFallbackTokens = cacheReadTokens + cacheCreationTokens;
    const promptTokensValue = inputTokens > 0 ? inputTokens : cacheFallbackTokens;
    const totalTokensValue = getIntValue(usage, "total_tokens", promptTokensValue + outputTokens);

    return {
      promptTokens: promptTokensValue,
      completionTokens: outputTokens,
      totalTokens: totalTokensValue,
      cachedTokens: cacheReadTokens, // Anthropic cache_read is the cached tokens
      reasoningTokens: 0,
      cacheCreationTokens,
      cacheReadTokens,
      rawInputTokens: inputTokens,
    };
  }

  return defaultResult;
}

/**
 * Extract model name from request or response.
 */
export function extractModelName(
  requestBody: Record<string, unknown> | null,
  responseBody: Record<string, unknown> | null
): string | null {
  // Try request body first
  if (requestBody?.model && typeof requestBody.model === "string") {
    return requestBody.model;
  }

  // Fallback to response body
  if (responseBody?.model && typeof responseBody.model === "string") {
    return responseBody.model;
  }

  return null;
}

/**
 * List request logs with pagination and optional filtering.
 */
export async function listRequestLogs(
  page: number = 1,
  pageSize: number = 20,
  filters: ListRequestLogsFilter = {}
): Promise<PaginatedRequestLogs> {
  // Validate pagination params
  page = Math.max(1, page);
  pageSize = Math.min(100, Math.max(1, pageSize));

  // Build filter conditions
  const conditions = [];

  if (filters.apiKeyId) {
    conditions.push(eq(requestLogs.apiKeyId, filters.apiKeyId));
  }
  if (filters.upstreamId) {
    conditions.push(eq(requestLogs.upstreamId, filters.upstreamId));
  }
  if (filters.statusCode !== undefined) {
    conditions.push(eq(requestLogs.statusCode, filters.statusCode));
  }
  if (filters.startTime) {
    conditions.push(gte(requestLogs.createdAt, filters.startTime));
  }
  if (filters.endTime) {
    conditions.push(lte(requestLogs.createdAt, filters.endTime));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Count total with filters
  const [{ value: total }] = await db
    .select({ value: count() })
    .from(requestLogs)
    .where(whereClause);

  // Query paginated results with upstream name
  const offset = (page - 1) * pageSize;
  const logs = await db.query.requestLogs.findMany({
    where: whereClause,
    orderBy: [desc(requestLogs.createdAt)],
    limit: pageSize,
    offset,
    with: {
      upstream: true,
      billingSnapshot: true,
    },
  });

  const items: RequestLogResponse[] = logs.map((log) => ({
    id: log.id,
    apiKeyId: log.apiKeyId,
    upstreamId: log.upstreamId,
    upstreamName: log.upstream?.name ?? null,
    method: log.method,
    path: log.path,
    model: log.model,
    promptTokens: log.promptTokens,
    completionTokens: log.completionTokens,
    totalTokens: log.totalTokens,
    cachedTokens: log.cachedTokens,
    reasoningTokens: log.reasoningTokens,
    cacheCreationTokens: log.cacheCreationTokens,
    cacheReadTokens: log.cacheReadTokens,
    statusCode: log.statusCode,
    durationMs: log.durationMs,
    routingDurationMs: log.routingDurationMs ?? null,
    errorMessage: log.errorMessage,
    // Routing decision fields
    routingType: log.routingType,
    priorityTier: log.priorityTier,
    groupName: log.groupName,
    lbStrategy: log.lbStrategy,
    failoverAttempts: log.failoverAttempts,
    failoverHistory: log.failoverHistory ? parseFailoverHistory(log.failoverHistory) : null,
    routingDecision: log.routingDecision ? parseRoutingDecision(log.routingDecision) : null,
    sessionId: log.sessionId ?? null,
    affinityHit: log.affinityHit,
    affinityMigrated: log.affinityMigrated,
    ttftMs: log.ttftMs ?? null,
    isStream: log.isStream,
    sessionIdCompensated: log.sessionIdCompensated,
    headerDiff: (log.headerDiff as HeaderDiff | null) ?? null,
    ...(log.billingSnapshot
      ? {
          billingStatus: normalizeBillingStatus(log.billingSnapshot.billingStatus),
          unbillableReason: log.billingSnapshot.unbillableReason,
          priceSource: normalizeBillingPriceSource(log.billingSnapshot.priceSource),
          baseInputPricePerMillion: log.billingSnapshot.baseInputPricePerMillion,
          baseOutputPricePerMillion: log.billingSnapshot.baseOutputPricePerMillion,
          inputMultiplier: log.billingSnapshot.inputMultiplier,
          outputMultiplier: log.billingSnapshot.outputMultiplier,
          finalCost: log.billingSnapshot.finalCost,
          currency: log.billingSnapshot.currency,
          billedAt: log.billingSnapshot.billedAt,
        }
      : {}),
    createdAt: log.createdAt,
  }));

  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
  };
}
