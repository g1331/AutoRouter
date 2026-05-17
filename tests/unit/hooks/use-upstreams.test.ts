import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import type { PaginatedUpstreamsResponse, Upstream } from "@/types/api";

/**
 * Mock auth provider
 */
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    apiClient: {
      get: mockGet,
      post: mockPost,
      put: mockPut,
      delete: mockDelete,
    },
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number | null>) =>
    values?.message ? `${key}: ${values.message}` : key,
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

import { toast } from "sonner";
const mockToastSuccess = toast.success as ReturnType<typeof vi.fn>;
const mockToastError = toast.error as ReturnType<typeof vi.fn>;

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
  base_url: "https://api.openai.com",
  official_website_url: null,
  api_key_masked: "sk-***",
  is_active: true,
  is_default: false,
  timeout: 30,
  current_concurrency: 0,
  max_concurrency: null,
  weight: 1,
  priority: 0,
  route_capabilities: [],
  allowed_models: null,
  model_redirects: null,
  model_discovery: null,
  model_catalog: null,
  model_catalog_updated_at: null,
  model_catalog_last_status: null,
  model_catalog_last_error: null,
  model_catalog_last_failed_at: null,
  model_rules: null,
  affinity_migration: null,
  billing_input_multiplier: 1,
  billing_output_multiplier: 1,
  spending_rules: null,
  description: null,
  health_status: null,
  circuit_breaker: null,
  last_used_at: null,
  updated_at: "2024-01-01T00:00:00Z",
  created_at: "2024-01-01T00:00:00Z",
};

const sampleUpstream2: Upstream = {
  id: "upstream-2",
  name: "test-upstream-2",
  base_url: "https://api.anthropic.com",
  official_website_url: null,
  api_key_masked: "sk-ant-***",
  is_active: true,
  is_default: false,
  timeout: 30,
  current_concurrency: 0,
  max_concurrency: null,
  weight: 1,
  priority: 0,
  route_capabilities: [],
  allowed_models: null,
  model_redirects: null,
  model_discovery: null,
  model_catalog: null,
  model_catalog_updated_at: null,
  model_catalog_last_status: null,
  model_catalog_last_error: null,
  model_catalog_last_failed_at: null,
  model_rules: null,
  affinity_migration: null,
  billing_input_multiplier: 1,
  billing_output_multiplier: 1,
  spending_rules: null,
  description: null,
  health_status: null,
  circuit_breaker: null,
  last_used_at: null,
  updated_at: "2024-01-02T00:00:00Z",
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

describe("useUpstreams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch upstreams with default pagination", async () => {
    const mockResponse: PaginatedUpstreamsResponse = {
      items: [sampleUpstream],
      total: 1,
      page: 1,
      page_size: 10,
      total_pages: 1,
    };
    mockGet.mockResolvedValueOnce(mockResponse);

    const { useUpstreams } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpstreams(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith("/admin/upstreams?page=1&page_size=10");
    expect(result.current.data).toEqual(mockResponse);
  });

  it("should fetch upstreams with custom pagination", async () => {
    const mockResponse: PaginatedUpstreamsResponse = {
      items: [],
      total: 0,
      page: 2,
      page_size: 25,
      total_pages: 0,
    };
    mockGet.mockResolvedValueOnce(mockResponse);

    const { useUpstreams } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpstreams(2, 25), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith("/admin/upstreams?page=2&page_size=25");
  });

  it("should handle fetch error", async () => {
    mockGet.mockRejectedValueOnce(new Error("Network error"));

    const { useUpstreams } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpstreams(), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("Network error");
  });
});

