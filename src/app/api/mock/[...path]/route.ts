import { NextRequest, NextResponse } from "next/server";
import { readLatestFixture } from "@/lib/services/traffic-recorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

function guardProduction(): Response | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Mock endpoint is disabled in production" }, { status: 404 });
  }
  return null;
}

function buildStream(chunks: string[], interruptAfter?: number): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    start(controller) {
      const push = () => {
        if (interruptAfter !== undefined && index >= interruptAfter) {
          controller.close();
          return;
        }

        if (index >= chunks.length) {
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(chunks[index]));
        index += 1;
        setTimeout(push, 10);
      };

      push();
    },
  });
}

async function handleMock(request: NextRequest, context: RouteContext): Promise<Response> {
  const blocked = guardProduction();
  if (blocked) return blocked;

  const { path: pathSegments } = await context.params;
  const route = pathSegments.join("/");
  const provider = request.nextUrl.searchParams.get("provider") || "default";

  const errorCode = request.nextUrl.searchParams.get("mock_error");
  if (errorCode === "429") {
    return NextResponse.json({ error: "Mock rate limited" }, { status: 429 });
  }

  const delayMs = Number(request.nextUrl.searchParams.get("mock_delay_ms") || "0");
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const fixture = await readLatestFixture(provider, route);
  if (!fixture) {
    return NextResponse.json({ error: "Fixture not found" }, { status: 404 });
  }

  const response = fixture.outbound.response;
  const status = response.status ?? 200;
  const headers = new Headers(response.headers || {});

  const streamMode = request.nextUrl.searchParams.get("mock_stream") === "1";
  if (streamMode && response.streamChunks && response.streamChunks.length > 0) {
    const interruptAfter = request.nextUrl.searchParams.get("mock_interrupt_after");
    const interruptCount = interruptAfter ? Number(interruptAfter) : undefined;
    headers.set("Content-Type", "text/event-stream");
    headers.set("Cache-Control", "no-cache");
    headers.set("Connection", "keep-alive");
    return new Response(buildStream(response.streamChunks, interruptCount), { status, headers });
  }

  if (response.bodyText) {
    return new Response(response.bodyText, { status, headers });
  }

  return NextResponse.json(response.bodyJson ?? {}, { status, headers });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return handleMock(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return handleMock(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return handleMock(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return handleMock(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return handleMock(request, context);
}
