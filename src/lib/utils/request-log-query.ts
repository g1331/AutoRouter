import { startOfDay, subDays } from "date-fns";
import { parseDateFilterParam, parseIntFilterParam } from "./request-log-query-params";
import type { TimeRange } from "@/types/api";
export type RequestLogStatusClass = "2xx" | "4xx" | "5xx";
export type RequestLogScope = "admin" | "user";

/** Normalized server read criteria shared by list and window stats. */
export interface RequestLogFilterCriteria {
  id?: string;
  apiKeyId?: string;
  userId?: string;
  upstreamId?: string;
  statusCode?: number;
  statusClass?: RequestLogStatusClass;
  model?: string;
  startTime?: Date;
  endTime?: Date;
  ttftMinMs?: number;
  durationMinMs?: number;
  tpsMax?: number;
}

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

export type RequestLogPerformancePreset = "all" | "high_ttft" | "low_tps" | "slow_duration";

export interface RequestLogPerformanceThresholds {
  ttftMinMs?: number;
  durationMinMs?: number;
  tpsMax?: number;
}

export interface RequestLogCustomRange {
  startIso: string;
  endIso: string;
}

export interface RequestLogFilterInput {
  id?: string;
  apiKeyId?: string;
  userId?: string;
  upstreamId?: string;
  statusCode?: string | number | null;
  statusClass?: RequestLogStatusClass | "all";
  model?: string;
  timeRange?: TimeRange | "all" | "custom";
  customRange?: RequestLogCustomRange | null;
  performancePreset?: RequestLogPerformancePreset;
  performance?: RequestLogPerformanceThresholds;
}

export type RequestLogTime =
  | { kind: "preset"; value: TimeRange | "all" }
  | { kind: "custom"; startIso: string; endIso: string };

export interface RequestLogListProjectionOptions {
  scope: RequestLogScope;
  page?: number;
  pageSize?: number;
  sort?: RequestLogSort;
  readAt: Date;
}

export interface RequestLogStatsProjectionOptions {
  scope: RequestLogScope;
  readAt: Date;
}

export interface RequestLogUrlProjectionOptions {
  scope: RequestLogScope;
  sort?: RequestLogSort;
}

export interface RequestLogQueryProjection {
  search: string;
  identity: string;
}

export interface RequestLogFilter {
  readonly id?: string;
  readonly apiKeyId?: string;
  readonly userId?: string;
  readonly upstreamId?: string;
  readonly statusCode?: number;
  readonly statusClass?: RequestLogStatusClass;
  readonly model?: string;
  readonly time?: RequestLogTime;
  readonly performance: Readonly<RequestLogPerformanceThresholds>;
}

export interface RequestLogQuery {
  readonly filter: RequestLogFilter;
  list(options: RequestLogListProjectionOptions): RequestLogQueryProjection;
  stats(options: RequestLogStatsProjectionOptions): RequestLogQueryProjection;
  url(options: RequestLogUrlProjectionOptions): { search: string };
}

export interface ParsedRequestLogFilterUrl {
  query: RequestLogQuery;
  sort?: RequestLogSort;
  canonical: { search: string };
}

