import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCleanupTrafficRecordings } from "@/hooks/use-traffic-recording";

const { mockPost, toastSuccess, toastWarning, toastError } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    apiClient: { post: mockPost },
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    `${key}:${JSON.stringify(values ?? {})}`,
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    warning: toastWarning,
    error: toastError,
  },
}));

describe("useCleanupTrafficRecordings", () => {
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

  it("warns when cleanup reports retained indexes", async () => {
    mockPost.mockResolvedValueOnce({
      deleted_count: 2,
      failure_count: 1,
      error_summary: "recording-1: fixture missing",
    });

    const { result } = renderHook(() => useCleanupTrafficRecordings(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toastWarning).toHaveBeenCalledWith(
      'cleanupPartial:{"deleted":2,"failed":1,"message":"recording-1: fixture missing"}'
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("shows success when cleanup has no failures", async () => {
    mockPost.mockResolvedValueOnce({
      deleted_count: 2,
      failure_count: 0,
      error_summary: null,
    });

    const { result } = renderHook(() => useCleanupTrafficRecordings(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toastSuccess).toHaveBeenCalledWith('cleanupComplete:{"count":2}');
    expect(toastWarning).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });
});
