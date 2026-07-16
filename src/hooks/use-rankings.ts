"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import { browserTzOffsetMinutes, type CustomDateRange } from "@/hooks/use-dashboard-stats";
import type {
  RankingsDimension,
  RankingsSortField,
  StatsRankingsResponse,
  TimeRange,
} from "@/types/api";

export interface RankingsParams {
  dimension: RankingsDimension;
  range: TimeRange | "custom";
  sortBy: RankingsSortField;
  order: "asc" | "desc";
  customRange?: CustomDateRange;
}

export function useRankings({ dimension, range, sortBy, order, customRange }: RankingsParams) {
  const { apiClient } = useAuth();
  const tzOffset = browserTzOffsetMinutes();

  return useQuery({
    queryKey: [
      "stats",
      "rankings",
      dimension,
      range,
      sortBy,
      order,
      customRange?.start,
      customRange?.end,
      tzOffset,
    ],
    queryFn: () => {
      let url =
        `/admin/stats/leaderboard?dimension=${dimension}&range=${range}` +
        `&sort_by=${sortBy}&order=${order}&limit=50&compare=true&tz_offset=${tzOffset}`;
      if (range === "custom" && customRange) {
        url += `&start_date=${customRange.start.toISOString()}&end_date=${customRange.end.toISOString()}`;
      }
      return apiClient.get<StatsRankingsResponse>(url);
    },
    enabled: range !== "custom" || (!!customRange?.start && !!customRange?.end),
    staleTime: 30_000,
  });
}
