import { eq, desc, count, and, gte, lte, asc, isNull } from "drizzle-orm";
import { db, requestLogs, type RequestLog } from "../db";
import type {
  FailoverErrorType,
  RequestThinkingConfig,
  ReasoningEffort,
  RoutingDecisionLog,
  RoutingSelectionReason,
} from "@/types/api";
import { extractNormalizedUsage, type HeaderDiff } from "./proxy-client";
import { publishRequestLogLiveUpdate } from "./request-log-live-updates";
import { calculateAndPersistRequestBillingSnapshot } from "./billing-cost-service";
import { createLogger } from "@/lib/utils/logger";
import { isRequestThinkingConfig } from "@/lib/utils/request-thinking-config";

const log = createLogger("request-logger");
const REQUEST_LOG_STALE_MINUTES = 15;
const REQUEST_LOG_STALE_SCAN_LIMIT = 200;
const STALE_REQUEST_LOG_STATUS_CODE = 520;
const STALE_REQUEST_LOG_ERROR_MESSAGE =
  "Request did not settle before the stale reconciliation timeout window";

export interface LogRequestInput {
  apiKeyId: string | null;
  apiKeyName?: string | null;
  apiKeyPrefix?: string | null;
  upstreamId: string | null;
  method: string | null;
  path: string | null;
  model: string | null;
  reasoningEffort?: ReasoningEffort | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  cacheCreationTokens?: number;
  cacheCreation5mTokens?: number;
  cacheCreation1hTokens?: number;
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
  thinkingConfig?: RequestThinkingConfig | null;
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
  apiKeyName?: string | null;
  apiKeyPrefix?: string | null;
  upstreamId: string | null;
  method: string | null;
  path: string | null;
  model: string | null;
  reasoningEffort?: ReasoningEffort | null;
  isStream?: boolean;
  // Routing decision fields
  routingType?: "tiered" | "direct" | "provider_type" | null;
  priorityTier?: number | null;
  routingDecision?: RoutingDecisionLog | null;
  thinkingConfig?: RequestThinkingConfig | null;
  sessionId?: string | null;
}

/**
 * Fields that can be updated on an existing request log entry.
 * All fields are optional; only provided ones will be updated.
 */
export interface UpdateRequestLogInput {
  apiKeyId?: string | null;
  apiKeyName?: string | null;
  apiKeyPrefix?: string | null;
  upstreamId?: string | null;
  method?: string | null;
  path?: string | null;
  model?: string | null;
  reasoningEffort?: ReasoningEffort | null;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  cacheCreationTokens?: number;
  cacheCreation5mTokens?: number;
  cacheCreation1hTokens?: number;
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
  thinkingConfig?: RequestThinkingConfig | null;
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
  error_type: FailoverErrorType;
  error_message: string;
  status_code?: number | null;
  response_headers?: Record<string, string>;
  response_body_text?: string | null;
  response_body_json?: unknown | null;
  selection_reason?: RoutingSelectionReason | null;
  header_diff?: HeaderDiff | null;
}

