import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import {
  useAPIKeys,
  useCreateAPIKey,
  useUpdateAPIKey,
  useRevealAPIKey,
  useRevokeAPIKey,
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

  describe("useUpdateAPIKey", () => {
    it("updates API key successfully", async () => {
      const updatedKey = {
        id: "key-1",
        name: "Updated Key",
        description: "Updated description",
        is_active: true,
        upstream_ids: ["upstream-1", "upstream-2"],
      };
      mockPut.mockResolvedValueOnce(updatedKey);

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
    });

    it("invalidates queries after successful update", async () => {
      const updatedKey = {
        id: "key-1",
        name: "Updated Key",
      };
      mockPut.mockResolvedValueOnce(updatedKey);

      const { result } = renderHook(() => useUpdateAPIKey(), { wrapper });

      // Spy on invalidateQueries
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      result.current.mutate({
        id: "key-1",
        data: { name: "Updated Key" },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["api-keys"] });
    });

    it("performs optimistic update on mutation", async () => {
      // Pre-populate cache with existing keys
      const existingKeys = {
        items: [
          {
            id: "key-1",
            name: "Original Key",
            description: "Original description",
            is_active: true,
            upstream_ids: ["upstream-1"],
            expires_at: null,
            updated_at: "2024-01-01T00:00:00Z",
          },
          {
            id: "key-2",
            name: "Other Key",
            description: null,
            is_active: true,
            upstream_ids: ["upstream-2"],
            expires_at: null,
            updated_at: "2024-01-01T00:00:00Z",
          },
        ],
        total: 2,
        page: 1,
        page_size: 10,
      };
      queryClient.setQueryData(["api-keys", 1, 10], existingKeys);

      // Delay the API response to test optimistic update
      mockPut.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  id: "key-1",
                  name: "Updated Key",
                  description: "Updated description",
                  is_active: true,
                  upstream_ids: ["upstream-1", "upstream-2"],
                }),
              100
            )
          )
      );

      const { result } = renderHook(() => useUpdateAPIKey(), { wrapper });

      result.current.mutate({
        id: "key-1",
        data: {
          name: "Updated Key",
          description: "Updated description",
          upstream_ids: ["upstream-1", "upstream-2"],
        },
      });

      // Check cache was optimistically updated (before API responds)
      await waitFor(() => {
        const cachedData = queryClient.getQueryData<typeof existingKeys>(["api-keys", 1, 10]);
        expect(cachedData?.items[0].name).toBe("Updated Key");
        expect(cachedData?.items[0].description).toBe("Updated description");
      });

      // Wait for mutation to complete
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });

    it("handles snake_case to camelCase conversion in optimistic update", async () => {
      const existingKeys = {
        items: [
          {
            id: "key-1",
            name: "Test Key",
            description: null,
            is_active: true,
            upstream_ids: ["upstream-1"],
            expires_at: null,
            updated_at: "2024-01-01T00:00:00Z",
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
      };
      queryClient.setQueryData(["api-keys", 1, 10], existingKeys);

      mockPut.mockResolvedValueOnce({
        id: "key-1",
        name: "Test Key",
        is_active: false,
      });

      const { result } = renderHook(() => useUpdateAPIKey(), { wrapper });

      result.current.mutate({
        id: "key-1",
        data: {
          is_active: false,
        },
      });

      // Check that is_active was properly mapped to isActive in cache
      await waitFor(() => {
        const cachedData = queryClient.getQueryData<typeof existingKeys>(["api-keys", 1, 10]);
        expect(cachedData?.items[0].is_active).toBe(false);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });

    it("rolls back optimistic update on error", async () => {
      const originalKeys = {
        items: [
          {
            id: "key-1",
            name: "Original Key",
            description: "Original description",
            is_active: true,
            upstream_ids: ["upstream-1"],
            expires_at: null,
            updated_at: "2024-01-01T00:00:00Z",
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
      };
      queryClient.setQueryData(["api-keys", 1, 10], originalKeys);

      mockPut.mockRejectedValueOnce(new Error("Update failed"));

      const { result } = renderHook(() => useUpdateAPIKey(), { wrapper });

      result.current.mutate({
        id: "key-1",
        data: { name: "Failed Update" },
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      // Verify cache was rolled back to original state
      const cachedData = queryClient.getQueryData<typeof originalKeys>(["api-keys", 1, 10]);
      expect(cachedData?.items[0].name).toBe("Original Key");
      expect(cachedData?.items[0].description).toBe("Original description");
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

    it("cancels outgoing queries during optimistic update", async () => {
      const existingKeys = {
        items: [
          {
            id: "key-1",
            name: "Test Key",
            description: null,
            is_active: true,
            upstream_ids: ["upstream-1"],
            expires_at: null,
            updated_at: "2024-01-01T00:00:00Z",
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
      };
      queryClient.setQueryData(["api-keys", 1, 10], existingKeys);

      mockPut.mockResolvedValueOnce({ id: "key-1", name: "Updated Key" });

      const { result } = renderHook(() => useUpdateAPIKey(), { wrapper });

      // Spy on cancelQueries
      const cancelSpy = vi.spyOn(queryClient, "cancelQueries");

      result.current.mutate({
        id: "key-1",
        data: { name: "Updated Key" },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(cancelSpy).toHaveBeenCalledWith({ queryKey: ["api-keys"] });
    });

    it("handles null and undefined values correctly in optimistic update", async () => {
      const existingKeys = {
        items: [
          {
            id: "key-1",
            name: "Test Key",
            description: "Some description",
            is_active: true,
            upstream_ids: ["upstream-1"],
            expires_at: "2024-12-31T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
      };
      queryClient.setQueryData(["api-keys", 1, 10], existingKeys);

      mockPut.mockResolvedValueOnce({
        id: "key-1",
        description: null,
        expires_at: null,
      });

      const { result } = renderHook(() => useUpdateAPIKey(), { wrapper });

      result.current.mutate({
        id: "key-1",
        data: {
          description: null,
          expires_at: null,
        },
      });

      // Check that null values are properly handled
      await waitFor(() => {
        const cachedData = queryClient.getQueryData<typeof existingKeys>(["api-keys", 1, 10]);
        expect(cachedData?.items[0].description).toBeNull();
        expect(cachedData?.items[0].expires_at).toBeNull();
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
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
});
