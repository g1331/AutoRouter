import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import { resolveTimeRangeStart } from "@/hooks/use-request-logs";
import type { PaginatedRequestLogsResponse, TimeRange } from "@/types/api";

export interface PortalRequestLogsFilters {
  api_key_id?: string;
  status_code?: number;
  status_class?: "2xx" | "4xx" | "5xx";
  model?: string;
  start_time?: string; // ISO 8601
  end_time?: string; // ISO 8601
  // Preset resolved to start_time at fetch time; ignored when start_time is
  // set. "all" applies no lower bound.
  time_range?: TimeRange | "all";
}

export interface UsePortalRequestLogsOptions {
  refetchInterval?: number | false;
}

/**
 * Fetch the caller's own request logs. The owner scope is enforced
 * server-side; filters keep AND semantics and can only narrow the result.
 */
export function usePortalRequestLogs(
  page: number = 1,
  pageSize: number = 20,
  filters?: PortalRequestLogsFilters,
  options?: UsePortalRequestLogsOptions
) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["portal", "logs", page, pageSize, filters],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));

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

      return apiClient.get<PaginatedRequestLogsResponse>(`/user/logs?${params.toString()}`);
    },
    refetchInterval: options?.refetchInterval,
    // Keep previous data during filter/pagination changes so the filter bar
    // stays mounted instead of flashing the loading skeleton.
    placeholderData: (previous) => previous,
  });
}
