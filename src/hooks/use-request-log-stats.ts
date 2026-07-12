import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import { resolveTimeRangeStart, type RequestLogsFilters } from "@/hooks/use-request-logs";
import type { RequestLogStatsResponse } from "@/types/api";

export type RequestLogStatsScope = "admin" | "user";

// Same filter surface as the list hooks minus pagination and sorting: stats
// describe the window, so a sort change must not refire percentile queries.
export type RequestLogStatsFilters = Omit<RequestLogsFilters, "id" | "sort" | "order">;

export interface UseRequestLogStatsOptions {
  enabled?: boolean;
}

const STATS_REFETCH_INTERVAL_MS = 30_000;

/**
 * Window-scoped log stats. The query key is deliberately NOT under the
 * ["request-logs"] / ["portal","logs"] prefixes: live SSE log events
 * invalidate those, and the percentile queries must not run per event.
 */
export function useRequestLogStats(
  scope: RequestLogStatsScope,
  filters?: RequestLogStatsFilters,
  options?: UseRequestLogStatsOptions
) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["request-log-stats", scope, filters],
    queryFn: () => {
      const params = new URLSearchParams();

      if (scope === "admin" && filters?.user_id) {
        params.set("user_id", filters.user_id);
      }
      if (scope === "admin" && filters?.upstream_id) {
        params.set("upstream_id", filters.upstream_id);
      }
      if (filters?.api_key_id) {
        params.set("api_key_id", filters.api_key_id);
      }
      if (filters?.status_code !== undefined) {
        params.set("status_code", String(filters.status_code));
      }
      if (filters?.status_class) {
        params.set("status_class", filters.status_class);
      }
      if (filters?.model) {
        params.set("model", filters.model);
      }
      const timeRange = filters?.time_range;
      if (filters?.start_time) {
        params.set("start_time", filters.start_time);
      } else if (timeRange && timeRange !== "all") {
        params.set("start_time", resolveTimeRangeStart(timeRange).toISOString());
      }
      if (filters?.end_time) {
        params.set("end_time", filters.end_time);
      }
      if (filters?.ttft_min_ms !== undefined) {
        params.set("ttft_min_ms", String(filters.ttft_min_ms));
      }
      if (filters?.duration_min_ms !== undefined) {
        params.set("duration_min_ms", String(filters.duration_min_ms));
      }
      if (filters?.tps_max !== undefined) {
        params.set("tps_max", String(filters.tps_max));
      }

      const basePath = scope === "admin" ? "/admin/logs/stats" : "/user/logs/stats";
      const query = params.toString();
      return apiClient.get<RequestLogStatsResponse>(query ? `${basePath}?${query}` : basePath);
    },
    enabled: options?.enabled ?? true,
    refetchInterval: STATS_REFETCH_INTERVAL_MS,
    // Keep the previous window's numbers while a filter change refetches so
    // the tiles don't flash back to skeletons.
    placeholderData: (previous) => previous,
  });
}
