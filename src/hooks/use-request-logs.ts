import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import type { PaginatedRequestLogsResponse } from "@/types/api";
import {
  buildRequestLogListProjection,
  type RequestLogQuery,
  type RequestLogSort,
} from "@/lib/utils/request-log-query";

export interface UseRequestLogsOptions {
  refetchInterval?: number | false;
  sort?: RequestLogSort;
}

/**
 * Fetch paginated admin request logs. RequestLogQuery owns filter semantics
 * and serialization; this hook owns TanStack Query and refresh policy.
 */
export function useRequestLogs(
  page: number = 1,
  pageSize: number = 20,
  query?: RequestLogQuery,
  options?: UseRequestLogsOptions
) {
  const { apiClient } = useAuth();
  const listProjection = buildRequestLogListProjection(query, {
    scope: "admin",
    page,
    pageSize,
    sort: options?.sort,
  });
  const focusId = query?.filter.id ?? null;

  return useQuery({
    queryKey: ["request-logs", page, pageSize, listProjection.identity, focusId],
    queryFn: () => {
      // Keep relative time bounds fresh on every fetch without changing the cache identity.
      const search = buildRequestLogListProjection(query, {
        scope: "admin",
        page,
        pageSize,
        sort: options?.sort,
      }).search;
      return apiClient.get<PaginatedRequestLogsResponse>(`/admin/logs?${search}`);
    },
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
