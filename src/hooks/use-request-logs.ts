import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import type { PaginatedRequestLogsResponse } from "@/types/api";

export interface RequestLogsFilters {
  api_key_id?: string;
  upstream_id?: string;
  status_code?: number;
  start_time?: string; // ISO 8601
  end_time?: string; // ISO 8601
}

/**
 * Fetch paginated request logs with optional filters
 */
export function useRequestLogs(
  page: number = 1,
  pageSize: number = 20,
  filters?: RequestLogsFilters
) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["request-logs", page, pageSize, filters],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));

      if (filters?.api_key_id) {
        params.set("api_key_id", filters.api_key_id);
      }
      if (filters?.upstream_id) {
        params.set("upstream_id", filters.upstream_id);
      }
      if (filters?.status_code !== undefined) {
        params.set("status_code", String(filters.status_code));
      }
      if (filters?.start_time) {
        params.set("start_time", filters.start_time);
      }
      if (filters?.end_time) {
        params.set("end_time", filters.end_time);
      }

      return apiClient.get<PaginatedRequestLogsResponse>(`/admin/logs?${params.toString()}`);
    },
  });
}
