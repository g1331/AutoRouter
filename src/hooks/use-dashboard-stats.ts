"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import type {
  StatsLeaderboardResponse,
  StatsOverviewResponse,
  StatsTimeseriesResponse,
  TimeRange,
} from "@/types/api";

// Minutes east of UTC (getTimezoneOffset is west-positive). Sent as tz_offset
// so preset windows ("today") align to the browser's local midnight, matching
// the request-logs list semantics.
function browserTzOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

export function useStatsOverview() {
  const { apiClient } = useAuth();
  const tzOffset = browserTzOffsetMinutes();

  return useQuery({
    queryKey: ["stats", "overview", tzOffset],
    queryFn: () =>
      apiClient.get<StatsOverviewResponse>(`/admin/stats/overview?tz_offset=${tzOffset}`),
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
  const tzOffset = browserTzOffsetMinutes();

  return useQuery({
    queryKey: [
      "stats",
      "timeseries",
      range,
      metric,
      customRange?.start,
      customRange?.end,
      tzOffset,
    ],
    queryFn: () => {
      let url = `/admin/stats/timeseries?range=${range}&metric=${metric}&tz_offset=${tzOffset}`;
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

export function useStatsLeaderboard(
  range: TimeRange | "custom" = "7d",
  limit: number = 5,
  customRange?: CustomDateRange
) {
  const { apiClient } = useAuth();
  const tzOffset = browserTzOffsetMinutes();

  return useQuery({
    queryKey: [
      "stats",
      "leaderboard",
      range,
      limit,
      customRange?.start,
      customRange?.end,
      tzOffset,
    ],
    queryFn: () => {
      let url = `/admin/stats/leaderboard?range=${range}&limit=${limit}&tz_offset=${tzOffset}`;
      if (range === "custom" && customRange) {
        url += `&start_date=${customRange.start.toISOString()}&end_date=${customRange.end.toISOString()}`;
      }
      return apiClient.get<StatsLeaderboardResponse>(url);
    },
    enabled: range !== "custom" || (!!customRange?.start && !!customRange?.end),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
