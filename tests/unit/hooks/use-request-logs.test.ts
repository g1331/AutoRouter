import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useRequestLogs } from "@/hooks/use-request-logs";

// Mock API client
const mockGet = vi.fn();

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    apiClient: {
      get: mockGet,
    },
  }),
}));

// Helper to parse URL and extract params for flexible assertions
function parseUrlParams(url: string): Record<string, string> {
  const [path, queryString] = url.split("?");
  if (!queryString) return { _path: path };
  const params = new URLSearchParams(queryString);
  const result: Record<string, string> = { _path: path };
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

describe("use-request-logs hooks", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  describe("useRequestLogs", () => {
    it("fetches logs with default pagination", async () => {
      const mockResponse = {
        items: [{ id: "log-1", path: "/v1/chat/completions" }],
        total: 1,
        page: 1,
        page_size: 20,
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useRequestLogs(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith("/admin/logs?page=1&page_size=20");
      expect(result.current.data).toEqual(mockResponse);
    });

    it("fetches logs with custom pagination", async () => {
      const mockResponse = {
        items: [],
        total: 0,
        page: 3,
        page_size: 50,
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useRequestLogs(3, 50), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith("/admin/logs?page=3&page_size=50");
    });

    it("fetches logs with api_key_id filter", async () => {
      mockGet.mockResolvedValueOnce({ items: [], total: 0 });

      const { result } = renderHook(() => useRequestLogs(1, 20, { api_key_id: "key-123" }), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith("/admin/logs?page=1&page_size=20&api_key_id=key-123");
    });

    it("fetches logs with upstream_id filter", async () => {
      mockGet.mockResolvedValueOnce({ items: [], total: 0 });

      const { result } = renderHook(() => useRequestLogs(1, 20, { upstream_id: "upstream-456" }), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(
        "/admin/logs?page=1&page_size=20&upstream_id=upstream-456"
      );
    });

    it("fetches logs with status_code filter", async () => {
      mockGet.mockResolvedValueOnce({ items: [], total: 0 });

      const { result } = renderHook(() => useRequestLogs(1, 20, { status_code: 200 }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith("/admin/logs?page=1&page_size=20&status_code=200");
    });

    it("fetches logs with time range filters", async () => {
      mockGet.mockResolvedValueOnce({ items: [], total: 0 });

      const { result } = renderHook(
        () =>
          useRequestLogs(1, 20, {
            start_time: "2024-01-01T00:00:00Z",
            end_time: "2024-01-31T23:59:59Z",
          }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Use parsed params to avoid URL encoding order sensitivity
      const calledUrl = mockGet.mock.calls[0][0] as string;
      const params = parseUrlParams(calledUrl);
      expect(params._path).toBe("/admin/logs");
      expect(params.page).toBe("1");
      expect(params.page_size).toBe("20");
      expect(params.start_time).toBe("2024-01-01T00:00:00Z");
      expect(params.end_time).toBe("2024-01-31T23:59:59Z");
    });

    it("fetches logs with multiple filters", async () => {
      mockGet.mockResolvedValueOnce({ items: [], total: 0 });

      const { result } = renderHook(
        () =>
          useRequestLogs(1, 20, {
            api_key_id: "key-123",
            upstream_id: "upstream-456",
            status_code: 500,
          }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Use parsed params to avoid parameter order sensitivity
      const calledUrl = mockGet.mock.calls[0][0] as string;
      const params = parseUrlParams(calledUrl);
      expect(params._path).toBe("/admin/logs");
      expect(params.page).toBe("1");
      expect(params.page_size).toBe("20");
      expect(params.api_key_id).toBe("key-123");
      expect(params.upstream_id).toBe("upstream-456");
      expect(params.status_code).toBe("500");
    });

    it("handles fetch error", async () => {
      mockGet.mockRejectedValueOnce(new Error("Failed to fetch logs"));

      const { result } = renderHook(() => useRequestLogs(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe("Failed to fetch logs");
    });

    it("handles status_code 0 correctly", async () => {
      mockGet.mockResolvedValueOnce({ items: [], total: 0 });

      const { result } = renderHook(() => useRequestLogs(1, 20, { status_code: 0 }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // status_code 0 should still be included since !== undefined check is used
      expect(mockGet).toHaveBeenCalledWith("/admin/logs?page=1&page_size=20&status_code=0");
    });
  });
});
