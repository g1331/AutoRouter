import { useQuery } from "@tanstack/react-query";
import { startOfDay, subDays } from "date-fns";
import { useAuth } from "@/providers/auth-provider";
import type { PaginatedRequestLogsResponse, TimeRange } from "@/types/api";

export interface RequestLogsFilters {
  id?: string;
  api_key_id?: string;
  user_id?: string;
  upstream_id?: string;
  status_code?: number;
  status_class?: "2xx" | "4xx" | "5xx";
  model?: string;
  start_time?: string; // ISO 8601
  end_time?: string; // ISO 8601
  // Preset resolved to start_time at fetch time so the query key stays stable
  // while live refetches keep a fresh boundary. Ignored when start_time is set;
  // "all" applies no lower bound.
  time_range?: TimeRange | "all";
}

export interface UseRequestLogsOptions {
  refetchInterval?: number | false;
}

export function resolveTimeRangeStart(timeRange: TimeRange): Date {
  const now = new Date();
  if (timeRange === "today") {
    return startOfDay(now);
  }
  return subDays(now, timeRange === "7d" ? 7 : 30);
}

/**
 * Fetch paginated request logs with optional filters
 */
export function useRequestLogs(
  page: number = 1,
  pageSize: number = 20,
  filters?: RequestLogsFilters,
  options?: UseRequestLogsOptions
) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["request-logs", page, pageSize, filters],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));

      if (filters?.id) {
        params.set("id", filters.id);
      }
      if (filters?.api_key_id) {
        params.set("api_key_id", filters.api_key_id);
      }
      if (filters?.user_id) {
        params.set("user_id", filters.user_id);
      }
      if (filters?.upstream_id) {
        params.set("upstream_id", filters.upstream_id);
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

      return apiClient.get<PaginatedRequestLogsResponse>(`/admin/logs?${params.toString()}`);
    },
    refetchInterval: options?.refetchInterval,
    // Keep previous data during filter/pagination changes so the filter bar
    // stays mounted instead of flashing the loading skeleton. Never carry data
    // across the list/focus boundary: a focus query must not render the stale
    // list page (and vice versa), so those transitions show the skeleton.
    placeholderData: (previous, previousQuery) => {
      const previousFilters = previousQuery?.queryKey[3] as RequestLogsFilters | undefined;
      if ((previousFilters?.id ?? null) !== (filters?.id ?? null)) {
        return undefined;
      }
      return previous;
    },
  });
}
