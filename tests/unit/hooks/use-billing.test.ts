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
  useBillingTierRules,
  useCreateBillingTierRule,
  useUpdateBillingTierRule,
  useDeleteBillingTierRule,
} from "@/hooks/use-billing";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (values && "message" in values) {
      return `${key}: ${String(values.message)}`;
    }
    if (values && "count" in values) {
      return `${key}: ${String(values.count)}`;
    }
    return key;
  },
}));

// Mock API client
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
    expect(toastSuccess).toHaveBeenCalledWith("manualOverrideResetSuccess: 2");
    expect(toastWarning).toHaveBeenCalledWith("manualOverrideResetWarningNoOfficial: 1");
  });

  it("useResetBillingManualOverrides shows message when nothing deleted", async () => {
    mockPost.mockResolvedValueOnce({
      deleted_count: 0,
      missing_official_models: [],
    });
    const { result } = renderHook(() => useResetBillingManualOverrides(), { wrapper });
    result.current.mutate(["gpt-4.1"]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toastMessage).toHaveBeenCalledWith("manualOverrideResetEmpty");
  });

  it("useSyncBillingPrices shows error toast on failure", async () => {
    mockPost.mockRejectedValueOnce(new Error("sync failed"));
    const { result } = renderHook(() => useSyncBillingPrices(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toastError).toHaveBeenCalledWith("syncFailedError: sync failed");
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
    expect(toastSuccess).toHaveBeenCalledWith("upstreamMultiplierUpdateSuccess");
  });

  it("useRecentBillingDetails fetches recent billing details", async () => {
    mockGet.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20, total_pages: 1 });
    const { result } = renderHook(() => useRecentBillingDetails(2, 10), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith("/admin/billing/recent?page=2&page_size=10");
  });

  it("useBillingTierRules fetches tier rules with optional filters", async () => {
    mockGet.mockResolvedValueOnce({ items: [], total: 0 });
    const { result } = renderHook(() => useBillingTierRules("gpt-4", "manual"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith("/admin/billing/tier-rules?model=gpt-4&source=manual");
  });

  it("useBillingTierRules fetches all tier rules when no filters", async () => {
    mockGet.mockResolvedValueOnce({ items: [], total: 0 });
    const { result } = renderHook(() => useBillingTierRules(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith("/admin/billing/tier-rules");
  });

  it("useCreateBillingTierRule creates tier rule and shows success toast", async () => {
    mockPost.mockResolvedValueOnce({
      id: "rule-1",
      model: "gpt-4",
      threshold_input_tokens: 128000,
      input_price_per_million: 2.5,
      output_price_per_million: 10,
      source: "manual",
      is_active: true,
    });
    const { result } = renderHook(() => useCreateBillingTierRule(), { wrapper });
    result.current.mutate({
      model: "gpt-4",
      threshold_input_tokens: 128000,
      input_price_per_million: 2.5,
      output_price_per_million: 10,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith("/admin/billing/tier-rules", {
      model: "gpt-4",
      threshold_input_tokens: 128000,
      input_price_per_million: 2.5,
      output_price_per_million: 10,
    });
    expect(toastSuccess).toHaveBeenCalledWith("tierRulesAddSuccess");
  });

  it("useCreateBillingTierRule shows error toast on failure", async () => {
    mockPost.mockRejectedValueOnce(new Error("invalid threshold"));
    const { result } = renderHook(() => useCreateBillingTierRule(), { wrapper });
    result.current.mutate({
      model: "gpt-4",
      threshold_input_tokens: 128000,
      input_price_per_million: 2.5,
      output_price_per_million: 10,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toastError).toHaveBeenCalledWith("tierRulesCreateError: invalid threshold");
  });

  it("useCreateBillingTierRule maps duplicate threshold conflicts to localized copy", async () => {
    const duplicateError = Object.assign(new Error("duplicate threshold"), { status: 409 });
    mockPost.mockRejectedValueOnce(duplicateError);
    const { result } = renderHook(() => useCreateBillingTierRule(), { wrapper });
    result.current.mutate({
      model: "gpt-4",
      threshold_input_tokens: 128000,
      input_price_per_million: 2.5,
      output_price_per_million: 10,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toastError).toHaveBeenCalledWith("tierRulesDuplicateThresholdError");
  });

  it("useUpdateBillingTierRule updates tier rule and shows success toast", async () => {
    mockPut.mockResolvedValueOnce({
      id: "rule-1",
      model: "gpt-4",
      threshold_input_tokens: 256000,
      input_price_per_million: 5,
      output_price_per_million: 15,
      source: "manual",
      is_active: false,
    });
    const { result } = renderHook(() => useUpdateBillingTierRule(), { wrapper });
    result.current.mutate({ id: "rule-1", data: { is_active: false } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPut).toHaveBeenCalledWith("/admin/billing/tier-rules/rule-1", { is_active: false });
    expect(toastSuccess).toHaveBeenCalledWith("tierRulesToggleSuccess");
  });

  it("useDeleteBillingTierRule deletes tier rule and shows success toast", async () => {
    mockDelete.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useDeleteBillingTierRule(), { wrapper });
    result.current.mutate("rule-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDelete).toHaveBeenCalledWith("/admin/billing/tier-rules/rule-1");
    expect(toastSuccess).toHaveBeenCalledWith("tierRulesDeleteSuccess");
  });
});
