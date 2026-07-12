import {
  eq,
  desc,
  count,
  and,
  gte,
  lte,
  lt,
  gt,
  asc,
  isNull,
  inArray,
  sql,
  type SQL,
} from "drizzle-orm";
import { db, requestLogs, requestBillingSnapshots, type RequestLog } from "../db";
import { caseInsensitiveLike } from "../db/sql-helpers";
import type {
  FailoverErrorType,
  RequestThinkingConfig,
  ReasoningEffort,
  RoutingDecisionLog,
  RoutingSelectionReason,
} from "@/types/api";
import { extractNormalizedUsage, type HeaderDiff } from "./proxy-client";
import { publishRequestLogLiveUpdate } from "./request-log-live-updates";
import { recordPulseSample } from "./live-pulse-aggregator";
import { calculateAndPersistRequestBillingSnapshot } from "./billing-cost-service";
import { createLogger } from "@/lib/utils/logger";
import { isRequestThinkingConfig } from "@/lib/utils/request-thinking-config";

const log = createLogger("request-logger");
const REQUEST_LOG_STALE_MINUTES = 15;
const REQUEST_LOG_STALE_SCAN_LIMIT = 200;
const STALE_REQUEST_LOG_STATUS_CODE = 520;
const INT4_MAX = 2_147_483_647;
const STALE_REQUEST_LOG_ERROR_MESSAGE =
  "Request did not settle before the stale reconciliation timeout window";