describe("useAllUpstreams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch all upstreams when they fit in first page", async () => {
    const mockResponse: PaginatedUpstreamsResponse = {
      items: [sampleUpstream, sampleUpstream2],
      total: 2,
      page: 1,
      page_size: 100,
      total_pages: 1,
    };
    mockGet.mockResolvedValueOnce(mockResponse);

    const { useAllUpstreams } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAllUpstreams(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith("/admin/upstreams?page=1&page_size=100");
    expect(result.current.data).toEqual(mockResponse.items);
  });

  it("should fetch multiple pages when total exceeds first page", async () => {
    // Create 100 items for first page
    const firstPageItems = Array(100)
      .fill(null)
      .map((_, i) => ({
        ...sampleUpstream,
        id: `upstream-${i}`,
        name: `Upstream ${i}`,
      }));

    // Create 50 items for second page
    const secondPageItems = Array(50)
      .fill(null)
      .map((_, i) => ({
        ...sampleUpstream,
        id: `upstream-${100 + i}`,
        name: `Upstream ${100 + i}`,
      }));

    const firstPage: PaginatedUpstreamsResponse = {
      items: firstPageItems,
      total: 150,
      page: 1,
      page_size: 100,
      total_pages: 2,
    };

    const secondPage: PaginatedUpstreamsResponse = {
      items: secondPageItems,
      total: 150,
      page: 2,
      page_size: 100,
      total_pages: 2,
    };

    mockGet.mockResolvedValueOnce(firstPage);
    mockGet.mockResolvedValueOnce(secondPage);

    const { useAllUpstreams } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAllUpstreams(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenNthCalledWith(1, "/admin/upstreams?page=1&page_size=100");
    expect(mockGet).toHaveBeenNthCalledWith(2, "/admin/upstreams?page=2&page_size=100");
    expect(result.current.data).toHaveLength(150);
  });

  it("should handle fetch error", async () => {
    mockGet.mockRejectedValueOnce(new Error("Failed to fetch"));

    const { useAllUpstreams } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAllUpstreams(), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("Failed to fetch");
  });
});

