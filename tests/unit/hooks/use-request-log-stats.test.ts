import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { resolveTimeRangeStart } from "@/hooks/use-request-logs";
import { useRequestLogStats } from "@/hooks/use-request-log-stats";

const mockGet = vi.fn();

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    apiClient: {
      get: mockGet,
    },
  }),
}));

function parseUrlParams(url: string): Record<string, string> {
  const [path, queryString] = url.split("?");
  if (!queryString) return { _path: path };
  const params = new URLSearchParams(queryString);
  const result: Record<string, string> = { _path: path };
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

describe("useRequestLogStats", () => {
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

  it("fetches admin stats without params by default", async () => {
    mockGet.mockResolvedValueOnce({ total: 0 });

    const { result } = renderHook(() => useRequestLogStats("admin"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith("/admin/logs/stats");
  });

  it("targets the user endpoint for the user scope", async () => {
    mockGet.mockResolvedValueOnce({ total: 0 });

    const { result } = renderHook(() => useRequestLogStats("user"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith("/user/logs/stats");
  });

  it("serializes the full admin filter surface", async () => {
    mockGet.mockResolvedValueOnce({ total: 0 });

    const { result } = renderHook(
      () =>
        useRequestLogStats("admin", {
          user_id: "user-1",
          upstream_id: "up-1",
          api_key_id: "key-1",
          status_code: 429,
          model: "gpt-4",
          time_range: "all",
          ttft_min_ms: 5000,
          duration_min_ms: 20000,
          tps_max: 30,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const params = parseUrlParams(mockGet.mock.calls[0][0] as string);
    expect(params._path).toBe("/admin/logs/stats");
    expect(params.user_id).toBe("user-1");
    expect(params.upstream_id).toBe("up-1");
    expect(params.api_key_id).toBe("key-1");
    expect(params.status_code).toBe("429");
    expect(params.model).toBe("gpt-4");
    expect(params.ttft_min_ms).toBe("5000");
    expect(params.duration_min_ms).toBe("20000");
    expect(params.tps_max).toBe("30");
  });

  it("drops admin-only scope params for the user scope", async () => {
    mockGet.mockResolvedValueOnce({ total: 0 });

    const { result } = renderHook(
      () =>
        useRequestLogStats("user", {
          user_id: "user-1",
          upstream_id: "up-1",
          api_key_id: "key-1",
          time_range: "all",
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const params = parseUrlParams(mockGet.mock.calls[0][0] as string);
    expect(params._path).toBe("/user/logs/stats");
    expect(params.user_id).toBeUndefined();
    expect(params.upstream_id).toBeUndefined();
    expect(params.api_key_id).toBe("key-1");
  });

  it("maps a time_range preset to a start_time lower bound, explicit start_time wins", async () => {
    mockGet.mockResolvedValue({ total: 0 });

    const { result } = renderHook(() => useRequestLogStats("admin", { time_range: "today" }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    let params = parseUrlParams(mockGet.mock.calls[0][0] as string);
    expect(params.time_range).toBeUndefined();
    expect(params.start_time).toBe(resolveTimeRangeStart("today").toISOString());

    const { result: explicit } = renderHook(
      () =>
        useRequestLogStats("admin", {
          time_range: "7d",
          start_time: "2026-07-01T00:00:00.000Z",
          end_time: "2026-07-08T00:00:00.000Z",
        }),
      { wrapper }
    );
    await waitFor(() => expect(explicit.current.isSuccess).toBe(true));

    params = parseUrlParams(mockGet.mock.calls.at(-1)![0] as string);
    expect(params.start_time).toBe("2026-07-01T00:00:00.000Z");
    expect(params.end_time).toBe("2026-07-08T00:00:00.000Z");
  });

  it("does not fetch when disabled", async () => {
    renderHook(() => useRequestLogStats("admin", undefined, { enabled: false }), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("uses a query key outside the request-logs prefixes", async () => {
    mockGet.mockResolvedValueOnce({ total: 0 });

    const { result } = renderHook(() => useRequestLogStats("admin", { time_range: "all" }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // SSE log events invalidate ["request-logs"] / ["portal","logs"]; the
    // percentile queries must not share those prefixes.
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey);
    expect(keys).toEqual([["request-log-stats", "admin", { time_range: "all" }]]);
  });
});
