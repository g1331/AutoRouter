"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import type {
  StatsLeaderboardResponse,
  StatsOverviewResponse,
  StatsTimeseriesResponse,
  TimeRange,
} from "@/types/api";

export function useStatsOverview() {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["stats", "overview"],
    queryFn: () => apiClient.get<StatsOverviewResponse>("/admin/stats/overview"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export type TimeseriesMetric = "requests" | "ttft" | "tps" | "tokens" | "duration" | "cost";

export interface CustomDateRange {
  start: Date;
  end: Date;
}

export function useStatsTimeseries(
  range: TimeRange | "custom" = "7d",
  metric: TimeseriesMetric = "requests",
  customRange?: CustomDateRange
) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["stats", "timeseries", range, metric, customRange?.start, customRange?.end],
    queryFn: () => {
      let url = `/admin/stats/timeseries?range=${range}&metric=${metric}`;
      if (range === "custom" && customRange) {
        url += `&start_date=${customRange.start.toISOString()}&end_date=${customRange.end.toISOString()}`;
      }
      return apiClient.get<StatsTimeseriesResponse>(url);
    },
    enabled: range !== "custom" || (!!customRange?.start && !!customRange?.end),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useStatsLeaderboard(range: TimeRange = "7d", limit: number = 5) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["stats", "leaderboard", range, limit],
    queryFn: () =>
      apiClient.get<StatsLeaderboardResponse>(
        `/admin/stats/leaderboard?range=${range}&limit=${limit}`
      ),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
