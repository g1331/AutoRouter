import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import type { PaginatedRequestLogsResponse } from "@/types/api";
import {
  buildRequestLogListProjection,
  type RequestLogFilter,
  type RequestLogSort,
} from "@/lib/utils/request-log-filters";

export interface UseRequestLogsOptions {
  refetchInterval?: number | false;
  sort?: RequestLogSort;
}

/**
 * Fetch paginated admin request logs. Filter semantics and query serialization
 * belong to RequestLogFilter; this hook owns TanStack Query and refresh policy.
 */
export function useRequestLogs(
  page: number = 1,
  pageSize: number = 20,
  filter?: RequestLogFilter,
  options?: UseRequestLogsOptions
) {
  const { apiClient } = useAuth();
  const listProjection = buildRequestLogListProjection(filter, {
    scope: "admin",
    page,
    pageSize,
    sort: options?.sort,
  });
  const focusId = filter?.id ?? null;

  return useQuery({
    queryKey: ["request-logs", page, pageSize, listProjection.identity, focusId],
    queryFn: () =>
      apiClient.get<PaginatedRequestLogsResponse>(`/admin/logs?${listProjection.search}`),
    refetchInterval: options?.refetchInterval,
    // Keep previous data during filter/pagination changes so the filter bar
    // stays mounted, but never carry a list page into a focused log view.
    placeholderData: (previous, previousQuery) => {
      const previousFocusId = previousQuery?.queryKey[4] as string | null | undefined;
      if (previousFocusId !== focusId) {
        return undefined;
      }
      return previous;
    },
  });
}
