import type { CustomDateRange } from "@/hooks/use-dashboard-stats";
import { PRESET_RANGES, type TimeRangeOrCustom } from "@/components/dashboard/time-range-selector";
import type { RankingsDimension, RankingsSortField, TimeRange } from "@/types/api";

// Derived from Record keys so the compiler errors here whenever the unions in
// types/api.ts gain or lose a member — a plain literal array would silently
// drift and make readStateFromUrl reject valid shared URLs.
const DIMENSION_FLAGS: Record<RankingsDimension, true> = {
  upstreams: true,
  models: true,
  api_keys: true,
  users: true,
};

const SORT_FIELD_FLAGS: Record<RankingsSortField, true> = {
  requests: true,
  tokens: true,
  cost: true,
  ttft: true,
  tps: true,
  cache_hit: true,
  error_rate: true,
};

export const RANKINGS_DIMENSIONS = Object.keys(DIMENSION_FLAGS) as RankingsDimension[];

export const RANKINGS_SORT_FIELDS = Object.keys(SORT_FIELD_FLAGS) as RankingsSortField[];

export interface RankingsViewState {
  dimension: RankingsDimension;
  range: TimeRangeOrCustom;
  sortBy: RankingsSortField;
  order: "asc" | "desc";
  customRange?: CustomDateRange;
}

export const DEFAULT_RANKINGS_STATE: RankingsViewState = {
  dimension: "upstreams",
  range: "7d",
  sortBy: "requests",
  order: "desc",
};

// The view state lives in the URL (dim/range/sort/order/start/end) so that
// navigating to the logs page and coming back restores the exact ranking view.
export function readStateFromUrl(params: URLSearchParams): RankingsViewState {
  const dim = params.get("dim") as RankingsDimension | null;
  const sort = params.get("sort") as RankingsSortField | null;
  const order = params.get("order");
  const range = params.get("range");

  let customRange: CustomDateRange | undefined;
  if (range === "custom") {
    const start = new Date(params.get("start") ?? "");
    const end = new Date(params.get("end") ?? "");
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start < end) {
      customRange = { start, end };
    }
  }

  return {
    dimension: dim && RANKINGS_DIMENSIONS.includes(dim) ? dim : DEFAULT_RANKINGS_STATE.dimension,
    range:
      range === "custom"
        ? customRange
          ? "custom"
          : DEFAULT_RANKINGS_STATE.range
        : range && PRESET_RANGES.includes(range as TimeRange)
          ? (range as TimeRange)
          : DEFAULT_RANKINGS_STATE.range,
    sortBy: sort && RANKINGS_SORT_FIELDS.includes(sort) ? sort : DEFAULT_RANKINGS_STATE.sortBy,
    order: order === "asc" ? "asc" : "desc",
    customRange,
  };
}

export function buildQuery(state: RankingsViewState): string {
  const params = new URLSearchParams();
  if (state.dimension !== DEFAULT_RANKINGS_STATE.dimension) params.set("dim", state.dimension);
  if (state.range !== DEFAULT_RANKINGS_STATE.range) params.set("range", state.range);
  if (state.sortBy !== DEFAULT_RANKINGS_STATE.sortBy) params.set("sort", state.sortBy);
  if (state.order !== DEFAULT_RANKINGS_STATE.order) params.set("order", state.order);
  if (state.range === "custom" && state.customRange) {
    params.set("start", state.customRange.start.toISOString());
    params.set("end", state.customRange.end.toISOString());
  }
  return params.toString();
}
