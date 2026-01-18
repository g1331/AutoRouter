import { eq, desc, count, and, gte, lte } from "drizzle-orm";
import { db, requestLogs, type RequestLog } from "../db";

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
  errorMessage?: string | null;
}

export interface RequestLogResponse {
  id: string;
  apiKeyId: string | null;
  upstreamId: string | null;
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
  errorMessage: string | null;
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
      errorMessage: input.errorMessage ?? null,
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
} {
  const defaultResult = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
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

    return {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
      cachedTokens: cacheReadTokens, // Anthropic cache_read is the cached tokens
      reasoningTokens: 0,
      cacheCreationTokens,
      cacheReadTokens,
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

  // Query paginated results
  const offset = (page - 1) * pageSize;
  const logs = await db.query.requestLogs.findMany({
    where: whereClause,
    orderBy: [desc(requestLogs.createdAt)],
    limit: pageSize,
    offset,
  });

  const items: RequestLogResponse[] = logs.map((log) => ({
    id: log.id,
    apiKeyId: log.apiKeyId,
    upstreamId: log.upstreamId,
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
    errorMessage: log.errorMessage,
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
