import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import {
  useCircuitBreakerStatus,
  useForceCircuitBreaker,
  useCircuitBreakerList,
} from "@/hooks/use-circuit-breaker";

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    apiClient: {
      get: mockGet,
      post: mockPost,
    },
  }),
}));

describe("use-circuit-breaker hooks", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  it("useCircuitBreakerStatus fetches and returns response.data", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        upstream_id: "upstream-1",
        upstream_name: "OpenAI",
        state: "closed",
      },
    });

    const { result } = renderHook(() => useCircuitBreakerStatus("upstream-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith("/admin/circuit-breakers/upstream-1");
    expect(result.current.data).toMatchObject({ state: "closed" });
  });

  it("useCircuitBreakerStatus does not fetch when upstreamId is empty", async () => {
    renderHook(() => useCircuitBreakerStatus("", true), { wrapper });
    await waitFor(() => expect(mockGet).not.toHaveBeenCalled());
  });

  it("useForceCircuitBreaker posts to force-open endpoint and invalidates detail/upstreams", async () => {
    mockPost.mockResolvedValueOnce({ success: true, message: "ok" });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useForceCircuitBreaker(), { wrapper });
    result.current.mutate({ upstreamId: "upstream-1", action: "open" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith("/admin/circuit-breakers/upstream-1/force-open");
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it("useForceCircuitBreaker posts to force-close endpoint", async () => {
    mockPost.mockResolvedValueOnce({ success: true, message: "ok" });

    const { result } = renderHook(() => useForceCircuitBreaker(), { wrapper });
    result.current.mutate({ upstreamId: "upstream-1", action: "close" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith("/admin/circuit-breakers/upstream-1/force-close");
  });

  it("useCircuitBreakerList builds query string with state when provided", async () => {
    mockGet.mockResolvedValueOnce({
      data: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
    });

    const { result } = renderHook(
      () => useCircuitBreakerList({ state: "open", page: 2, pageSize: 10 }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith("/admin/circuit-breakers?state=open&page=2&page_size=10");
  });
});
