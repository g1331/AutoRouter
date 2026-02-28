import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import {
  useBillingOverview,
  useBillingModelPrices,
  useResetBillingManualOverrides,
  useSyncBillingPrices,
  useUpdateUpstreamBillingMultiplier,
  useRecentBillingDetails,
} from "@/hooks/use-billing";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
    warning: vi.fn(),
  },
}));

// Mock API client
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    apiClient: {
      get: mockGet,
      post: mockPost,
      put: mockPut,
    },
  }),
}));

import { toast } from "sonner";
const toastSuccess = toast.success as ReturnType<typeof vi.fn>;
const toastError = toast.error as ReturnType<typeof vi.fn>;
const toastMessage = toast.message as ReturnType<typeof vi.fn>;
const toastWarning = toast.warning as ReturnType<typeof vi.fn>;

describe("use-billing hooks", () => {
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

  it("useBillingOverview fetches overview", async () => {
    mockGet.mockResolvedValueOnce({ today_cost_usd: 1, month_cost_usd: 2 });
    const { result } = renderHook(() => useBillingOverview(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith("/admin/billing/overview");
  });

  it("useBillingModelPrices trims model query and omits empty query param", async () => {
    mockGet.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 50, total_pages: 1 });

    const { result } = renderHook(() => useBillingModelPrices(1, 50, "  gpt-4.1  "), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith("/admin/billing/prices?page=1&page_size=50&model=gpt-4.1");

    mockGet.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 50, total_pages: 1 });
    const { result: result2 } = renderHook(() => useBillingModelPrices(1, 50, "   "), { wrapper });
    await waitFor(() => expect(result2.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith("/admin/billing/prices?page=1&page_size=50");
  });

  it("useResetBillingManualOverrides shows success and warning toasts", async () => {
    mockPost.mockResolvedValueOnce({
      deleted_count: 2,
      missing_official_models: ["sample_spec"],
    });
    const { result } = renderHook(() => useResetBillingManualOverrides(), { wrapper });
    result.current.mutate(["gpt-4.1", "sample_spec"]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith("/admin/billing/overrides/reset", {
      models: ["gpt-4.1", "sample_spec"],
    });
    expect(toastSuccess).toHaveBeenCalledWith("已重置 2 个手动覆盖");
    expect(toastWarning).toHaveBeenCalled();
  });

  it("useResetBillingManualOverrides shows message when nothing deleted", async () => {
    mockPost.mockResolvedValueOnce({
      deleted_count: 0,
      missing_official_models: [],
    });
    const { result } = renderHook(() => useResetBillingManualOverrides(), { wrapper });
    result.current.mutate(["gpt-4.1"]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toastMessage).toHaveBeenCalledWith("没有需要重置的手动覆盖");
  });

  it("useSyncBillingPrices shows error toast on failure", async () => {
    mockPost.mockRejectedValueOnce(new Error("sync failed"));
    const { result } = renderHook(() => useSyncBillingPrices(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toastError).toHaveBeenCalledWith("同步失败: sync failed");
  });

  it("useUpdateUpstreamBillingMultiplier updates multiplier and shows success toast", async () => {
    mockPut.mockResolvedValueOnce({
      id: "upstream-1",
      name: "OpenAI",
      is_active: true,
      input_multiplier: 1,
      output_multiplier: 1.2,
    });
    const { result } = renderHook(() => useUpdateUpstreamBillingMultiplier(), { wrapper });
    result.current.mutate({ id: "upstream-1", data: { output_multiplier: 1.2 } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPut).toHaveBeenCalledWith("/admin/billing/upstream-multipliers/upstream-1", {
      output_multiplier: 1.2,
    });
    expect(toastSuccess).toHaveBeenCalledWith("倍率更新成功");
  });

  it("useRecentBillingDetails fetches recent billing details", async () => {
    mockGet.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20, total_pages: 1 });
    const { result } = renderHook(() => useRecentBillingDetails(2, 10), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith("/admin/billing/recent?page=2&page_size=10");
  });
});
