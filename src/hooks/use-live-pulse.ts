import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/providers/auth-provider";

export type LivePulseConnectionState = "connecting" | "live" | "fallback";

export interface LivePulseGatewayHealth {
  healthyUpstreams: number;
  totalUpstreams: number;
  openCircuitBreakers: number;
}

export interface LivePulseSnapshot {
  requestsPerMinute: number;
  errorRatePct: number;
  avgLatencyMs: number;
  tokensPerMinute: number;
  sampleCount: number;
  windowSeconds: number;
  generatedAt: string;
  gateway: LivePulseGatewayHealth;
}

interface UseLivePulseOptions {
  enabled?: boolean;
}

export interface UseLivePulseResult {
  snapshot: LivePulseSnapshot | null;
  connectionState: LivePulseConnectionState;
}

const RECONNECT_DELAY_MS = 10000;
const FALLBACK_POLL_INTERVAL_MS = 5000;

/**
 * Subscribe to the live pulse snapshot stream.
 *
 * Mirrors useRequestLogLive: connect over SSE while available, and fall back to
 * short-interval snapshot polling when the stream drops, reconnecting in the
 * background. The latest snapshot is always exposed regardless of transport.
 */
export function useLivePulse(options?: UseLivePulseOptions): UseLivePulseResult {
  const { token } = useAuth();
  const enabled = Boolean(options?.enabled !== false && token);
  const [snapshot, setSnapshot] = useState<LivePulseSnapshot | null>(null);
  const [connectionState, setConnectionState] = useState<LivePulseConnectionState>("connecting");
  const reconnectTimerRef = useRef<number | null>(null);

  // SSE connection: drives the connection state and the snapshot while live.
  // When disabled the returned connectionState is forced to "fallback", so there
  // is no need to write state here.
  useEffect(() => {
    if (!enabled || !token) {
      return;
    }

    let disposed = false;
    let abortController: AbortController | null = null;

    const clearReconnect = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed) {
        return;
      }
      setConnectionState("fallback");
      reconnectTimerRef.current = window.setTimeout(() => {
        void connect();
      }, RECONNECT_DELAY_MS);
    };

    const connect = async () => {
      abortController = new AbortController();
      setConnectionState("connecting");

      try {
        const response = await fetch("/api/admin/stats/live", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
          },
          cache: "no-store",
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Live pulse stream failed: ${response.status}`);
        }

        setConnectionState("live");

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

            if ((eventName === "live-pulse" || eventName === "message") && dataLines.length > 0) {
              try {
                setSnapshot(JSON.parse(dataLines.join("\n")) as LivePulseSnapshot);
              } catch {
                // Ignore malformed frames; keep the previous snapshot.
              }
            }
          }
        }

        if (!disposed) {
          scheduleReconnect();
        }
      } catch {
        if (disposed || abortController.signal.aborted) {
          return;
        }
        scheduleReconnect();
      }
    };

    void connect();

    return () => {
      disposed = true;
      abortController?.abort();
      clearReconnect();
    };
  }, [enabled, token]);

  // Fallback polling: only active while the stream is down.
  useEffect(() => {
    if (!enabled || !token || connectionState !== "fallback") {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch("/api/admin/stats/live?mode=snapshot", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!response.ok || cancelled) {
          return;
        }
        const data = (await response.json()) as LivePulseSnapshot;
        if (cancelled) {
          return;
        }
        setSnapshot(data);
      } catch {
        // Leave the previous snapshot in place until the next poll.
      }
    };

    void poll();
    const intervalId = window.setInterval(() => void poll(), FALLBACK_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [enabled, token, connectionState]);

  return {
    snapshot,
    connectionState: enabled ? connectionState : "fallback",
  };
}
