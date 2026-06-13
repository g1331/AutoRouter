import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import type { PaginatedRequestLogsResponse } from "@/types/api";

export interface PortalRequestLogsFilters {
  api_key_id?: string;
  status_code?: number;
  start_time?: string; // ISO 8601
  end_time?: string; // ISO 8601
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
      if (filters?.start_time) {
        params.set("start_time", filters.start_time);
      }
      if (filters?.end_time) {
        params.set("end_time", filters.end_time);
      }

      return apiClient.get<PaginatedRequestLogsResponse>(`/user/logs?${params.toString()}`);
    },
    refetchInterval: options?.refetchInterval,
  });
}
