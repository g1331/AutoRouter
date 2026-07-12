import { parseDateFilterParam, parseIntFilterParam } from "./api-auth";
import type {
  ListRequestLogsFilter,
  RequestLogSort,
  RequestLogSortField,
} from "@/lib/services/request-logger";

// Local literal list (instead of importing the runtime constant) so this
// module stays type-only on the service layer and route tests can mock
// request-logger freely; `satisfies` keeps it aligned with the service type.
const SORT_FIELDS = [
  "created_at",
  "duration_ms",
  "total_tokens",
  "ttft_ms",
  "cost",
] as const satisfies readonly RequestLogSortField[];

/**
 * Which caller-controlled scopes are honored:
 * - `admin`: full filter surface (user_id / upstream_id included).
 * - `user`: owner scope is injected server-side from the principal, so
 *   user_id and upstream_id query params are ignored entirely.
 */
export type RequestLogQueryScope = "admin" | "user";

export type ParsedRequestLogListQuery =
  | { ok: true; filters: ListRequestLogsFilter; sort?: RequestLogSort }
  | { ok: false; error: string };

/**
 * Shared query-string parser for the request-log list and stats endpoints,
 * guaranteeing identical filter semantics across them.
 */
export function parseRequestLogListQuery(
  url: URL,
  scope: RequestLogQueryScope
): ParsedRequestLogListQuery {
  const params = url.searchParams;
  const filters: ListRequestLogsFilter = {};

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
  if (startTime !== undefined) filters.startTime = startTime;

  const endTime = parseDateFilterParam(params.get("end_time"));
  if (endTime === null) return { ok: false, error: "Invalid end_time" };
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
    if (!(SORT_FIELDS as readonly string[]).includes(sortRaw)) {
      return { ok: false, error: "Invalid sort" };
    }
    sort = { field: sortRaw as RequestLogSortField, order: orderRaw === "asc" ? "asc" : "desc" };
  }

  return { ok: true, filters, sort };
}