export interface RequestLogResponse {
  id: string;
  apiKeyId: string | null;
  apiKeyName: string | null;
  apiKeyPrefix: string | null;
  upstreamId: string | null;
  upstreamName: string | null;
  method: string | null;
  path: string | null;
  model: string | null;
  reasoningEffort?: ReasoningEffort | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  cacheCreationTokens: number;
  cacheCreation5mTokens: number;
  cacheCreation1hTokens: number;
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
  thinkingConfig: RequestThinkingConfig | null;
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
  baseCacheReadInputPricePerMillion?: number | null;
  baseCacheWriteInputPricePerMillion?: number | null;
  matchedRuleType?: "flat" | "tiered" | null;
  matchedRuleDisplayLabel?: string | null;
  appliedTierThreshold?: number | null;
  modelMaxInputTokens?: number | null;
  modelMaxOutputTokens?: number | null;
  inputMultiplier?: number | null;
  outputMultiplier?: number | null;
  billedInputTokens?: number | null;
  cacheReadCost?: number | null;
  cacheWriteCost?: number | null;
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

function parseRequestLogCreatedAt(value: Date | string | number | null | undefined): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

async function persistZeroUsageBillingSnapshot(
  logEntry: Pick<RequestLog, "id" | "apiKeyId" | "upstreamId" | "model"> | null | undefined
): Promise<void> {
  if (!logEntry) {
    return;
  }

  try {
    await calculateAndPersistRequestBillingSnapshot({
      requestLogId: logEntry.id,
      apiKeyId: logEntry.apiKeyId,
      upstreamId: logEntry.upstreamId,
      model: logEntry.model,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    });
  } catch (error) {
    log.error(
      { err: error, requestLogId: logEntry.id },
      "failed to persist zero-usage billing snapshot for terminal request log"
    );
  }
}

function notifyRequestLogChange(
  logEntry: Pick<RequestLog, "id" | "statusCode"> | null | undefined
): void {
  if (!logEntry) {
    return;
  }

  publishRequestLogLiveUpdate({
    type: "request-log-changed",
    logId: logEntry.id,
    statusCode: logEntry.statusCode ?? null,
  });
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

function normalizeReasoningEffort(value: string | null | undefined): ReasoningEffort | null {
  if (
    value === "none" ||
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh" ||
    value === "enabled"
  ) {
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
      apiKeyName: input.apiKeyName ?? null,
      apiKeyPrefix: input.apiKeyPrefix ?? null,
      upstreamId: input.upstreamId,
      method: input.method,
      path: input.path,
      model: input.model,
      reasoningEffort: input.reasoningEffort ?? null,
      // Keep token fields at 0 until completion.
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      reasoningTokens: 0,
      cacheCreationTokens: 0,
      cacheCreation5mTokens: 0,
      cacheCreation1hTokens: 0,
      cacheReadTokens: 0,
      statusCode: null,
      durationMs: null,
      errorMessage: null,
      isStream: input.isStream ?? false,
      // Routing decision fields
      routingType: input.routingType ?? null,
      priorityTier: input.priorityTier ?? null,
      // Failover fields are only known when request finishes.
      failoverAttempts: 0,
      failoverHistory: null,
      routingDecision: input.routingDecision ? JSON.stringify(input.routingDecision) : null,
      thinkingConfig: input.thinkingConfig ? JSON.stringify(input.thinkingConfig) : null,
      sessionId: input.sessionId ?? null,
      createdAt: new Date(),
    })
    .returning();

  notifyRequestLogChange(logEntry);

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
  if (input.apiKeyName !== undefined) updateValues.apiKeyName = input.apiKeyName;
  if (input.apiKeyPrefix !== undefined) updateValues.apiKeyPrefix = input.apiKeyPrefix;
  if (input.upstreamId !== undefined) updateValues.upstreamId = input.upstreamId;
  if (input.method !== undefined) updateValues.method = input.method;
  if (input.path !== undefined) updateValues.path = input.path;
  if (input.model !== undefined) updateValues.model = input.model;
  if (input.reasoningEffort !== undefined) updateValues.reasoningEffort = input.reasoningEffort;

  if (input.promptTokens !== undefined) updateValues.promptTokens = input.promptTokens;
  if (input.completionTokens !== undefined) updateValues.completionTokens = input.completionTokens;
  if (input.totalTokens !== undefined) updateValues.totalTokens = input.totalTokens;
  if (input.cachedTokens !== undefined) updateValues.cachedTokens = input.cachedTokens;
  if (input.reasoningTokens !== undefined) updateValues.reasoningTokens = input.reasoningTokens;
  if (input.cacheCreationTokens !== undefined)
    updateValues.cacheCreationTokens = input.cacheCreationTokens;
  if (input.cacheCreation5mTokens !== undefined)
    updateValues.cacheCreation5mTokens = input.cacheCreation5mTokens;
  if (input.cacheCreation1hTokens !== undefined)
    updateValues.cacheCreation1hTokens = input.cacheCreation1hTokens;
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
  if (input.thinkingConfig !== undefined) {
    updateValues.thinkingConfig = input.thinkingConfig
      ? JSON.stringify(input.thinkingConfig)
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

  notifyRequestLogChange(updated ?? null);

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
      apiKeyName: input.apiKeyName ?? null,
      apiKeyPrefix: input.apiKeyPrefix ?? null,
      upstreamId: input.upstreamId,
      method: input.method,
      path: input.path,
      model: input.model,
      reasoningEffort: input.reasoningEffort ?? null,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      cachedTokens: input.cachedTokens ?? 0,
      reasoningTokens: input.reasoningTokens ?? 0,
      cacheCreationTokens: input.cacheCreationTokens ?? 0,
      cacheCreation5mTokens: input.cacheCreation5mTokens ?? 0,
      cacheCreation1hTokens: input.cacheCreation1hTokens ?? 0,
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
      thinkingConfig: input.thinkingConfig ? JSON.stringify(input.thinkingConfig) : null,
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

  notifyRequestLogChange(logEntry);

  return logEntry;
}

/**
 * Mark stale non-streaming request logs as failed when they never reached a terminal state.
 */
export async function reconcileStaleInProgressRequestLogs(options?: {
  now?: Date;
  limit?: number;
}): Promise<number> {
  const now = options?.now ?? new Date();
  const limit = options?.limit ?? REQUEST_LOG_STALE_SCAN_LIMIT;
  const cutoff = new Date(now.getTime() - REQUEST_LOG_STALE_MINUTES * 60 * 1000);

  const candidates = await db.query.requestLogs.findMany({
    where: isNull(requestLogs.statusCode),
    orderBy: [asc(requestLogs.createdAt)],
    limit,
    columns: {
      id: true,
      createdAt: true,
      isStream: true,
    },
  });

  let reconciled = 0;

  for (const candidate of candidates) {
    if (candidate.isStream) {
      continue;
    }

    const createdAt = parseRequestLogCreatedAt(candidate.createdAt);
    if (!createdAt || createdAt > cutoff) {
      continue;
    }

    const durationMs = Math.max(0, now.getTime() - createdAt.getTime());
    const updated = await updateRequestLog(candidate.id, {
      statusCode: STALE_REQUEST_LOG_STATUS_CODE,
      durationMs,
      errorMessage: STALE_REQUEST_LOG_ERROR_MESSAGE,
    });

    if (updated) {
      await persistZeroUsageBillingSnapshot(updated);
      reconciled += 1;
    }
  }

  return reconciled;
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

function parseThinkingConfig(json: string): RequestThinkingConfig | null {
  try {
    const parsed = JSON.parse(json);
    return isRequestThinkingConfig(parsed) ? parsed : null;
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
  cacheCreation5mTokens?: number;
  cacheCreation1hTokens?: number;
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

  const normalizedUsage = extractNormalizedUsage(responseBody);
  if (!normalizedUsage) {
    return defaultResult;
  }

  const result: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cachedTokens: number;
    reasoningTokens: number;
    cacheCreationTokens: number;
    cacheCreation5mTokens?: number;
    cacheCreation1hTokens?: number;
    cacheReadTokens: number;
    rawInputTokens: number;
  } = {
    promptTokens: normalizedUsage.promptTokens,
    completionTokens: normalizedUsage.completionTokens,
    totalTokens: normalizedUsage.totalTokens,
    cachedTokens: normalizedUsage.cachedTokens,
    reasoningTokens: normalizedUsage.reasoningTokens,
    cacheCreationTokens: normalizedUsage.cacheCreationTokens,
    cacheReadTokens: normalizedUsage.cacheReadTokens,
    rawInputTokens: normalizedUsage.rawInputTokens,
  };

  if (normalizedUsage.cacheCreation5mTokens > 0) {
    result.cacheCreation5mTokens = normalizedUsage.cacheCreation5mTokens;
  }
  if (normalizedUsage.cacheCreation1hTokens > 0) {
    result.cacheCreation1hTokens = normalizedUsage.cacheCreation1hTokens;
  }

  return result;
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
  if (process.env.NODE_ENV !== "test") {
    try {
      await reconcileStaleInProgressRequestLogs();
    } catch (error) {
      log.warn({ err: error }, "failed to reconcile stale in-progress request logs");
    }
  }

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
      apiKey: true,
      upstream: true,
      billingSnapshot: true,
    },
  });

