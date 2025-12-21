"use client";

/**
 * Dashboard statistics hooks
 *
 * Provides React Query hooks for fetching dashboard statistics:
 * - Overview stats (today's metrics)
 * - Time series data (for charts)
 * - Leaderboard data (top performers)
 */

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import type {
  StatsLeaderboardResponse,
  StatsOverviewResponse,
  StatsTimeseriesResponse,
  TimeRange,
} from "@/types/api";

/**
 * Fetch overview statistics for the dashboard.
 *
 * Returns today's metrics including:
 * - Total requests
 * - Average response time
 * - Total tokens consumed
 * - Success rate
 */
export function useStatsOverview() {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["stats", "overview"],
    queryFn: () => apiClient.get<StatsOverviewResponse>("/admin/stats/overview"),
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // Auto-refresh every minute
  });
}

/**
 * Fetch time series statistics for chart visualization.
 *
 * Returns aggregated data points grouped by upstream for the specified time range.
 *
 * @param range - Time range: "today", "7d", or "30d"
 */
export function useStatsTimeseries(range: TimeRange = "7d") {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["stats", "timeseries", range],
    queryFn: () =>
      apiClient.get<StatsTimeseriesResponse>(`/admin/stats/timeseries?range=${range}`),
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // Auto-refresh every minute
  });
}

/**
 * Fetch leaderboard statistics for top performers.
 *
 * Returns top API keys, upstreams, and models by usage.
 *
 * @param range - Time range: "today", "7d", or "30d"
 * @param limit - Maximum items per category (default: 5)
 */
export function useStatsLeaderboard(range: TimeRange = "7d", limit: number = 5) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ["stats", "leaderboard", range, limit],
    queryFn: () =>
      apiClient.get<StatsLeaderboardResponse>(
        `/admin/stats/leaderboard?range=${range}&limit=${limit}`
      ),
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // Auto-refresh every minute
  });
}
