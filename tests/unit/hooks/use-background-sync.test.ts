import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBackgroundSyncTasks, useRunBackgroundSyncTask } from "@/hooks/use-background-sync";

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

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values && "message" in values ? `${key}: ${String(values.message)}` : key,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

describe("use-background-sync hooks", () => {
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

  it("fetches background sync task states", async () => {
    mockGet.mockResolvedValueOnce({ background_sync_enabled: true, items: [], total: 0 });

    const { result } = renderHook(() => useBackgroundSyncTasks(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith("/admin/background-sync/tasks");
  });

  it("runs a task by name", async () => {
    mockPost.mockResolvedValueOnce({
      task_name: "billing_price_catalog_sync",
      trigger_type: "manual",
      status: "success",
      success_count: 1,
      failure_count: 0,
      error_summary: null,
      started_at: "2026-04-25T00:00:00.000Z",
      finished_at: "2026-04-25T00:00:01.000Z",
      duration_ms: 1000,
      next_run_at: null,
    });

    const { result } = renderHook(() => useRunBackgroundSyncTask(), { wrapper });
    result.current.mutate("billing_price_catalog_sync");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith(
      "/admin/background-sync/tasks/billing_price_catalog_sync/run"
    );
  });
});
