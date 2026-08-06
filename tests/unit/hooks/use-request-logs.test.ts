import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestLogFilter } from "@/lib/utils/request-log-filters";
import { normalizeRequestLogFilter } from "@/lib/utils/request-log-filters";
import { useRequestLogs } from "@/hooks/use-request-logs";

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
  const result: Record<string, string> = { _path: path };
  new URLSearchParams(queryString).forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

describe("useRequestLogs", () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
  });

  it("fetches the admin endpoint with default pagination", async () => {
    mockGet.mockResolvedValueOnce({ items: [], total: 0 });

    const { result } = renderHook(() => useRequestLogs(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith("/admin/logs?page=1&page_size=20");
  });

  it("passes the list projection and list controls to the admin endpoint", async () => {
    mockGet.mockResolvedValueOnce({ items: [], total: 0 });
    const filter = normalizeRequestLogFilter({
      apiKeyId: "key-1",
      upstreamId: "up-1",
      statusCode: 500,
      timeRange: "all",
    });

    const { result } = renderHook(
      () =>
        useRequestLogs(2, 50, filter, {
          sort: { field: "cost", order: "asc" },
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const query = parseUrlParams(mockGet.mock.calls[0][0] as string);

    expect(query._path).toBe("/admin/logs");
    expect(query.page).toBe("2");
    expect(query.page_size).toBe("50");
    expect(query.api_key_id).toBe("key-1");
    expect(query.upstream_id).toBe("up-1");
    expect(query.status_code).toBe("500");
    expect(query.sort).toBe("cost");
    expect(query.order).toBe("asc");
  });

  it("does not carry a focused request into the list placeholder", async () => {
    mockGet.mockResolvedValue({ items: [], total: 0 });
    const { result, rerender } = renderHook(
      ({ filter }: { filter?: RequestLogFilter }) => useRequestLogs(1, 20, filter),
      { initialProps: { filter: undefined }, wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ filter: normalizeRequestLogFilter({ id: "log-1" }) });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ items: [], total: 0 });
  });

  it("surfaces fetch errors", async () => {
    mockGet.mockRejectedValueOnce(new Error("Failed to fetch logs"));

    const { result } = renderHook(() => useRequestLogs(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Failed to fetch logs");
  });
});
