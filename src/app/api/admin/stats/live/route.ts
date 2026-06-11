import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { getLivePulseSnapshot } from "@/lib/services/live-pulse-service";
import { createLogger } from "@/lib/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("admin-stats-live");
const KEEPALIVE_INTERVAL_MS = 15000;
const PULSE_INTERVAL_MS = 2000;

function formatSseEvent(eventName: string, data: unknown): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Stream live pulse snapshots over Server-Sent Events for authenticated admins.
 *
 * Default mode streams a `live-pulse` snapshot frame on connect and every
 * PULSE_INTERVAL_MS thereafter. `?mode=snapshot` returns a single snapshot as
 * JSON, used by the frontend fallback polling when SSE is unavailable.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  if (request.nextUrl.searchParams.get("mode") === "snapshot") {
    try {
      const snapshot = await getLivePulseSnapshot();
      return NextResponse.json(snapshot);
    } catch (error) {
      log.error({ err: error }, "failed to build live pulse snapshot");
      return errorResponse("Internal server error", 500);
    }
  }

  const encoder = new TextEncoder();
  let cleanup = () => undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk));
      };

      const pushSnapshot = async () => {
        try {
          const snapshot = await getLivePulseSnapshot();
          send(formatSseEvent("live-pulse", snapshot));
        } catch (error) {
          log.debug({ err: error }, "live pulse snapshot push failed");
        }
      };

      const keepalive = setInterval(() => {
        try {
          send(`: keep-alive ${new Date().toISOString()}\n\n`);
        } catch {
          // Ignore write errors after disconnect.
        }
      }, KEEPALIVE_INTERVAL_MS);

      const pulseTimer = setInterval(() => {
        void pushSnapshot();
      }, PULSE_INTERVAL_MS);

      const abortHandler = () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // Controller may already be closed.
        }
      };

      request.signal.addEventListener("abort", abortHandler, { once: true });

      cleanup = () => {
        clearInterval(keepalive);
        clearInterval(pulseTimer);
        request.signal.removeEventListener("abort", abortHandler);
      };

      // Push the first snapshot immediately so the bar shows data on connect.
      void pushSnapshot();
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
