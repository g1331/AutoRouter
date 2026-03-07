import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/utils/api-auth";
import { validateAdminAuth } from "@/lib/utils/auth";
import { subscribeRequestLogLiveUpdates } from "@/lib/services/request-log-live-updates";
import { createLogger } from "@/lib/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("admin-logs-live");
const KEEPALIVE_INTERVAL_MS = 15000;

function formatSseEvent(eventName: string, data: unknown): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  const encoder = new TextEncoder();
  let cleanup = () => undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk));
      };

      const keepalive = setInterval(() => {
        try {
          send(`: keep-alive ${new Date().toISOString()}\n\n`);
        } catch {
          // Ignore write errors after disconnect.
        }
      }, KEEPALIVE_INTERVAL_MS);

      const unsubscribe = subscribeRequestLogLiveUpdates((event) => {
        try {
          send(formatSseEvent(event.type, event));
        } catch (error) {
          log.debug({ err: error }, "request log live stream send failed");
        }
      });

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
        unsubscribe();
        request.signal.removeEventListener("abort", abortHandler);
      };

      send(
        formatSseEvent("connected", {
          ok: true,
          occurredAt: new Date().toISOString(),
        })
      );
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
