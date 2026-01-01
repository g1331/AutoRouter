import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import {
  useStatsOverview,
  useStatsTimeseries,
  useStatsLeaderboard,
} from "@/hooks/use-dashboard-stats";

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
      const mockResponse = {
        total_requests: 1000,
        average_response_time: 250,
        total_tokens: 50000,
        success_rate: 98.5,
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
      const mockResponse = {
        data_points: [{ timestamp: "2024-01-01", requests: 100, tokens: 5000 }],
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useStatsTimeseries(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith("/admin/stats/timeseries?range=7d");
      expect(result.current.data).toEqual(mockResponse);
    });

    it("fetches timeseries with today range", async () => {
      mockGet.mockResolvedValueOnce({ data_points: [] });

      const { result } = renderHook(() => useStatsTimeseries("today"), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith("/admin/stats/timeseries?range=today");
    });

    it("fetches timeseries with 30d range", async () => {
      mockGet.mockResolvedValueOnce({ data_points: [] });

      const { result } = renderHook(() => useStatsTimeseries("30d"), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith("/admin/stats/timeseries?range=30d");
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
      const mockResponse = {
        top_keys: [{ id: "key-1", name: "Key 1", requests: 500 }],
        top_upstreams: [{ id: "up-1", name: "OpenAI", requests: 800 }],
        top_models: [{ model: "gpt-4", requests: 600 }],
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useStatsLeaderboard(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith("/admin/stats/leaderboard?range=7d&limit=5");
      expect(result.current.data).toEqual(mockResponse);
    });

    it("fetches leaderboard with custom range", async () => {
      mockGet.mockResolvedValueOnce({ top_keys: [], top_upstreams: [], top_models: [] });

      const { result } = renderHook(() => useStatsLeaderboard("30d"), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith("/admin/stats/leaderboard?range=30d&limit=5");
    });

    it("fetches leaderboard with custom limit", async () => {
      mockGet.mockResolvedValueOnce({ top_keys: [], top_upstreams: [], top_models: [] });

      const { result } = renderHook(() => useStatsLeaderboard("7d", 10), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith("/admin/stats/leaderboard?range=7d&limit=10");
    });

    it("fetches leaderboard with today range and custom limit", async () => {
      mockGet.mockResolvedValueOnce({ top_keys: [], top_upstreams: [], top_models: [] });

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