describe("useCreateUpstream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create upstream successfully", async () => {
    const newUpstream = {
      id: "new-upstream",
      name: "New Upstream",
      base_url: "https://api.example.com",
    };
    mockPost.mockResolvedValueOnce(newUpstream);

    const { useCreateUpstream } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateUpstream(), { wrapper });

    result.current.mutate({
      name: "New Upstream",
      base_url: "https://api.example.com",
      api_key: "sk-test",
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPost).toHaveBeenCalledWith("/admin/upstreams", {
      name: "New Upstream",
      base_url: "https://api.example.com",
      api_key: "sk-test",
    });
  });

  it("should handle create error", async () => {
    mockPost.mockRejectedValueOnce(new Error("Creation failed"));

    const { useCreateUpstream } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateUpstream(), { wrapper });

    result.current.mutate({
      name: "Test",
      base_url: "https://api.example.com",
      api_key: "sk-test",
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("useUpdateUpstream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update upstream successfully", async () => {
    const updatedUpstream = {
      ...sampleUpstream,
      name: "Updated Name",
    };
    mockPut.mockResolvedValueOnce(updatedUpstream);

    const { useUpdateUpstream } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateUpstream(), { wrapper });

    result.current.mutate({
      id: "upstream-1",
      data: {
        name: "Updated Name",
        base_url: "https://api.openai.com",
        api_key: "sk-new",
      },
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPut).toHaveBeenCalledWith("/admin/upstreams/upstream-1", {
      name: "Updated Name",
      base_url: "https://api.openai.com",
      api_key: "sk-new",
    });
  });

  it("should handle update error", async () => {
    mockPut.mockRejectedValueOnce(new Error("Update failed"));

    const { useUpdateUpstream } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateUpstream(), { wrapper });

    result.current.mutate({
      id: "upstream-1",
      data: { name: "Updated" },
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("catalog mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes upstream catalog through the dedicated endpoint", async () => {
    mockPost.mockResolvedValueOnce(sampleUpstream);

    const { useRefreshUpstreamCatalog } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRefreshUpstreamCatalog(), { wrapper });

    result.current.mutate("upstream-1");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPost).toHaveBeenCalledWith("/admin/upstreams/upstream-1/catalog/refresh");
  });

  it("imports selected catalog models through the dedicated endpoint", async () => {
    mockPost.mockResolvedValueOnce(sampleUpstream);

    const { useImportUpstreamCatalogModels } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useImportUpstreamCatalogModels(), { wrapper });

    result.current.mutate({
      id: "upstream-1",
      models: ["gpt-4.1", "gpt-4.1-mini"],
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPost).toHaveBeenCalledWith("/admin/upstreams/upstream-1/catalog/import", {
      models: ["gpt-4.1", "gpt-4.1-mini"],
    });
  });

  it("previews upstream catalog with unsaved form values", async () => {
    const preview = {
      model_discovery: {
        mode: "openai_compatible",
        custom_endpoint: null,
        enable_lite_llm_fallback: false,
        auto_refresh_enabled: false,
      },
      model_catalog: [{ model: "codex-mini-latest", source: "native" }],
      model_catalog_updated_at: "2026-05-14T12:00:00.000Z",
      model_catalog_last_status: "success",
      model_catalog_last_error: null,
      model_catalog_last_failed_at: null,
    };
    mockPost.mockResolvedValueOnce(preview);

    const { usePreviewUpstreamCatalog } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => usePreviewUpstreamCatalog(), { wrapper });

    result.current.mutate({
      id: "upstream-1",
      data: {
        base_url: "https://gateway.example.com/codex/v1",
        api_key: "sk-new-key",
        route_capabilities: ["openai_chat_compatible"],
        model_discovery: preview.model_discovery,
      },
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPost).toHaveBeenCalledWith("/admin/upstreams/upstream-1/catalog/preview", {
      base_url: "https://gateway.example.com/codex/v1",
      api_key: "sk-new-key",
      route_capabilities: ["openai_chat_compatible"],
      model_discovery: preview.model_discovery,
    });
  });
});

describe("upstream failure rule hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches upstream failure rules when enabled", async () => {
    const response = {
      data: [
        {
          id: "rule-1",
          upstream_id: "upstream-1",
          name: "Ignore rate limit",
          enabled: true,
          priority: 0,
          match: { status_codes: [429] },
          created_at: "2026-05-16T00:00:00.000Z",
          updated_at: "2026-05-16T00:00:00.000Z",
        },
      ],
    };
    mockGet.mockResolvedValueOnce(response);

    const { useUpstreamFailureRules } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpstreamFailureRules("upstream-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith("/admin/upstreams/upstream-1/failure-rules");
    expect(result.current.data).toEqual(response.data);
  });

  it("does not fetch upstream failure rules without an upstream id", async () => {
    const { useUpstreamFailureRules } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    renderHook(() => useUpstreamFailureRules(undefined), { wrapper });

    expect(mockGet).not.toHaveBeenCalled();
  });

  it("fetches global upstream failure rules when enabled", async () => {
    const response = {
      data: [
        {
          id: "rule-1",
          upstream_id: null,
          name: "Global timeout rule",
          enabled: true,
          priority: 0,
          match: { error_types: ["timeout"] },
          created_at: "2026-05-16T00:00:00.000Z",
          updated_at: "2026-05-16T00:00:00.000Z",
        },
      ],
    };
    mockGet.mockResolvedValueOnce(response);

    const { useGlobalUpstreamFailureRules } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useGlobalUpstreamFailureRules(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith("/admin/upstream-failure-rules");
    expect(result.current.data).toEqual(response.data);
  });

  it("creates upstream failure rules and invalidates local rule cache", async () => {
    mockPost.mockResolvedValueOnce({
      id: "rule-1",
      upstream_id: "upstream-1",
      name: "Ignore rate limit",
      enabled: true,
      priority: 0,
      match: { status_codes: [429] },
      created_at: "2026-05-16T00:00:00.000Z",
      updated_at: "2026-05-16T00:00:00.000Z",
    });

    const { useCreateUpstreamFailureRule } = await import("@/hooks/use-upstreams");
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateUpstreamFailureRule(), { wrapper });

    result.current.mutate({
      upstreamId: "upstream-1",
      data: {
        name: "Ignore rate limit",
        match: { status_codes: [429] },
      },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockPost).toHaveBeenCalledWith("/admin/upstreams/upstream-1/failure-rules", {
      name: "Ignore rate limit",
      match: { status_codes: [429] },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["upstreams", "upstream-1", "failure-rules"],
    });
  });

  it("creates global upstream failure rules and invalidates global rule cache", async () => {
    mockPost.mockResolvedValueOnce({
      id: "rule-1",
      upstream_id: null,
      name: "Global timeout rule",
      enabled: true,
      priority: 0,
      match: { error_types: ["timeout"] },
      created_at: "2026-05-16T00:00:00.000Z",
      updated_at: "2026-05-16T00:00:00.000Z",
    });

    const { useCreateGlobalUpstreamFailureRule } = await import("@/hooks/use-upstreams");
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateGlobalUpstreamFailureRule(), { wrapper });

    result.current.mutate({
      data: {
        name: "Global timeout rule",
        match: { error_types: ["timeout"] },
      },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockPost).toHaveBeenCalledWith("/admin/upstream-failure-rules", {
      name: "Global timeout rule",
      match: { error_types: ["timeout"] },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["upstream-failure-rules", "global"],
    });
  });

  it("updates upstream failure rules through the shared rule endpoint", async () => {
    mockPut.mockResolvedValueOnce({
      id: "rule-1",
      upstream_id: "upstream-1",
      name: "Ignore rate limit",
      enabled: false,
      priority: 0,
      match: { status_codes: [429] },
      created_at: "2026-05-16T00:00:00.000Z",
      updated_at: "2026-05-16T00:00:00.000Z",
    });

    const { useUpdateUpstreamFailureRule } = await import("@/hooks/use-upstreams");
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateUpstreamFailureRule(), { wrapper });

    result.current.mutate({
      upstreamId: "upstream-1",
      ruleId: "rule-1",
      data: { enabled: false },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockPut).toHaveBeenCalledWith("/admin/upstream-failure-rules/rule-1", {
      enabled: false,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["upstreams", "upstream-1", "failure-rules"],
    });
  });

  it("updates global failure rules through the shared rule endpoint", async () => {
    mockPut.mockResolvedValueOnce({
      id: "rule-1",
      upstream_id: null,
      name: "Global timeout rule",
      enabled: false,
      priority: 0,
      match: { error_types: ["timeout"] },
      created_at: "2026-05-16T00:00:00.000Z",
      updated_at: "2026-05-16T00:00:00.000Z",
    });

    const { useUpdateUpstreamFailureRule } = await import("@/hooks/use-upstreams");
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateUpstreamFailureRule(), { wrapper });

    result.current.mutate({
      scope: "global",
      ruleId: "rule-1",
      data: { enabled: false },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockPut).toHaveBeenCalledWith("/admin/upstream-failure-rules/rule-1", {
      enabled: false,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["upstream-failure-rules", "global"],
    });
  });

  it("deletes upstream failure rules through the shared rule endpoint", async () => {
    mockDelete.mockResolvedValueOnce({ success: true });

    const { useDeleteUpstreamFailureRule } = await import("@/hooks/use-upstreams");
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteUpstreamFailureRule(), { wrapper });

    result.current.mutate({
      upstreamId: "upstream-1",
      ruleId: "rule-1",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockDelete).toHaveBeenCalledWith("/admin/upstream-failure-rules/rule-1");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["upstreams", "upstream-1", "failure-rules"],
    });
  });

  it("deletes global failure rules through the shared rule endpoint", async () => {
    mockDelete.mockResolvedValueOnce({ success: true });

    const { useDeleteUpstreamFailureRule } = await import("@/hooks/use-upstreams");
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteUpstreamFailureRule(), { wrapper });

    result.current.mutate({
      scope: "global",
      ruleId: "rule-1",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockDelete).toHaveBeenCalledWith("/admin/upstream-failure-rules/rule-1");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["upstream-failure-rules", "global"],
    });
  });
});

