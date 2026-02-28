import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import {
  useCompensationRules,
  useCreateCompensationRule,
  useUpdateCompensationRule,
  useDeleteCompensationRule,
} from "@/hooks/use-compensation-rules";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { toast } from "sonner";
const toastError = toast.error as ReturnType<typeof vi.fn>;

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

describe("use-compensation-rules hooks", () => {
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

  it("useCompensationRules returns data array", async () => {
    mockGet.mockResolvedValueOnce({
      data: [{ id: "rule-1", name: "r1" }],
    });

    const { result } = renderHook(() => useCompensationRules(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith("/admin/compensation-rules");
    expect(result.current.data).toEqual([{ id: "rule-1", name: "r1" }]);
  });

  it("useCreateCompensationRule shows toast on error", async () => {
    mockPost.mockRejectedValueOnce(new Error("create failed"));

    const { result } = renderHook(() => useCreateCompensationRule(), { wrapper });
    result.current.mutate({
      name: "r1",
      capabilities: [],
      target_header: "x",
      sources: [],
    } as never);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toastError).toHaveBeenCalledWith("create failed");
  });

  it("useUpdateCompensationRule invalidates list on success", async () => {
    mockPut.mockResolvedValueOnce({ data: { id: "rule-1", name: "r1" } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateCompensationRule(), { wrapper });
    result.current.mutate({ id: "rule-1", data: { name: "r1" } as never });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["compensation-rules"] });
  });

  it("useDeleteCompensationRule calls delete endpoint", async () => {
    mockDelete.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useDeleteCompensationRule(), { wrapper });
    result.current.mutate("rule-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDelete).toHaveBeenCalledWith("/admin/compensation-rules/rule-1");
  });
});