const DEFAULT_TIME_RANGE: TimeRange = "30d";
const HIGH_TTFT_THRESHOLD_MS = 5000;
const LOW_TPS_THRESHOLD = 30;
const SLOW_DURATION_THRESHOLD_MS = 20000;

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function parseInteger(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parseIso(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function normalizeCustomRange(
  range: RequestLogCustomRange | null | undefined
): RequestLogTime | undefined {
  if (!range) {
    return undefined;
  }
  const startIso = parseIso(range.startIso);
  const endIso = parseIso(range.endIso);
  if (!startIso || !endIso || new Date(startIso) >= new Date(endIso)) {
    return undefined;
  }
  return { kind: "custom", startIso, endIso };
}

function isTimePreset(value: unknown): value is TimeRange | "all" {
  return value === "today" || value === "7d" || value === "30d" || value === "all";
}

function normalizeTime(input: RequestLogFilterInput): RequestLogTime | undefined {
  if (input.customRange !== undefined && input.customRange !== null) {
    return (
      normalizeCustomRange(input.customRange) ?? {
        kind: "preset",
        value: DEFAULT_TIME_RANGE,
      }
    );
  }
  if (input.timeRange === "custom") {
    return { kind: "preset", value: DEFAULT_TIME_RANGE };
  }
  return isTimePreset(input.timeRange) ? { kind: "preset", value: input.timeRange } : undefined;
}

function sanitizePerformance(
  thresholds: RequestLogPerformanceThresholds | undefined
): RequestLogPerformanceThresholds {
  if (!thresholds) {
    return {};
  }
  const result: RequestLogPerformanceThresholds = {};
  if (thresholds.ttftMinMs !== undefined && Number.isInteger(thresholds.ttftMinMs)) {
    if (thresholds.ttftMinMs >= 0) result.ttftMinMs = thresholds.ttftMinMs;
  }
  if (thresholds.durationMinMs !== undefined && Number.isInteger(thresholds.durationMinMs)) {
    if (thresholds.durationMinMs >= 0) result.durationMinMs = thresholds.durationMinMs;
  }
  if (thresholds.tpsMax !== undefined && Number.isFinite(thresholds.tpsMax)) {
    if (thresholds.tpsMax > 0) result.tpsMax = thresholds.tpsMax;
  }
  return result;
}

export function performancePresetToThresholds(
  preset: RequestLogPerformancePreset | undefined
): RequestLogPerformanceThresholds {
  switch (preset) {
    case "high_ttft":
      return { ttftMinMs: HIGH_TTFT_THRESHOLD_MS };
    case "low_tps":
      return { tpsMax: LOW_TPS_THRESHOLD };
    case "slow_duration":
      return { durationMinMs: SLOW_DURATION_THRESHOLD_MS };
    default:
      return {};
  }
}
export function performanceThresholdsToPreset(
  thresholds: Readonly<RequestLogPerformanceThresholds>
): RequestLogPerformancePreset {
  if (thresholds.ttftMinMs === 5000) return "high_ttft";
  if (thresholds.tpsMax === 30) return "low_tps";
  if (thresholds.durationMinMs === 20000) return "slow_duration";
  return "all";
}

function normalizePerformance(input: RequestLogFilterInput): RequestLogPerformanceThresholds {
  return sanitizePerformance(
    input.performance ?? performancePresetToThresholds(input.performancePreset)
  );
}

export function resolveTimeRangeStart(timeRange: TimeRange, readAt: Date = new Date()): Date {
  const now = new Date(readAt);
  if (timeRange === "today") {
    return startOfDay(now);
  }
  return subDays(now, timeRange === "7d" ? 7 : 30);
}

interface NormalizedRequestLogFilterModel {
  id?: string;
  apiKeyId?: string;
  userId?: string;
  upstreamId?: string;
  statusCode?: number;
  statusClass?: RequestLogStatusClass;
  model?: string;
  time?: RequestLogTime;
  performance: RequestLogPerformanceThresholds;
}

function normalizeModel(input: RequestLogFilterInput): NormalizedRequestLogFilterModel {
  const statusCode = parseInteger(input.statusCode);
  const statusClass =
    statusCode === undefined && input.statusClass !== "all" ? input.statusClass : undefined;
  return {
    id: normalizeText(input.id),
    apiKeyId: normalizeText(input.apiKeyId),
    userId: normalizeText(input.userId),
    upstreamId: normalizeText(input.upstreamId),
    statusCode,
    statusClass,
    model: normalizeText(input.model),
    time: normalizeTime(input),
    performance: normalizePerformance(input),
  };
}

export function createRequestLogQuery(input: RequestLogFilterInput = {}): RequestLogQuery {
  const model = normalizeModel(input);
  const filter = Object.freeze({ ...model, performance: Object.freeze({ ...model.performance }) });

  return Object.freeze({
    filter,
    list(options: RequestLogListProjectionOptions) {
      const params = new URLSearchParams();
      params.set("page", String(Math.max(1, options.page ?? 1)));
      params.set("page_size", String(Math.max(1, options.pageSize ?? 20)));
      appendFilterParams(params, model, options.scope, options.readAt, true);
      appendSortParams(params, options.sort);
      return {
        search: params.toString(),
        identity: buildIdentity("list", model, options.scope, options.sort),
      };
    },
    stats(options: RequestLogStatsProjectionOptions) {
      const params = new URLSearchParams();
      appendFilterParams(params, model, options.scope, options.readAt, false);
      return {
        search: params.toString(),
        identity: buildIdentity("stats", model, options.scope),
      };
    },
    url(options: RequestLogUrlProjectionOptions) {
      const params = new URLSearchParams();
      appendFilterParams(params, model, options.scope, new Date(0), true, true);
      appendSortParams(params, options.sort, true);
      const search = params.toString();
      return { search: search ? `?${search}` : "" };
    },
  });
}

export function buildRequestLogListProjection(
  query: RequestLogQuery | undefined,
  options: Omit<RequestLogListProjectionOptions, "readAt">
): { search: string; identity: string | null } {
  if (!query) {
    return {
      search: `page=${options.page ?? 1}&page_size=${options.pageSize ?? 20}`,
      identity: null,
    };
  }

  return query.list({ ...options, readAt: new Date() });
}

function appendFilterParams(
  params: URLSearchParams,
  model: NormalizedRequestLogFilterModel,
  scope: RequestLogScope,
  readAt: Date,
  includeId: boolean,
  canonicalUrl = false
): void {
  if (includeId && model.id) params.set("id", model.id);
  if (model.apiKeyId) params.set("api_key_id", model.apiKeyId);
  if (scope === "admin" && model.userId) params.set("user_id", model.userId);
  if (scope === "admin" && model.upstreamId) params.set("upstream_id", model.upstreamId);
  if (model.statusCode !== undefined) params.set("status_code", String(model.statusCode));
  if (model.statusClass) params.set("status_class", model.statusClass);
  if (model.model) params.set("model", model.model);

  if (model.time?.kind === "custom") {
    params.set("start_time", model.time.startIso);
    params.set("end_time", model.time.endIso);
  } else if (model.time?.kind === "preset") {
    if (canonicalUrl) {
      if (model.time.value === "all") params.set("time_range", "all");
      else if (model.time.value !== DEFAULT_TIME_RANGE) params.set("time_range", model.time.value);
    } else if (model.time.value !== "all") {
      params.set("start_time", resolveTimeRangeStart(model.time.value, readAt).toISOString());
    }
  }

  if (model.performance.ttftMinMs !== undefined) {
    params.set("ttft_min_ms", String(model.performance.ttftMinMs));
  }
  if (model.performance.durationMinMs !== undefined) {
    params.set("duration_min_ms", String(model.performance.durationMinMs));
  }
  if (model.performance.tpsMax !== undefined) {
    params.set("tps_max", String(model.performance.tpsMax));
  }
}

function appendSortParams(
  params: URLSearchParams,
  sort: RequestLogSort | undefined,
  canonicalUrl = false
) {
  if (!sort) return;
  if (canonicalUrl && sort.field === "created_at" && sort.order === "desc") return;
  params.set("sort", sort.field);
  params.set("order", sort.order);
}

function buildIdentity(
  kind: "list" | "stats",
  model: NormalizedRequestLogFilterModel,
  scope: RequestLogScope,
  sort?: RequestLogSort
): string {
  const projected = {
    kind,
    scope,
    id: kind === "list" ? model.id : undefined,
    apiKeyId: model.apiKeyId,
    userId: scope === "admin" ? model.userId : undefined,
    upstreamId: scope === "admin" ? model.upstreamId : undefined,
    statusCode: model.statusCode,
    statusClass: model.statusClass,
    model: model.model,
    time: model.time,
    performance: model.performance,
    sort: kind === "list" ? sort : undefined,
  };
  return JSON.stringify(projected);
}

function parseUrlInteger(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) ? value : undefined;
}

function parseUrlPerformance(params: URLSearchParams): RequestLogPerformanceThresholds | undefined {
  const performance = sanitizePerformance({
    ttftMinMs: parseUrlInteger(params.get("ttft_min_ms")),
    durationMinMs: parseUrlInteger(params.get("duration_min_ms")),
    tpsMax: params.get("tps_max") ? Number(params.get("tps_max")) : undefined,
  });
  return Object.keys(performance).length > 0 ? performance : undefined;
}

function parseUrlTime(
  params: URLSearchParams
): Pick<RequestLogFilterInput, "timeRange" | "customRange"> {
  const startRaw = params.get("start_time");
  const endRaw = params.get("end_time");
  if (startRaw !== null || endRaw !== null) {
    const startIso = parseIso(startRaw ?? undefined);
    const endIso = parseIso(endRaw ?? undefined);
    if (startIso && endIso && new Date(startIso) < new Date(endIso)) {
      return { timeRange: "custom", customRange: { startIso, endIso } };
    }
    return { timeRange: DEFAULT_TIME_RANGE };
  }

  const timeRange = params.get("time_range");
  if (timeRange === null) return {};
  return isTimePreset(timeRange) ? { timeRange } : { timeRange: DEFAULT_TIME_RANGE };
}

function parseUrlSort(params: URLSearchParams): RequestLogSort | undefined {
  const field = params.get("sort");
  if (!field || !(REQUEST_LOG_SORT_FIELDS as readonly string[]).includes(field)) return undefined;
  const rawOrder = params.get("order");
  const order = rawOrder === "asc" || rawOrder === "desc" ? rawOrder : "desc";
  return { field: field as RequestLogSortField, order };
}

export function parseRequestLogFilterUrl(
  url: URL,
  scope: RequestLogScope
): ParsedRequestLogFilterUrl {
  const params = url.searchParams;
  const statusCode = parseUrlInteger(params.get("status_code"));
  const rawStatusClass = params.get("status_class");
  const statusClass =
    rawStatusClass === "2xx" || rawStatusClass === "4xx" || rawStatusClass === "5xx"
      ? rawStatusClass
      : undefined;
  const sort = parseUrlSort(params);
  const query = createRequestLogQuery({
    id: normalizeText(params.get("id") ?? undefined),
    apiKeyId: normalizeText(params.get("api_key_id") ?? undefined),
    userId: normalizeText(params.get("user_id") ?? undefined),
    upstreamId: normalizeText(params.get("upstream_id") ?? undefined),
    statusCode,
    statusClass,
    model: normalizeText(params.get("model") ?? undefined),
    ...parseUrlTime(params),
    performance: parseUrlPerformance(params),
  });
  return {
    query,
    sort,
    canonical: query.url({ scope, sort }),
  };
}

export type ParsedRequestLogListQuery =
  | { ok: true; filters: RequestLogFilterCriteria; sort?: RequestLogSort }
  | { ok: false; error: string };

/**
 * Shared query-string parser for request-log list and stats endpoints.
 * Server callers reject malformed transport values; URL recovery uses
 * parseRequestLogFilterUrl instead and deliberately falls back to 30d.
 */
export function parseRequestLogListQuery(
  url: URL,
  scope: RequestLogScope
): ParsedRequestLogListQuery {
  const params = url.searchParams;
  const filters: RequestLogFilterCriteria = {};

  const id = params.get("id");
  if (id) filters.id = id;

  const apiKeyId = params.get("api_key_id");
  if (apiKeyId) filters.apiKeyId = apiKeyId;

  if (scope === "admin") {
    const userId = params.get("user_id");
    if (userId) filters.userId = userId;

    const upstreamId = params.get("upstream_id");
    if (upstreamId) filters.upstreamId = upstreamId;
  }

  const statusCode = parseIntFilterParam(params.get("status_code"));
  if (statusCode === null) return { ok: false, error: "Invalid status_code" };
  if (statusCode !== undefined) filters.statusCode = statusCode;

  const statusClass = params.get("status_class");
  if (statusClass) {
    if (statusClass !== "2xx" && statusClass !== "4xx" && statusClass !== "5xx") {
      return { ok: false, error: "Invalid status_class" };
    }
    filters.statusClass = statusClass;
  }

  const model = params.get("model")?.trim();
  if (model) filters.model = model;

  const startTime = parseDateFilterParam(params.get("start_time"));
  if (startTime === null) return { ok: false, error: "Invalid start_time" };

  const endTime = parseDateFilterParam(params.get("end_time"));
  if (endTime === null) return { ok: false, error: "Invalid end_time" };
  if (startTime !== undefined && endTime !== undefined && startTime >= endTime) {
    return { ok: false, error: "Invalid time range" };
  }
  if (startTime !== undefined) filters.startTime = startTime;
  if (endTime !== undefined) filters.endTime = endTime;

  const ttftMinMs = parseIntFilterParam(params.get("ttft_min_ms"));
  if (ttftMinMs === null || (ttftMinMs !== undefined && ttftMinMs < 0)) {
    return { ok: false, error: "Invalid ttft_min_ms" };
  }
  if (ttftMinMs !== undefined) filters.ttftMinMs = ttftMinMs;

  const durationMinMs = parseIntFilterParam(params.get("duration_min_ms"));
  if (durationMinMs === null || (durationMinMs !== undefined && durationMinMs < 0)) {
    return { ok: false, error: "Invalid duration_min_ms" };
  }
  if (durationMinMs !== undefined) filters.durationMinMs = durationMinMs;

  const tpsMaxRaw = params.get("tps_max");
  if (tpsMaxRaw) {
    const tpsMax = Number(tpsMaxRaw);
    if (!Number.isFinite(tpsMax) || tpsMax <= 0) {
      return { ok: false, error: "Invalid tps_max" };
    }
    filters.tpsMax = tpsMax;
  }

  let sort: RequestLogSort | undefined;
  const sortRaw = params.get("sort");
  const orderRaw = params.get("order");
  if (orderRaw && orderRaw !== "asc" && orderRaw !== "desc") {
    return { ok: false, error: "Invalid order" };
  }
  if (sortRaw) {
    if (!(REQUEST_LOG_SORT_FIELDS as readonly string[]).includes(sortRaw)) {
      return { ok: false, error: "Invalid sort" };
    }
    sort = { field: sortRaw as RequestLogSortField, order: orderRaw === "asc" ? "asc" : "desc" };
  }

  return { ok: true, filters, sort };
}
