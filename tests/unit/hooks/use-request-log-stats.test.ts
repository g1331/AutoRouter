import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRequestLogStats } from "@/hooks/use-request-log-stats";
import { createRequestLogQuery } from "@/lib/utils/request-log-query";

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

describe("useRequestLogStats", () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
  });

  it("targets the admin stats endpoint", async () => {
    mockGet.mockResolvedValueOnce({ total: 0 });

    const { result } = renderHook(() => useRequestLogStats("admin"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith("/admin/logs/stats");
  });

  it("uses the filter stats projection without list-only fields", async () => {
    mockGet.mockResolvedValueOnce({ total: 0 });
    const filter = createRequestLogQuery({
      id: "log-1",
      userId: "user-1",
      upstreamId: "up-1",
      apiKeyId: "key-1",
      statusCode: 429,
      model: "gpt-4",
      timeRange: "all",
      performance: { ttftMinMs: 5000, durationMinMs: 20000, tpsMax: 30 },
    });

    const { result } = renderHook(() => useRequestLogStats("admin", filter), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const query = parseUrlParams(mockGet.mock.calls[0][0] as string);

    expect(query._path).toBe("/admin/logs/stats");
    expect(query.id).toBeUndefined();
    expect(query.user_id).toBe("user-1");
    expect(query.upstream_id).toBe("up-1");
    expect(query.api_key_id).toBe("key-1");
    expect(query.status_code).toBe("429");
    expect(query.ttft_min_ms).toBe("5000");
    expect(query.duration_min_ms).toBe("20000");
    expect(query.tps_max).toBe("30");
    expect(query.page).toBeUndefined();
    expect(query.sort).toBeUndefined();
  });

  it("drops admin-only fields for the user stats endpoint", async () => {
    mockGet.mockResolvedValueOnce({ total: 0 });
    const filter = createRequestLogQuery({
      userId: "user-1",
      upstreamId: "up-1",
      apiKeyId: "key-1",
      timeRange: "all",
    });

    const { result } = renderHook(() => useRequestLogStats("user", filter), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const query = parseUrlParams(mockGet.mock.calls[0][0] as string);
    expect(query._path).toBe("/user/logs/stats");
    expect(query.user_id).toBeUndefined();
    expect(query.upstream_id).toBeUndefined();
    expect(query.api_key_id).toBe("key-1");
  });

  it("does not fetch when disabled and keeps a dedicated query-key prefix", async () => {
    renderHook(() => useRequestLogStats("admin", undefined, { enabled: false }), { wrapper });
    expect(mockGet).not.toHaveBeenCalled();

    mockGet.mockResolvedValueOnce({ total: 0 });
    const { result } = renderHook(
      () => useRequestLogStats("admin", createRequestLogQuery({ timeRange: "all" })),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryCache().getAll()[0]?.queryKey[0]).toBe("request-log-stats");
  });
});
