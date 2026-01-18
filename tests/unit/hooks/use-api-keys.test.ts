import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import {
  useAPIKeys,
  useCreateAPIKey,
  useRevealAPIKey,
  useRevokeAPIKey,
  useUpdateAPIKey,
} from "@/hooks/use-api-keys";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Get mock references after import
import { toast } from "sonner";
const mockToastSuccess = toast.success as ReturnType<typeof vi.fn>;
const mockToastError = toast.error as ReturnType<typeof vi.fn>;

// Mock API client
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();
const mockPut = vi.fn();

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    apiClient: {
      get: mockGet,
      post: mockPost,
      delete: mockDelete,
      put: mockPut,
    },
  }),
}));

// Mock ApiError
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    detail: unknown;
    constructor(message: string, detail?: unknown) {
      super(message);
      this.detail = detail;
    }
  },
}));

describe("use-api-keys hooks", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
        mutations: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  describe("useAPIKeys", () => {
    it("fetches API keys with default pagination", async () => {
      const mockResponse = {
        items: [{ id: "key-1", name: "Test Key" }],
        total: 1,
        page: 1,
        page_size: 10,
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useAPIKeys(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith("/admin/keys?page=1&page_size=10");
      expect(result.current.data).toEqual(mockResponse);
    });

    it("fetches API keys with custom pagination", async () => {
      const mockResponse = {
        items: [],
        total: 0,
        page: 2,
        page_size: 25,
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useAPIKeys(2, 25), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith("/admin/keys?page=2&page_size=25");
    });

    it("handles fetch error", async () => {
      mockGet.mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => useAPIKeys(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe("Network error");
    });
  });

  describe("useCreateAPIKey", () => {
    it("creates API key successfully", async () => {
      const mockResponse = {
        id: "new-key-id",
        key_value: "sk-auto-newkey123",
        key_prefix: "sk-auto-newk",
        name: "New Key",
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useCreateAPIKey(), { wrapper });

      result.current.mutate({
        name: "New Key",
        upstream_ids: ["upstream-1"],
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith("/admin/keys", {
        name: "New Key",
        upstream_ids: ["upstream-1"],
      });
      expect(result.current.data).toEqual(mockResponse);
    });

    it("shows error toast on create failure", async () => {
      mockPost.mockRejectedValueOnce(new Error("Creation failed"));

      const { result } = renderHook(() => useCreateAPIKey(), { wrapper });

      result.current.mutate({
        name: "New Key",
        upstream_ids: ["upstream-1"],
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(mockToastError).toHaveBeenCalledWith("createFailed: Creation failed");
    });
  });

  describe("useRevealAPIKey", () => {
    it("reveals API key successfully", async () => {
      const mockResponse = { key_value: "sk-auto-fullkey123" };
      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useRevealAPIKey(), { wrapper });

      result.current.mutate("key-id-123");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith("/admin/keys/key-id-123/reveal");
      expect(result.current.data).toEqual(mockResponse);
    });

    it("shows error toast on reveal failure", async () => {
      mockPost.mockRejectedValueOnce(new Error("Reveal failed"));

      const { result } = renderHook(() => useRevealAPIKey(), { wrapper });

      result.current.mutate("key-id-123");

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(mockToastError).toHaveBeenCalledWith("error");
    });

    it("shows legacy key error message", async () => {
      const { ApiError } = await import("@/lib/api");
      const error = new ApiError("Legacy key", { error: "legacy_key" });
      mockPost.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useRevealAPIKey(), { wrapper });

      result.current.mutate("legacy-key-id");

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(mockToastError).toHaveBeenCalledWith("legacyKey");
    });
  });

  describe("useRevokeAPIKey", () => {
    it("revokes API key successfully", async () => {
      mockDelete.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useRevokeAPIKey(), { wrapper });

      result.current.mutate("key-to-revoke");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockDelete).toHaveBeenCalledWith("/admin/keys/key-to-revoke");
      expect(mockToastSuccess).toHaveBeenCalledWith("revokeSuccess");
    });

    it("shows error toast on revoke failure", async () => {
      mockDelete.mockRejectedValueOnce(new Error("Revoke failed"));

      const { result } = renderHook(() => useRevokeAPIKey(), { wrapper });

      result.current.mutate("key-to-revoke");

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(mockToastError).toHaveBeenCalledWith("revokeFailed: Revoke failed");
    });
  });

  describe("useUpdateAPIKey", () => {
    it("updates API key successfully", async () => {
      const mockResponse = {
        id: "key-1",
        key_prefix: "sk-auto-test",
        name: "Updated Key",
        description: "Updated description",
        is_active: true,
        upstream_ids: ["upstream-1"],
        expires_at: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
      };
      mockPut.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useUpdateAPIKey(), { wrapper });

      result.current.mutate({
        id: "key-1",
        data: {
          name: "Updated Key",
          description: "Updated description",
        },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPut).toHaveBeenCalledWith("/admin/keys/key-1", {
        name: "Updated Key",
        description: "Updated description",
      });
      expect(mockToastSuccess).toHaveBeenCalledWith("updateSuccess");
      expect(result.current.data).toEqual(mockResponse);
    });

    it("shows error toast on update failure", async () => {
      mockPut.mockRejectedValueOnce(new Error("Update failed"));

      const { result } = renderHook(() => useUpdateAPIKey(), { wrapper });

      result.current.mutate({
        id: "key-1",
        data: { name: "Updated Key" },
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(mockToastError).toHaveBeenCalledWith("updateFailed: Update failed");
    });

    it("updates API key with is_active field", async () => {
      const mockResponse = {
        id: "key-1",
        key_prefix: "sk-auto-test",
        name: "Test Key",
        is_active: false,
        upstream_ids: ["upstream-1"],
      };
      mockPut.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useUpdateAPIKey(), { wrapper });

      result.current.mutate({
        id: "key-1",
        data: { is_active: false },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPut).toHaveBeenCalledWith("/admin/keys/key-1", {
        is_active: false,
      });
    });

    it("updates API key with upstream_ids", async () => {
      const mockResponse = {
        id: "key-1",
        key_prefix: "sk-auto-test",
        name: "Test Key",
        upstream_ids: ["upstream-2", "upstream-3"],
      };
      mockPut.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useUpdateAPIKey(), { wrapper });

      result.current.mutate({
        id: "key-1",
        data: { upstream_ids: ["upstream-2", "upstream-3"] },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPut).toHaveBeenCalledWith("/admin/keys/key-1", {
        upstream_ids: ["upstream-2", "upstream-3"],
      });
    });
  });
});