export interface LogRequestInput {
  apiKeyId: string | null;
  apiKeyName?: string | null;
  apiKeyPrefix?: string | null;
  // Redundant owner snapshot taken from the API key at request time; survives
  // key deletion so personal usage keeps attributing to the user (decision 7).
  userId?: string | null;
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
  userId?: string | null;
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
  userId?: string | null;
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
  circuit_breaker_recorded?: boolean | null;
  matched_failure_rule?: {
    id: string;
    name: string;
    scope: "global" | "upstream";
  } | null;
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

export type RequestLogStatusClass = "2xx" | "4xx" | "5xx";

export interface ListRequestLogsFilter {
  id?: string;
  apiKeyId?: string;
  // Owner filter over the redundant user_id snapshot; user-side endpoints
  // inject the authenticated userId here for server-enforced data isolation.
  userId?: string;
  upstreamId?: string;
  statusCode?: number;
  // Status code range filter (e.g. all 5xx); ignored when statusCode is set.
  statusClass?: RequestLogStatusClass;
  // Case-insensitive substring match on the model column.
  model?: string;
  startTime?: Date;
  endTime?: Date;
  // Performance threshold filters (server-side slow-request presets).
  ttftMinMs?: number;
  durationMinMs?: number;
  // Upper bound on tokens/s (completion_tokens / duration seconds); rows below
  // the TPS guard thresholds are excluded so near-zero requests don't match.
  tpsMax?: number;
}

// Guards mirroring the client-side TPS display rules: a TPS value is only
// meaningful once the request produced enough output over enough time.
export const MIN_TPS_COMPLETION_TOKENS = 10;
export const MIN_TPS_DURATION_MS = 100;

export const REQUEST_LOG_SORT_FIELDS = [
  "created_at",
  "duration_ms",
  "total_tokens",
  "ttft_ms",
  "cost",
] as const;
export type RequestLogSortField = (typeof REQUEST_LOG_SORT_FIELDS)[number];
export type RequestLogSortOrder = "asc" | "desc";

export interface RequestLogSort {
  field: RequestLogSortField;
  order: RequestLogSortOrder;
}

const STATUS_CLASS_RANGES: Record<RequestLogStatusClass, [number, number]> = {
  "2xx": [200, 300],
  "4xx": [400, 500],
  "5xx": [500, 600],
};

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

/**
 * Feed a finalized request log into the live pulse rolling window.
 * Only terminal entries (with a known status code) are sampled; in-progress
 * entries created by logRequestStart carry a null status and are skipped.
 *
 * The sample timestamp is the request's createdAt (when it actually happened),
 * not the current time. This keeps stale-reconciliation finalizations — which
 * close out requests that started long ago — outside the rolling window instead
 * of injecting them into the current minute as fake recent traffic.
 */
function recordPulseSampleFromLog(
  logEntry:
    | Pick<RequestLog, "statusCode" | "durationMs" | "totalTokens" | "createdAt">
    | null
    | undefined
): void {
  if (!logEntry || logEntry.statusCode == null) {
    return;
  }

  const createdAt = parseRequestLogCreatedAt(logEntry.createdAt);

  recordPulseSample({
    statusCode: logEntry.statusCode,
    durationMs: logEntry.durationMs ?? null,
    totalTokens: logEntry.totalTokens ?? null,
    occurredAt: createdAt ? createdAt.getTime() : undefined,
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
      userId: input.userId ?? null,
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
  if (input.userId !== undefined) updateValues.userId = input.userId;
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
  if (input.durationMs !== undefined)
    updateValues.durationMs =
      input.durationMs === null ? null : Math.min(Math.max(0, input.durationMs), INT4_MAX);
  if (input.routingDurationMs !== undefined)
    updateValues.routingDurationMs =
      input.routingDurationMs === null
        ? null
        : Math.min(Math.max(0, input.routingDurationMs), INT4_MAX);
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

  // Sample only when this update carries the terminal status code, so a single
  // request is counted once at finalization rather than on every mid-stream update.
  if (input.statusCode !== undefined) {
    recordPulseSampleFromLog(updated);
  }

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
      userId: input.userId ?? null,
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
      durationMs:
        input.durationMs === null ? null : Math.min(Math.max(0, input.durationMs), INT4_MAX),
      routingDurationMs:
        input.routingDurationMs === undefined || input.routingDurationMs === null
          ? null
          : Math.min(Math.max(0, input.routingDurationMs), INT4_MAX),
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
  recordPulseSampleFromLog(logEntry);

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

    const durationMs = Math.min(Math.max(0, now.getTime() - createdAt.getTime()), INT4_MAX);
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

const REQUEST_LOG_PAGE_RELATIONS = {
  apiKey: true,
  upstream: true,
  billingSnapshot: true,
} as const;

/** Shared filter → WHERE translation for the list and window-stats queries. */
function buildRequestLogWhereClause(filters: ListRequestLogsFilter): SQL | undefined {
  const conditions = [];

  if (filters.id) {
    conditions.push(eq(requestLogs.id, filters.id));
  }
  if (filters.apiKeyId) {
    conditions.push(eq(requestLogs.apiKeyId, filters.apiKeyId));
  }
  if (filters.userId) {
    conditions.push(eq(requestLogs.userId, filters.userId));
  }
  if (filters.upstreamId) {
    conditions.push(eq(requestLogs.upstreamId, filters.upstreamId));
  }
  if (filters.statusCode !== undefined) {
    conditions.push(eq(requestLogs.statusCode, filters.statusCode));
  } else if (filters.statusClass) {
    const [min, max] = STATUS_CLASS_RANGES[filters.statusClass];
    conditions.push(gte(requestLogs.statusCode, min), lt(requestLogs.statusCode, max));
  }
  if (filters.model?.trim()) {
    conditions.push(caseInsensitiveLike(requestLogs.model, filters.model));
  }
  if (filters.startTime) {
    conditions.push(gte(requestLogs.createdAt, filters.startTime));
  }
  if (filters.endTime) {
    conditions.push(lte(requestLogs.createdAt, filters.endTime));
  }
  if (filters.ttftMinMs !== undefined) {
    conditions.push(gt(requestLogs.ttftMs, filters.ttftMinMs));
  }
  if (filters.durationMinMs !== undefined) {
    conditions.push(gt(requestLogs.durationMs, filters.durationMinMs));
  }
  if (filters.tpsMax !== undefined) {
    // TPS = completion_tokens / (duration_ms / 1000). Rewritten as integer-safe
    // arithmetic so PostgreSQL and SQLite evaluate it identically, guarded so
    // near-zero requests don't produce meaningless TPS matches.
    conditions.push(
      gte(requestLogs.durationMs, MIN_TPS_DURATION_MS),
      gte(requestLogs.completionTokens, MIN_TPS_COMPLETION_TOKENS),
      sql`${requestLogs.completionTokens} * 1000.0 < ${filters.tpsMax} * ${requestLogs.durationMs}`
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function buildRequestLogOrderBy(sort?: RequestLogSort) {
  const direction = sort?.order === "asc" ? asc : desc;
  // Stable tiebreakers so pagination never duplicates or drops rows when the
  // primary sort value ties.
  const tiebreakers = [desc(requestLogs.createdAt), desc(requestLogs.id)];
  switch (sort?.field) {
    case "duration_ms":
      // coalesce removes the pg/sqlite NULL-ordering divergence: NULL sorts as
      // the smallest value on both dialects.
      return [direction(sql`coalesce(${requestLogs.durationMs}, -1)`), ...tiebreakers];
    case "total_tokens":
      return [direction(requestLogs.totalTokens), ...tiebreakers];
    case "ttft_ms":
      return [direction(sql`coalesce(${requestLogs.ttftMs}, -1)`), ...tiebreakers];
    default:
      return [direction(requestLogs.createdAt), desc(requestLogs.id)];
  }
}

async function queryRequestLogPage(
  whereClause: SQL | undefined,
  sort: RequestLogSort | undefined,
  limit: number,
  offset: number
) {
  if (sort?.field !== "cost") {
    return db.query.requestLogs.findMany({
      where: whereClause,
      orderBy: buildRequestLogOrderBy(sort),
      limit,
      offset,
      with: REQUEST_LOG_PAGE_RELATIONS,
    });
  }

  // Cost lives on the joined billing snapshot, which the relational API cannot
  // order by. Resolve the page of IDs with an explicit join first, then
  // hydrate relations for just those rows and restore the join order.
  const direction = sort.order === "asc" ? asc : desc;
  const idRows = await db
    .select({ id: requestLogs.id })
    .from(requestLogs)
    .leftJoin(requestBillingSnapshots, eq(requestBillingSnapshots.requestLogId, requestLogs.id))
    .where(whereClause)
    .orderBy(
      direction(sql`coalesce(${requestBillingSnapshots.finalCost}, -1)`),
      desc(requestLogs.createdAt),
      desc(requestLogs.id)
    )
    .limit(limit)
    .offset(offset);

  const ids = idRows.map((row) => row.id);
  if (ids.length === 0) {
    return [];
  }

  const rows = await db.query.requestLogs.findMany({
    where: inArray(requestLogs.id, ids),
    with: REQUEST_LOG_PAGE_RELATIONS,
  });
  const rowById = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => rowById.get(id) ?? []);
}

// Duration above which a request counts as "slow" in the window stats,
// matching the slow_duration quick-filter preset threshold.
export const SLOW_REQUEST_DURATION_MS = 20_000;

export interface RequestLogWindowStats {
  total: number;
  streamCount: number;
  slowCount: number;
  p50TtftMs: number | null;
  p90TtftMs: number | null;
  p50Tps: number | null;
}

/**
 * Nearest-rank percentile via ORDER BY + OFFSET (SQLite has no
 * percentile_cont). Index mirrors the former client-side getPercentile:
 * ceil(p/100 · n) − 1.
 */
async function selectRequestLogPercentile(
  expr: SQL,
  whereClause: SQL | undefined,
  n: number,
  percentile: number
): Promise<number | null> {
  if (n <= 0) {
    return null;
  }
  const offset = Math.min(n - 1, Math.max(0, Math.ceil((percentile / 100) * n) - 1));
  const rows = await db
    .select({ value: expr })
    .from(requestLogs)
    .where(whereClause)
    .orderBy(asc(expr))
    .limit(1)
    .offset(offset);
  const value = rows[0]?.value;
  // pg returns numeric/bigint aggregates as strings.
  return value == null ? null : Number(value);
}

/**
 * Window-scoped performance stats over the same filter surface as
 * listRequestLogs, so the tiles describe the whole selected window instead of
 * the fetched page.
 */
export async function getRequestLogWindowStats(
  filters: ListRequestLogsFilter = {}
): Promise<RequestLogWindowStats> {
  const whereClause = buildRequestLogWhereClause(filters);

  const [aggregate] = await db
    .select({
      total: count(),
      streamCount: sql<
        number | string | null
      >`sum(case when ${requestLogs.isStream} then 1 else 0 end)`,
      slowCount: sql<
        number | string | null
      >`sum(case when ${requestLogs.durationMs} > ${SLOW_REQUEST_DURATION_MS} then 1 else 0 end)`,
      ttftCount: sql<
        number | string | null
      >`sum(case when ${requestLogs.isStream} and ${requestLogs.ttftMs} > 0 then 1 else 0 end)`,
      tpsCount: sql<
        number | string | null
      >`sum(case when ${requestLogs.isStream} and ${requestLogs.durationMs} > ${MIN_TPS_DURATION_MS} and ${requestLogs.completionTokens} >= ${MIN_TPS_COMPLETION_TOKENS} then 1 else 0 end)`,
    })
    .from(requestLogs)
    .where(whereClause);

  const ttftCount = Number(aggregate.ttftCount ?? 0);
  const tpsCount = Number(aggregate.tpsCount ?? 0);

  // TTFT percentiles over streaming rows with a real first-token time.
  const ttftWhere = and(
    ...[whereClause, eq(requestLogs.isStream, true), gt(requestLogs.ttftMs, 0)].filter(
      (condition): condition is SQL => condition !== undefined
    )
  );
  // TPS over streaming rows above the minimum-signal guards, mirroring the
  // row-level display rule (getRequestTps).
  const tpsWhere = and(
    ...[
      whereClause,
      eq(requestLogs.isStream, true),
      gt(requestLogs.durationMs, MIN_TPS_DURATION_MS),
      gte(requestLogs.completionTokens, MIN_TPS_COMPLETION_TOKENS),
    ].filter((condition): condition is SQL => condition !== undefined)
  );
  const tpsExpr = sql`${requestLogs.completionTokens} * 1000.0 / ${requestLogs.durationMs}`;

  const [p50TtftMs, p90TtftMs, p50Tps] = await Promise.all([
    selectRequestLogPercentile(sql`${requestLogs.ttftMs}`, ttftWhere, ttftCount, 50),
    selectRequestLogPercentile(sql`${requestLogs.ttftMs}`, ttftWhere, ttftCount, 90),
    selectRequestLogPercentile(tpsExpr, tpsWhere, tpsCount, 50),
  ]);

  return {
    total: Number(aggregate.total ?? 0),
    streamCount: Number(aggregate.streamCount ?? 0),
    slowCount: Number(aggregate.slowCount ?? 0),
    p50TtftMs,
    p90TtftMs,
    p50Tps: p50Tps == null ? null : Math.round(p50Tps * 10) / 10,
  };
}

/**
 * List request logs with pagination and optional filtering.
 */
export async function listRequestLogs(
  page: number = 1,
  pageSize: number = 20,
  filters: ListRequestLogsFilter = {},
  sort?: RequestLogSort
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

  const whereClause = buildRequestLogWhereClause(filters);

  // Count total with filters
  const [{ value: total }] = await db
    .select({ value: count() })
    .from(requestLogs)
    .where(whereClause);

  // Query paginated results with upstream name
  const offset = (page - 1) * pageSize;
  const logs = await queryRequestLogPage(whereClause, sort, pageSize, offset);

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
