import type { CustomDateRange } from "@/hooks/use-dashboard-stats";
import type { TimeRangeOrCustom } from "@/components/dashboard/time-range-selector";
import type { RankingsDimension, RankingsSortField } from "@/types/api";

export const RANKINGS_DIMENSIONS: RankingsDimension[] = [
  "upstreams",
  "models",
  "api_keys",
  "users",
];

export const RANKINGS_SORT_FIELDS: RankingsSortField[] = [
  "requests",
  "tokens",
  "cost",
  "ttft",
  "tps",
  "cache_hit",
  "error_rate",
];

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
        : range === "today" || range === "7d" || range === "30d"
          ? range
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