describe("useToggleUpstreamActive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("optimistically updates caches and shows enable toast", async () => {
    const { useToggleUpstreamActive } = await import("@/hooks/use-upstreams");
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(["upstreams", 1, 10], {
      items: [{ ...sampleUpstream, is_active: false }],
      total: 1,
      page: 1,
      page_size: 10,
      total_pages: 1,
    } as PaginatedUpstreamsResponse);
    queryClient.setQueryData(["upstreams", 2, 10], undefined);
    queryClient.setQueryData(["upstreams", "all"], [{ ...sampleUpstream, is_active: false }]);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    mockPut.mockResolvedValueOnce({ ...sampleUpstream, is_active: true });

    const { result } = renderHook(() => useToggleUpstreamActive(), { wrapper });

    result.current.mutate({ id: "upstream-1", nextActive: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const updatedPaginated = queryClient.getQueryData<PaginatedUpstreamsResponse>([
      "upstreams",
      1,
      10,
    ]);
    expect(updatedPaginated?.items?.[0]?.is_active).toBe(true);

    const updatedAll = queryClient.getQueryData<Upstream[]>(["upstreams", "all"]);
    expect(updatedAll?.[0]?.is_active).toBe(true);

    expect(mockToastSuccess).toHaveBeenCalledWith("enableSuccess");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["upstreams"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["upstreams", "health"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["stats", "upstreams"] });
  });

  it("restores previous caches on error and shows failure toast", async () => {
    const { useToggleUpstreamActive } = await import("@/hooks/use-upstreams");
    const { queryClient, wrapper } = createWrapper();

    const initialPaginated: PaginatedUpstreamsResponse = {
      items: [{ ...sampleUpstream, is_active: true }],
      total: 1,
      page: 1,
      page_size: 10,
      total_pages: 1,
    };
    const initialAll: Upstream[] = [{ ...sampleUpstream, is_active: true }];

    queryClient.setQueryData(["upstreams", 1, 10], initialPaginated);
    queryClient.setQueryData(["upstreams", "all"], initialAll);

    mockPut.mockRejectedValueOnce(new Error("Toggle failed"));

    const { result } = renderHook(() => useToggleUpstreamActive(), { wrapper });

    result.current.mutate({ id: "upstream-1", nextActive: false });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const restoredPaginated = queryClient.getQueryData<PaginatedUpstreamsResponse>([
      "upstreams",
      1,
      10,
    ]);
    expect(restoredPaginated).toEqual(initialPaginated);

    const restoredAll = queryClient.getQueryData<Upstream[]>(["upstreams", "all"]);
    expect(restoredAll).toEqual(initialAll);

    expect(mockToastError).toHaveBeenCalledWith("updateFailed: Toggle failed");
  });

  it("shows disable toast when disabling upstream", async () => {
    const { useToggleUpstreamActive } = await import("@/hooks/use-upstreams");
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(["upstreams", 1, 10], {
      items: [{ ...sampleUpstream, is_active: true }],
      total: 1,
      page: 1,
      page_size: 10,
      total_pages: 1,
    } as PaginatedUpstreamsResponse);

    mockPut.mockResolvedValueOnce({ ...sampleUpstream, is_active: false });

    const { result } = renderHook(() => useToggleUpstreamActive(), { wrapper });

    result.current.mutate({ id: "upstream-1", nextActive: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockToastSuccess).toHaveBeenCalledWith("disableSuccess");
  });
});