  const items: RequestLogResponse[] = logs.map((log) => ({
    id: log.id,
    apiKeyId: log.apiKeyId,
    apiKeyName: log.apiKeyName ?? log.apiKey?.name ?? null,
    apiKeyPrefix: log.apiKeyPrefix ?? log.apiKey?.keyPrefix ?? null,
    upstreamId: log.upstreamId,
    upstreamName: log.upstream?.name ?? null,
    method: log.method,
    path: log.path,
    model: log.model,
    reasoningEffort: normalizeReasoningEffort(log.reasoningEffort),
    promptTokens: log.promptTokens,
    completionTokens: log.completionTokens,
    totalTokens: log.totalTokens,
    cachedTokens: log.cachedTokens,
    reasoningTokens: log.reasoningTokens,
    cacheCreationTokens: log.cacheCreationTokens,
    cacheCreation5mTokens: log.cacheCreation5mTokens,
    cacheCreation1hTokens: log.cacheCreation1hTokens,
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
    thinkingConfig: log.thinkingConfig ? parseThinkingConfig(log.thinkingConfig) : null,
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
          baseCacheReadInputPricePerMillion: log.billingSnapshot.baseCacheReadInputPricePerMillion,
          baseCacheWriteInputPricePerMillion:
            log.billingSnapshot.baseCacheWriteInputPricePerMillion,
          matchedRuleType:
            log.billingSnapshot.matchedRuleType === "flat" ||
            log.billingSnapshot.matchedRuleType === "tiered"
              ? log.billingSnapshot.matchedRuleType
              : null,
          matchedRuleDisplayLabel: log.billingSnapshot.matchedRuleDisplayLabel,
          appliedTierThreshold: log.billingSnapshot.appliedTierThreshold,
          modelMaxInputTokens: log.billingSnapshot.modelMaxInputTokens,
          modelMaxOutputTokens: log.billingSnapshot.modelMaxOutputTokens,
          inputMultiplier: log.billingSnapshot.inputMultiplier,
          outputMultiplier: log.billingSnapshot.outputMultiplier,
          billedInputTokens: log.billingSnapshot.promptTokens,
          cacheReadCost: log.billingSnapshot.cacheReadCost,
          cacheWriteCost: log.billingSnapshot.cacheWriteCost,
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
