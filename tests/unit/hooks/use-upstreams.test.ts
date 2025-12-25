import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import type { PaginatedUpstreamsResponse, Upstream } from "@/types/api";

/**
 * Mock auth provider
 */
const mockDelete = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    apiClient: {
      delete: mockDelete,
    },
  }),
}));

/**
 * Mock sonner toast
 */
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

/**
 * Create test wrapper with QueryClientProvider
 */
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

/**
 * Sample upstream data for testing
 */
const sampleUpstream: Upstream = {
  id: "upstream-1",
  name: "test-upstream",
  provider: "openai",
  base_url: "https://api.openai.com",
  api_key_masked: "sk-***",
  is_active: true,
  is_default: false,
  timeout: 30,
  created_at: "2024-01-01T00:00:00Z",
};

const sampleUpstream2: Upstream = {
  id: "upstream-2",
  name: "test-upstream-2",
  provider: "anthropic",
  base_url: "https://api.anthropic.com",
  api_key_masked: "sk-ant-***",
  is_active: true,
  is_default: false,
  timeout: 30,
  created_at: "2024-01-02T00:00:00Z",
};

describe("useDeleteUpstream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDelete.mockResolvedValue(undefined);
  });

  it("should update paginated cache correctly after deletion", async () => {
    const { useDeleteUpstream } = await import("@/hooks/use-upstreams");
    const { queryClient, wrapper } = createWrapper();

    // Pre-populate paginated cache
    const paginatedData: PaginatedUpstreamsResponse = {
      items: [sampleUpstream, sampleUpstream2],
      total: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    };
    queryClient.setQueryData(["upstreams", 1, 10], paginatedData);

    const { result } = renderHook(() => useDeleteUpstream(), { wrapper });

    // Delete upstream-1
    result.current.mutate("upstream-1");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify paginated cache was updated
    const updatedPaginated = queryClient.getQueryData<PaginatedUpstreamsResponse>([
      "upstreams",
      1,
      10,
    ]);
    expect(updatedPaginated?.items).toHaveLength(1);
    expect(updatedPaginated?.items[0].id).toBe("upstream-2");
    expect(updatedPaginated?.total).toBe(1);
  });

  it("should update 'all' cache correctly after deletion", async () => {
    const { useDeleteUpstream } = await import("@/hooks/use-upstreams");
    const { queryClient, wrapper } = createWrapper();

    // Pre-populate "all" cache (array format)
    const allUpstreams: Upstream[] = [sampleUpstream, sampleUpstream2];
    queryClient.setQueryData(["upstreams", "all"], allUpstreams);

    const { result } = renderHook(() => useDeleteUpstream(), { wrapper });

    // Delete upstream-1
    result.current.mutate("upstream-1");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify "all" cache was updated
    const updatedAll = queryClient.getQueryData<Upstream[]>(["upstreams", "all"]);
    expect(updatedAll).toHaveLength(1);
    expect(updatedAll?.[0].id).toBe("upstream-2");
  });

  it("should handle both cache formats simultaneously without error", async () => {
    const { useDeleteUpstream } = await import("@/hooks/use-upstreams");
    const { queryClient, wrapper } = createWrapper();

    // Pre-populate BOTH cache formats
    const paginatedData: PaginatedUpstreamsResponse = {
      items: [sampleUpstream, sampleUpstream2],
      total: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    };
    queryClient.setQueryData(["upstreams", 1, 10], paginatedData);

    const allUpstreams: Upstream[] = [sampleUpstream, sampleUpstream2];
    queryClient.setQueryData(["upstreams", "all"], allUpstreams);

    const { result } = renderHook(() => useDeleteUpstream(), { wrapper });

    // Delete upstream-1 - this should NOT throw "Cannot read properties of undefined"
    result.current.mutate("upstream-1");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify both caches were updated correctly
    const updatedPaginated = queryClient.getQueryData<PaginatedUpstreamsResponse>([
      "upstreams",
      1,
      10,
    ]);
    expect(updatedPaginated?.items).toHaveLength(1);
    expect(updatedPaginated?.items[0].id).toBe("upstream-2");

    const updatedAll = queryClient.getQueryData<Upstream[]>(["upstreams", "all"]);
    expect(updatedAll).toHaveLength(1);
    expect(updatedAll?.[0].id).toBe("upstream-2");
  });

  it("should call apiClient.delete with correct upstream id", async () => {
    const { useDeleteUpstream } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useDeleteUpstream(), { wrapper });

    result.current.mutate("upstream-123");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockDelete).toHaveBeenCalledWith("/admin/upstreams/upstream-123");
  });

  it("should handle deletion error gracefully", async () => {
    mockDelete.mockRejectedValue(new Error("Network error"));

    const { useDeleteUpstream } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useDeleteUpstream(), { wrapper });

    result.current.mutate("upstream-1");

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("Network error");
  });
});
