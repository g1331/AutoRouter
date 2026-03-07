import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";

type LiveConnectionState = "connecting" | "live" | "fallback";

interface UseRequestLogLiveOptions {
  enabled?: boolean;
}

interface UseRequestLogLiveResult {
  connectionState: LiveConnectionState;
  fallbackRefetchIntervalMs: number | false;
}

const FALLBACK_REFETCH_INTERVAL_MS = 3000;
const RECONNECT_DELAY_MS = 10000;
const INVALIDATE_DEBOUNCE_MS = 250;

export function useRequestLogLive(options?: UseRequestLogLiveOptions): UseRequestLogLiveResult {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [connectionState, setConnectionState] = useState<LiveConnectionState>("connecting");
  const reconnectTimerRef = useRef<number | null>(null);
  const invalidateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!options?.enabled || !token) {
      setConnectionState("fallback");
      return;
    }

    let disposed = false;
    let abortController: AbortController | null = null;

    const clearTimers = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (invalidateTimerRef.current !== null) {
        window.clearTimeout(invalidateTimerRef.current);
        invalidateTimerRef.current = null;
      }
    };

    const scheduleInvalidate = () => {
      if (invalidateTimerRef.current !== null) {
        return;
      }
      invalidateTimerRef.current = window.setTimeout(() => {
        invalidateTimerRef.current = null;
        void queryClient.invalidateQueries({ queryKey: ["request-logs"] });
      }, INVALIDATE_DEBOUNCE_MS);
    };

    const connect = async () => {
      abortController = new AbortController();
      setConnectionState("connecting");

      try {
        const response = await fetch("/api/admin/logs/live", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
          },
          cache: "no-store",
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Live request logs stream failed: ${response.status}`);
        }

        setConnectionState("live");
        scheduleInvalidate();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!disposed) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          while (buffer.includes("\n\n")) {
            const boundary = buffer.indexOf("\n\n");
            const rawEvent = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);

            let eventName = "message";
            const dataLines: string[] = [];
            for (const line of rawEvent.split(/\r?\n/)) {
              if (line.startsWith("event:")) {
                eventName = line.slice(6).trim();
                continue;
              }
              if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).trim());
              }
            }

            if (
              (eventName === "request-log-changed" || eventName === "message") &&
              dataLines.length > 0
            ) {
              scheduleInvalidate();
            }
          }
        }

        if (!disposed) {
          setConnectionState("fallback");
          reconnectTimerRef.current = window.setTimeout(() => {
            void connect();
          }, RECONNECT_DELAY_MS);
        }
      } catch {
        if (disposed || abortController.signal.aborted) {
          return;
        }

        setConnectionState("fallback");
        reconnectTimerRef.current = window.setTimeout(() => {
          void connect();
        }, RECONNECT_DELAY_MS);
      }
    };

    void connect();

    return () => {
      disposed = true;
      abortController?.abort();
      clearTimers();
    };
  }, [options?.enabled, queryClient, token]);

  return useMemo(
    () => ({
      connectionState,
      fallbackRefetchIntervalMs: connectionState === "live" ? false : FALLBACK_REFETCH_INTERVAL_MS,
    }),
    [connectionState]
  );
}
