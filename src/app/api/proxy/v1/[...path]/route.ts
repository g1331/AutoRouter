import { NextRequest, NextResponse } from "next/server";
import { extractApiKey, getKeyPrefix, verifyApiKey } from "@/lib/utils/auth";
import { db, apiKeys, apiKeyUpstreams, upstreams } from "@/lib/db";
import { eq, and, inArray } from "drizzle-orm";
import { forwardRequest, prepareUpstreamForProxy } from "@/lib/services/proxy-client";
import { logRequest, extractTokenUsage, extractModelName } from "@/lib/services/request-logger";
import { randomUUID } from "crypto";

// Edge runtime for streaming support
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

/**
 * Handle all HTTP methods for proxy
 */
async function handleProxy(request: NextRequest, context: RouteContext): Promise<Response> {
  const requestId = randomUUID().slice(0, 8);
  const startTime = Date.now();

  // Extract path
  const { path: pathSegments } = await context.params;
  const path = pathSegments.join("/");

  // Extract and validate API key
  const authHeader = request.headers.get("authorization");
  const keyValue = extractApiKey(authHeader);

  if (!keyValue) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }

  // Find API key by prefix and verify
  const keyPrefix = getKeyPrefix(keyValue);
  const candidates = await db.query.apiKeys.findMany({
    where: and(eq(apiKeys.keyPrefix, keyPrefix), eq(apiKeys.isActive, true)),
  });

  let validApiKey = null;
  for (const candidate of candidates) {
    const isValid = await verifyApiKey(keyValue, candidate.keyHash);
    if (isValid) {
      // Check expiration
      if (candidate.expiresAt && candidate.expiresAt < new Date()) {
        return NextResponse.json({ error: "API key has expired" }, { status: 401 });
      }
      validApiKey = candidate;
      break;
    }
  }

  if (!validApiKey) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  // Get upstream - check X-Upstream-Name header first, then use default
  const upstreamName = request.headers.get("x-upstream-name");

  let selectedUpstream;

  if (upstreamName) {
    // Check if API key has permission for this upstream
    const upstreamPermissions = await db.query.apiKeyUpstreams.findMany({
      where: eq(apiKeyUpstreams.apiKeyId, validApiKey.id),
    });
    const allowedUpstreamIds = upstreamPermissions.map((p) => p.upstreamId);

    selectedUpstream = await db.query.upstreams.findFirst({
      where: and(eq(upstreams.name, upstreamName), eq(upstreams.isActive, true)),
    });

    if (!selectedUpstream) {
      return NextResponse.json({ error: `Upstream '${upstreamName}' not found` }, { status: 404 });
    }

    if (!allowedUpstreamIds.includes(selectedUpstream.id)) {
      return NextResponse.json(
        { error: `API key not authorized for upstream '${upstreamName}'` },
        { status: 403 }
      );
    }
  } else {
    // Get allowed upstreams for this API key
    const upstreamPermissions = await db.query.apiKeyUpstreams.findMany({
      where: eq(apiKeyUpstreams.apiKeyId, validApiKey.id),
    });
    const allowedUpstreamIds = upstreamPermissions.map((p) => p.upstreamId);

    if (allowedUpstreamIds.length === 0) {
      return NextResponse.json(
        { error: "No upstreams configured for this API key" },
        { status: 400 }
      );
    }

    // Get default or first allowed upstream
    selectedUpstream = await db.query.upstreams.findFirst({
      where: and(
        eq(upstreams.isDefault, true),
        eq(upstreams.isActive, true),
        inArray(upstreams.id, allowedUpstreamIds)
      ),
    });

    if (!selectedUpstream) {
      // Fall back to first active allowed upstream
      selectedUpstream = await db.query.upstreams.findFirst({
        where: and(eq(upstreams.isActive, true), inArray(upstreams.id, allowedUpstreamIds)),
      });
    }
  }

  if (!selectedUpstream) {
    return NextResponse.json({ error: "No active upstream available" }, { status: 503 });
  }

  // Parse request body for model name
  let requestBody: Record<string, unknown> | null = null;
  try {
    const clonedRequest = request.clone();
    const bodyText = await clonedRequest.text();
    if (bodyText) {
      requestBody = JSON.parse(bodyText);
    }
  } catch {
    // Not JSON or empty body
  }

  // Forward request to upstream
  try {
    const upstreamForProxy = prepareUpstreamForProxy(selectedUpstream);
    const result = await forwardRequest(request, upstreamForProxy, path, requestId);

    // Create response headers
    const responseHeaders = new Headers(result.headers);

    if (result.isStream) {
      // Streaming response
      const stream = result.body as ReadableStream<Uint8Array>;
      const usagePromise = result.usagePromise ?? Promise.resolve(result.usage ?? null);

      void usagePromise
        .then((usage) =>
          logRequest({
            apiKeyId: validApiKey.id,
            upstreamId: selectedUpstream.id,
            method: request.method,
            path,
            model: requestBody?.model as string | null,
            promptTokens: usage?.promptTokens || 0,
            completionTokens: usage?.completionTokens || 0,
            totalTokens: usage?.totalTokens || 0,
            cachedTokens: usage?.cachedTokens || 0,
            reasoningTokens: usage?.reasoningTokens || 0,
            cacheCreationTokens: usage?.cacheCreationTokens || 0,
            cacheReadTokens: usage?.cacheReadTokens || 0,
            statusCode: result.statusCode,
            durationMs: Date.now() - startTime,
          })
        )
        .catch((e) => console.error("Failed to log request:", e));

      // Set streaming headers
      responseHeaders.set("Content-Type", "text/event-stream");
      responseHeaders.set("Cache-Control", "no-cache");
      responseHeaders.set("Connection", "keep-alive");

      return new Response(stream, {
        status: result.statusCode,
        headers: responseHeaders,
      });
    } else {
      // Regular response
      const bodyBytes = result.body as Uint8Array;
      const durationMs = Date.now() - startTime;

      // Try to extract usage from response
      let usage = result.usage;
      if (!usage && bodyBytes.length > 0) {
        try {
          const responseBody = JSON.parse(new TextDecoder().decode(bodyBytes));
          const extracted = extractTokenUsage(responseBody);
          if (extracted) {
            usage = extracted;
          }
        } catch {
          // Not JSON
        }
      }

      // Log request
      await logRequest({
        apiKeyId: validApiKey.id,
        upstreamId: selectedUpstream.id,
        method: request.method,
        path,
        model: extractModelName(requestBody, null),
        promptTokens: usage?.promptTokens || 0,
        completionTokens: usage?.completionTokens || 0,
        totalTokens: usage?.totalTokens || 0,
        cachedTokens: usage?.cachedTokens || 0,
        reasoningTokens: usage?.reasoningTokens || 0,
        cacheCreationTokens: usage?.cacheCreationTokens || 0,
        cacheReadTokens: usage?.cacheReadTokens || 0,
        statusCode: result.statusCode,
        durationMs,
      });

      return new Response(Buffer.from(bodyBytes), {
        status: result.statusCode,
        headers: responseHeaders,
      });
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;

    // Log failed request
    await logRequest({
      apiKeyId: validApiKey.id,
      upstreamId: selectedUpstream.id,
      method: request.method,
      path,
      model: requestBody?.model as string | null,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      statusCode: error instanceof Error && error.message.includes("timed out") ? 504 : 502,
      durationMs,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    if (error instanceof Error && error.message.includes("timed out")) {
      return NextResponse.json({ error: "Upstream request timed out" }, { status: 504 });
    }

    console.error(`Proxy error for request ${requestId}:`, error);
    return NextResponse.json({ error: "Failed to connect to upstream" }, { status: 502 });
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}