describe("useUpstreamHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches health list without query string by default", async () => {
    mockGet.mockResolvedValueOnce({ items: [] });

    const { useUpstreamHealth } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpstreamHealth(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith("/admin/upstreams/health");
  });

  it("fetches health list with active_only=false when activeOnly is false", async () => {
    mockGet.mockResolvedValueOnce({ items: [] });

    const { useUpstreamHealth } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpstreamHealth(false), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith("/admin/upstreams/health?active_only=false");
  });
});

describe("upstream probe hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches diagnostic probe results", async () => {
    mockGet.mockResolvedValueOnce({ data: [], total: 0 });

    const { useUpstreamProbes } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpstreamProbes(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith("/admin/upstreams/probes");
  });

  it("fetches diagnostic probe results for one upstream", async () => {
    mockGet.mockResolvedValueOnce({ data: [], total: 0 });

    const { useUpstreamProbes } = await import("@/hooks/use-upstreams");
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpstreamProbes("upstream-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith("/admin/upstreams/upstream-1/probes");
  });

  it("executes an upstream diagnostic probe and invalidates probe cache", async () => {
    mockPost.mockResolvedValueOnce({ id: "probe-1", success: true });

    const { useExecuteUpstreamProbe } = await import("@/hooks/use-upstreams");
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useExecuteUpstreamProbe(), { wrapper });

    result.current.mutate({
      id: "upstream-1",
      data: { route_capability: "codex_cli_responses", client_profile: "codex_cli" },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockPost).toHaveBeenCalledWith("/admin/upstreams/upstream-1/probes", {
      route_capability: "codex_cli_responses",
      client_profile: "codex_cli",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["upstreams", "probes"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["upstreams", "probes", "upstream-1"] });
  });
});
