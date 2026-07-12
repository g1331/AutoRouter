import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { usePortalRequestLogs } from "@/hooks/use-portal-logs";
import { resolveTimeRangeStart } from "@/hooks/use-request-logs";

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

describe("usePortalRequestLogs", () => {
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

  it("fetches the member logs endpoint with default pagination", async () => {
    mockGet.mockResolvedValueOnce({ items: [], total: 0 });

    const { result } = renderHook(() => usePortalRequestLogs(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith("/user/logs?page=1&page_size=20");
  });

  it("serializes api_key_id, status_class and model into the query", async () => {
    mockGet.mockResolvedValueOnce({ items: [], total: 0 });

    const { result } = renderHook(
      () => usePortalRequestLogs(2, 50, { api_key_id: "key-1", status_class: "4xx", model: "gpt" }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const params = parseUrlParams(mockGet.mock.calls[0][0] as string);
    expect(params._path).toBe("/user/logs");
    expect(params.page).toBe("2");
    expect(params.page_size).toBe("50");
    expect(params.api_key_id).toBe("key-1");
    expect(params.status_class).toBe("4xx");
    expect(params.model).toBe("gpt");
  });

  it("maps a time_range preset to a start_time lower bound", async () => {
    mockGet.mockResolvedValueOnce({ items: [], total: 0 });

    const { result } = renderHook(() => usePortalRequestLogs(1, 20, { time_range: "today" }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const params = parseUrlParams(mockGet.mock.calls[0][0] as string);
    expect(params.time_range).toBeUndefined();
    expect(params.start_time).toBe(resolveTimeRangeStart("today").toISOString());
  });

  it("applies no lower bound for the all time range", async () => {
    mockGet.mockResolvedValueOnce({ items: [], total: 0 });

    const { result } = renderHook(() => usePortalRequestLogs(1, 20, { time_range: "all" }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const params = parseUrlParams(mockGet.mock.calls[0][0] as string);
    expect(params.start_time).toBeUndefined();
    expect(params.time_range).toBeUndefined();
  });

  it("serializes performance thresholds, sort and order into the query", async () => {
    mockGet.mockResolvedValueOnce({ items: [], total: 0 });

    const { result } = renderHook(
      () =>
        usePortalRequestLogs(1, 20, {
          time_range: "all",
          ttft_min_ms: 5000,
          duration_min_ms: 20000,
          tps_max: 30,
          sort: "ttft_ms",
          order: "asc",
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const params = parseUrlParams(mockGet.mock.calls[0][0] as string);
    expect(params.ttft_min_ms).toBe("5000");
    expect(params.duration_min_ms).toBe("20000");
    expect(params.tps_max).toBe("30");
    expect(params.sort).toBe("ttft_ms");
    expect(params.order).toBe("asc");
  });

  it("prefers an explicit start_time over the time_range preset", async () => {
    mockGet.mockResolvedValueOnce({ items: [], total: 0 });

    const { result } = renderHook(
      () => usePortalRequestLogs(1, 20, { time_range: "30d", start_time: "2024-02-01T00:00:00Z" }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const params = parseUrlParams(mockGet.mock.calls[0][0] as string);
    expect(params.start_time).toBe("2024-02-01T00:00:00Z");
  });
});
