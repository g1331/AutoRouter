import type { CustomDateRange } from "@/hooks/use-dashboard-stats";
import { PRESET_RANGES, type TimeRangeOrCustom } from "@/components/dashboard/time-range-selector";
import type { RankingsDimension, RankingsItem, RankingsSortField, TimeRange } from "@/types/api";

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

export interface RankingsFilterState {
  /** Case-insensitive substring match on the item name fields. */
  query: string;
  /** Hide items with fewer requests than this (0 = off). */
  minRequests: number;
  /** Only show items with a non-zero error rate. */
  errorsOnly: boolean;
  /** models dimension only: keep items served by this upstream ("" = off). */
  upstream: string;
}

export interface RankingsViewState extends RankingsFilterState {
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
  query: "",
  minRequests: 0,
  errorsOnly: false,
  upstream: "",
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

  const minRaw = Number.parseInt(params.get("min") ?? "", 10);
  const dimension =
    dim && RANKINGS_DIMENSIONS.includes(dim) ? dim : DEFAULT_RANKINGS_STATE.dimension;

  return {
    dimension,
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
    query: params.get("q") ?? "",
    minRequests: Number.isFinite(minRaw) && minRaw > 0 ? minRaw : 0,
    errorsOnly: params.get("errors") === "1",
    // The upstream filter only exists on the models dimension; dropping it here
    // keeps a stale ?upstream= on other dimensions from becoming a ghost filter
    // (Reset button shown with no visible control, dead param re-serialized).
    upstream: dimension === "models" ? (params.get("upstream") ?? "") : "",
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
  if (state.query) params.set("q", state.query);
  if (state.minRequests > 0) params.set("min", String(state.minRequests));
  if (state.errorsOnly) params.set("errors", "1");
  if (state.upstream) params.set("upstream", state.upstream);
  return params.toString();
}

// Keep in sync with ItemName in rankings-table.tsx: search must match exactly
// the fields the name cell renders, or users can search visible text and miss.
function itemSearchTexts(item: RankingsItem): string[] {
  if ("model" in item) return [item.model];
  if ("provider_type" in item) return [item.name, item.provider_type];
  if ("key_prefix" in item) return [item.name, item.key_prefix];
  return [item.display_name, item.username];
}

// Pure client-side filtering: the leaderboard endpoint returns the full
// aggregated set in one response, so search/threshold filters never need a
// server round-trip. The upstream filter only applies to items that carry an
// upstream_distribution (models dimension); other dimensions ignore it so a
// stale `upstream` URL param can't blank out an unrelated view.
export function filterRankingsItems(
  items: RankingsItem[],
  filters: RankingsFilterState
): RankingsItem[] {
  const query = filters.query.trim().toLowerCase();
  return items.filter((item) => {
    if (query && !itemSearchTexts(item).some((text) => text.toLowerCase().includes(query))) {
      return false;
    }
    if (filters.minRequests > 0 && item.request_count < filters.minRequests) return false;
    if (filters.errorsOnly && item.error_rate <= 0) return false;
    if (
      filters.upstream &&
      "upstream_distribution" in item &&
      !item.upstream_distribution.some((d) => d.name === filters.upstream)
    ) {
      return false;
    }
    return true;
  });
}

export function hasActiveFilters(state: RankingsFilterState): boolean {
  return Boolean(state.query || state.minRequests > 0 || state.errorsOnly || state.upstream);
}
