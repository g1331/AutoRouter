import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import {
  useStatsOverview,
  useStatsTimeseries,
  useStatsLeaderboard,
} from "@/hooks/use-dashboard-stats";
import type {
  StatsOverviewResponse,
  StatsTimeseriesResponse,
  StatsLeaderboardResponse,
} from "@/types/api";

// Mock API client
const mockGet = vi.fn();

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    apiClient: {
      get: mockGet,
    },
  }),
}));

describe("use-dashboard-stats hooks", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  describe("useStatsOverview", () => {
    it("fetches overview stats", async () => {
      const mockResponse: StatsOverviewResponse = {
        today_requests: 1000,
        avg_response_time_ms: 250,
        total_tokens_today: 50000,
        success_rate_today: 98.5,
        avg_ttft_ms: 120.5,
        cache_hit_rate: 45.2,
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useStatsOverview(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith("/admin/stats/overview");
      expect(result.current.data).toEqual(mockResponse);
    });

    it("handles fetch error", async () => {
      mockGet.mockRejectedValueOnce(new Error("Stats unavailable"));

      const { result } = renderHook(() => useStatsOverview(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe("Stats unavailable");
    });
  });

  describe("useStatsTimeseries", () => {
    it("fetches timeseries with default range (7d)", async () => {
      const mockResponse: StatsTimeseriesResponse = {
        range: "7d",
        granularity: "day",
        series: [
          {
            upstream_id: "upstream-1",
            upstream_name: "OpenAI",
            data: [
              {
                timestamp: "2024-01-01T00:00:00Z",
                request_count: 100,
                total_tokens: 5000,
                avg_duration_ms: 200,
              },
            ],
          },
        ],
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useStatsTimeseries(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith("/admin/stats/timeseries?range=7d&metric=requests");
      expect(result.current.data).toEqual(mockResponse);
    });

    it("fetches timeseries with today range", async () => {
      const mockResponse: StatsTimeseriesResponse = {
        range: "today",
        granularity: "hour",
        series: [],
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useStatsTimeseries("today"), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith("/admin/stats/timeseries?range=today&metric=requests");
    });

    it("fetches timeseries with 30d range", async () => {
      const mockResponse: StatsTimeseriesResponse = {
        range: "30d",
        granularity: "day",
        series: [],
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useStatsTimeseries("30d"), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith("/admin/stats/timeseries?range=30d&metric=requests");
    });

    it("handles fetch error", async () => {
      mockGet.mockRejectedValueOnce(new Error("Timeseries unavailable"));

      const { result } = renderHook(() => useStatsTimeseries(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe("Timeseries unavailable");
    });
  });

  describe("useStatsLeaderboard", () => {
    it("fetches leaderboard with default params", async () => {
      const mockResponse: StatsLeaderboardResponse = {
        range: "7d",
        api_keys: [
          {
            id: "key-1",
            name: "Key 1",
            key_prefix: "sk-test",
            request_count: 500,
            total_tokens: 12500,
          },
        ],
        upstreams: [
          {
            id: "up-1",
            name: "OpenAI",
            provider: "openai",
            request_count: 800,
            total_tokens: 40000,
          },
        ],
        models: [{ model: "gpt-4", request_count: 600, total_tokens: 30000 }],
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useStatsLeaderboard(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith("/admin/stats/leaderboard?range=7d&limit=5");
      expect(result.current.data).toEqual(mockResponse);
    });

    it("fetches leaderboard with custom range", async () => {
      const mockResponse: StatsLeaderboardResponse = {
        range: "30d",
        api_keys: [],
        upstreams: [],
        models: [],
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useStatsLeaderboard("30d"), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith("/admin/stats/leaderboard?range=30d&limit=5");
    });

    it("fetches leaderboard with custom limit", async () => {
      const mockResponse: StatsLeaderboardResponse = {
        range: "7d",
        api_keys: [],
        upstreams: [],
        models: [],
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useStatsLeaderboard("7d", 10), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith("/admin/stats/leaderboard?range=7d&limit=10");
    });

    it("fetches leaderboard with today range and custom limit", async () => {
      const mockResponse: StatsLeaderboardResponse = {
        range: "today",
        api_keys: [],
        upstreams: [],
        models: [],
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useStatsLeaderboard("today", 3), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith("/admin/stats/leaderboard?range=today&limit=3");
    });

    it("handles fetch error", async () => {
      mockGet.mockRejectedValueOnce(new Error("Leaderboard unavailable"));

      const { result } = renderHook(() => useStatsLeaderboard(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe("Leaderboard unavailable");
    });
  });
});
