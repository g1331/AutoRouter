import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import type { PaginatedRequestLogsResponse } from "@/types/api";
import {
  buildRequestLogListProjection,
  type RequestLogQuery,
  type RequestLogSort,
} from "@/lib/utils/request-log-query";

export interface UsePortalRequestLogsOptions {
  refetchInterval?: number | false;
  sort?: RequestLogSort;
}

/**
 * Fetch the caller's own request logs. Owner scope remains server-enforced;
 * this hook only adapts a RequestLogQuery to TanStack Query.
 */
export function usePortalRequestLogs(
  page: number = 1,
  pageSize: number = 20,
  query?: RequestLogQuery,
  options?: UsePortalRequestLogsOptions
) {
  const { apiClient } = useAuth();
  const listProjection = buildRequestLogListProjection(query, {
    scope: "user",
    page,
    pageSize,
    sort: options?.sort,
  });

  return useQuery({
    queryKey: ["portal", "logs", page, pageSize, listProjection.identity],
    queryFn: () =>
      apiClient.get<PaginatedRequestLogsResponse>(`/user/logs?${listProjection.search}`),
    refetchInterval: options?.refetchInterval,
    // Keep previous data during filter changes so the filter bar stays mounted.
    placeholderData: (previous) => previous,
  });
}
