import { createElement } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRequestLogLive } from "@/hooks/use-request-log-live";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    token: "admin-token",
  }),
}));

describe("use-request-log-live", () => {
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to short-interval refresh when live stream connection fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValueOnce(new Error("live stream unavailable")) as typeof fetch
    );

    const { result } = renderHook(() => useRequestLogLive({ enabled: true }), { wrapper });

    await waitFor(() => expect(result.current.connectionState).toBe("fallback"));
    expect(result.current.fallbackRefetchIntervalMs).toBe(3000);
  });

  it("invalidates request logs queries once after the live stream connects", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const encoder = new TextEncoder();
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        })
      ) as typeof fetch
    );

    const { result, unmount } = renderHook(() => useRequestLogLive({ enabled: true }), { wrapper });

    await waitFor(() => expect(result.current.connectionState).toBe("live"), { timeout: 3000 });
    await waitFor(
      () => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["request-logs"] }),
      {
        timeout: 3000,
      }
    );

    streamController?.close();
    unmount();
  });

  it("invalidates request logs queries when a live update event arrives", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const encoder = new TextEncoder();
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(
          encoder.encode(
            'event: request-log-changed\ndata: {"type":"request-log-changed","logId":"log-1","statusCode":499}\n\n'
          )
        );
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        })
      ) as typeof fetch
    );

    const { result, unmount } = renderHook(() => useRequestLogLive({ enabled: true }), { wrapper });

    await waitFor(() => expect(result.current.connectionState).toBe("live"), { timeout: 3000 });
    await waitFor(
      () => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["request-logs"] }),
      {
        timeout: 3000,
      }
    );

    streamController?.close();
    unmount();
  });
});
