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
 */
export function extractTokenUsage(responseBody: Record<string, unknown> | null): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} {
  if (!responseBody) {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }

  const rawUsage = responseBody.usage;
  if (typeof rawUsage === "object" && rawUsage !== null) {
    const usage = rawUsage as Record<string, unknown>;

    // OpenAI format
    const promptTokens = getIntValue(usage, "prompt_tokens");
    const completionTokens = getIntValue(usage, "completion_tokens");
    const totalTokens = getIntValue(usage, "total_tokens", promptTokens + completionTokens);

    if (promptTokens || completionTokens || totalTokens) {
      return { promptTokens, completionTokens, totalTokens };
    }

    // Anthropic format
    const inputTokens = getIntValue(usage, "input_tokens");
    const outputTokens = getIntValue(usage, "output_tokens");
    if (inputTokens || outputTokens) {
      return {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      };
    }
  }

  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
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
