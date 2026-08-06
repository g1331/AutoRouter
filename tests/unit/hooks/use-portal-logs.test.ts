import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePortalRequestLogs } from "@/hooks/use-portal-logs";
import { normalizeRequestLogFilter } from "@/lib/utils/request-log-filters";

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

describe("usePortalRequestLogs", () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
  });

  it("fetches the user endpoint with default pagination", async () => {
    mockGet.mockResolvedValueOnce({ items: [], total: 0 });

    const { result } = renderHook(() => usePortalRequestLogs(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith("/user/logs?page=1&page_size=20");
  });

  it("uses user scope projection while preserving list controls", async () => {
    mockGet.mockResolvedValueOnce({ items: [], total: 0 });
    const filter = normalizeRequestLogFilter({
      apiKeyId: "key-1",
      userId: "user-1",
      upstreamId: "up-1",
      statusClass: "4xx",
      model: "gpt",
      timeRange: "all",
    });

    const { result } = renderHook(
      () =>
        usePortalRequestLogs(2, 50, filter, {
          sort: { field: "duration_ms", order: "desc" },
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const query = parseUrlParams(mockGet.mock.calls[0][0] as string);

    expect(query._path).toBe("/user/logs");
    expect(query.page).toBe("2");
    expect(query.page_size).toBe("50");
    expect(query.api_key_id).toBe("key-1");
    expect(query.status_class).toBe("4xx");
    expect(query.model).toBe("gpt");
    expect(query.user_id).toBeUndefined();
    expect(query.upstream_id).toBeUndefined();
    expect(query.sort).toBe("duration_ms");
  });
});
