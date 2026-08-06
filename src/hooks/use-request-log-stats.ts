import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import type { RequestLogStatsResponse } from "@/types/api";
import type { RequestLogFilter } from "@/lib/utils/request-log-filters";

export type RequestLogStatsScope = "admin" | "user";

export interface UseRequestLogStatsOptions {
  enabled?: boolean;
}

const STATS_REFETCH_INTERVAL_MS = 30_000;

/**
 * Window-scoped log stats. Filter projections intentionally omit id, paging
 * and sorting, so live log events do not invalidate percentile queries.
 */
export function useRequestLogStats(
  scope: RequestLogStatsScope,
  filter?: RequestLogFilter,
  options?: UseRequestLogStatsOptions
) {
  const { apiClient } = useAuth();
  const statsIdentity = filter?.stats({ scope, readAt: new Date() }).identity;

  return useQuery({
    queryKey: ["request-log-stats", scope, statsIdentity ?? null],
    queryFn: () => {
      const search = filter?.stats({ scope, readAt: new Date() }).search ?? "";
      const basePath = scope === "admin" ? "/admin/logs/stats" : "/user/logs/stats";
      return apiClient.get<RequestLogStatsResponse>(search ? `${basePath}?${search}` : basePath);
    },
    enabled: options?.enabled ?? true,
    refetchInterval: STATS_REFETCH_INTERVAL_MS,
    // Keep the previous window's numbers while a filter change refetches.
    placeholderData: (previous) => previous,
  });
}
