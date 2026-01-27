import { NextRequest, NextResponse } from "next/server";
import { extractApiKey, getKeyPrefix, verifyApiKey } from "@/lib/utils/auth";
import { db, apiKeys, apiKeyUpstreams, upstreams, type Upstream } from "@/lib/db";
import { eq, and, inArray } from "drizzle-orm";
import {
  forwardRequest,
  prepareUpstreamForProxy,
  type ProxyResult,
} from "@/lib/services/proxy-client";
import {
  logRequest,
  extractTokenUsage,
  extractModelName,
  type FailoverAttempt,
} from "@/lib/services/request-logger";
import {
  selectUpstream,
  recordConnection,
  releaseConnection,
  getUpstreamGroupByName,
  NoHealthyUpstreamsError,
  UpstreamGroupNotFoundError,
} from "@/lib/services/load-balancer";
import { markHealthy, markUnhealthy } from "@/lib/services/health-checker";
import { randomUUID } from "crypto";

// Edge runtime for streaming support
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };
type RequiredProvider = "openai" | "anthropic";

/** Maximum number of failover attempts when using group-based routing. */
const MAX_FAILOVER_ATTEMPTS = 3;

function getRequiredProvider(path: string): RequiredProvider | null {
  const normalized = path.replace(/^\/+/, "").toLowerCase();

  if (normalized === "messages" || normalized.startsWith("messages/")) {
    return "anthropic";
  }

  if (normalized === "responses" || normalized.startsWith("responses/")) {
    return "openai";
  }

  if (normalized === "chat/completions" || normalized.startsWith("chat/completions/")) {
    return "openai";
  }

  if (normalized === "completions" || normalized.startsWith("completions/")) {
    return "openai";
  }

  if (normalized === "embeddings" || normalized.startsWith("embeddings/")) {
    return "openai";
  }

  if (normalized === "models" || normalized.startsWith("models/")) {
    return "openai";
  }

  if (normalized === "moderations" || normalized.startsWith("moderations/")) {
    return "openai";
  }

  if (normalized === "images" || normalized.startsWith("images/")) {
    return "openai";
  }

  if (normalized === "audio" || normalized.startsWith("audio/")) {
    return "openai";
  }

  return null;
}

/**
 * Check if an error indicates the upstream is unhealthy (connection/timeout errors).
 * We should attempt failover for these errors.
 */
function isFailoverableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("timed out") ||
      msg.includes("timeout") ||
      msg.includes("econnrefused") ||
      msg.includes("econnreset") ||
      msg.includes("socket hang up") ||
      msg.includes("network") ||
      msg.includes("fetch failed")
    );
  }
  return false;
}

/**
 * Check if an HTTP status code indicates the upstream is unhealthy.
 * 5xx errors and some 4xx errors (like 429 rate limit) may indicate issues.
 */
function shouldFailover(statusCode: number): boolean {
  // 5xx server errors
  if (statusCode >= 500 && statusCode <= 599) {
    return true;
  }
  // 429 rate limit - may want to try another upstream
  if (statusCode === 429) {
    return true;
  }
  return false;
}

/**
 * Routing decision information for logging.
 */
interface RoutingDecision {
  routingType: "direct" | "group" | "default";
  groupName: string | null;
  lbStrategy: string | null;
  failoverAttempts: number;
  failoverHistory: FailoverAttempt[];
}

/**
 * Determine error type for failover logging.
 */
function getErrorType(
  error: Error | null,
  statusCode: number | null
): FailoverAttempt["error_type"] {
  if (statusCode === 429) return "http_429";
  if (statusCode && statusCode >= 500) return "http_5xx";
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("timed out") || msg.includes("timeout")) return "timeout";
  }
  return "connection_error";
}

/**
 * Forward a request with failover support for group-based routing.
 * Tries multiple upstreams from the group if the initial request fails.
 */
async function forwardWithFailover(
  request: NextRequest,
  groupId: string,
  path: string,
  requestId: string,
  requiredProvider: RequiredProvider | null
): Promise<{
  result: ProxyResult;
  selectedUpstream: Upstream;
  failedUpstreamIds: string[];
  failoverHistory: FailoverAttempt[];
}> {
  const failedUpstreamIds: string[] = [];
  const failoverHistory: FailoverAttempt[] = [];
  let lastError: Error | null = null;

  // Clone the request body once for potential retries
  const requestClone = request.clone();
  const requestBodyBuffer = await requestClone.arrayBuffer();

  for (let attempt = 0; attempt < MAX_FAILOVER_ATTEMPTS; attempt++) {
    try {
      // Select an upstream from the group, excluding previously failed ones
      const selection = await selectUpstream(
        groupId,
        undefined, // Use group's default strategy
        failedUpstreamIds.length > 0 ? failedUpstreamIds : undefined
      );

      const selectedUpstream = selection.upstream;

      // Validate provider compatibility
      if (requiredProvider && selectedUpstream.provider !== requiredProvider) {
        // This shouldn't happen if group is configured correctly, but handle it
        failedUpstreamIds.push(selectedUpstream.id);
        continue;
      }

      // Track connection for least-connections strategy
      recordConnection(selectedUpstream.id);

      try {
        // Create a new request with the buffered body
        const proxyRequest = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: requestBodyBuffer.byteLength > 0 ? requestBodyBuffer : undefined,
        });

        const upstreamForProxy = prepareUpstreamForProxy(selectedUpstream);
        const result = await forwardRequest(proxyRequest, upstreamForProxy, path, requestId);

        // Check if response indicates we should failover
        if (shouldFailover(result.statusCode)) {
          // Release connection and mark as unhealthy
          releaseConnection(selectedUpstream.id);
          void markUnhealthy(selectedUpstream.id, `HTTP ${result.statusCode} error`);
          // Record failover attempt
          failoverHistory.push({
            upstream_id: selectedUpstream.id,
            upstream_name: selectedUpstream.name,
            attempted_at: new Date().toISOString(),
            error_type: getErrorType(null, result.statusCode),
            error_message: `HTTP ${result.statusCode} error`,
            status_code: result.statusCode,
          });
          failedUpstreamIds.push(selectedUpstream.id);
          lastError = new Error(`Upstream returned ${result.statusCode}`);
          continue;
        }

        // Success! Update health status asynchronously
        // For streaming responses, we track the connection until the stream ends
        if (!result.isStream) {
          releaseConnection(selectedUpstream.id);
          // Mark healthy with a reasonable latency estimate
          void markHealthy(selectedUpstream.id, 100);
        } else {
          // For streaming, wrap the stream to release connection when done
          const originalStream = result.body as ReadableStream<Uint8Array>;
          const wrappedStream = wrapStreamWithConnectionTracking(
            originalStream,
            selectedUpstream.id
          );
          return {
            result: { ...result, body: wrappedStream },
            selectedUpstream,
            failedUpstreamIds,
            failoverHistory,
          };
        }

        return { result, selectedUpstream, failedUpstreamIds, failoverHistory };
      } catch (error) {
        // Release connection on error
        releaseConnection(selectedUpstream.id);

        if (isFailoverableError(error)) {
          // Mark upstream as unhealthy
          const errorMessage = error instanceof Error ? error.message : "Request failed";
          void markUnhealthy(selectedUpstream.id, errorMessage);
          // Record failover attempt
          failoverHistory.push({
            upstream_id: selectedUpstream.id,
            upstream_name: selectedUpstream.name,
            attempted_at: new Date().toISOString(),
            error_type: getErrorType(error instanceof Error ? error : null, null),
            error_message: errorMessage,
            status_code: null,
          });
          failedUpstreamIds.push(selectedUpstream.id);
          lastError = error instanceof Error ? error : new Error(String(error));
          continue;
        }

        // Non-failoverable error - rethrow
        throw error;
      }
    } catch (error) {
      if (error instanceof NoHealthyUpstreamsError) {
        // No more healthy upstreams to try
        throw lastError ?? error;
      }
      throw error;
    }
  }

  // Exhausted all attempts
  throw lastError ?? new Error("All failover attempts exhausted");
}

/**
 * Wrap a ReadableStream to track and release connection when the stream ends.
 */
function wrapStreamWithConnectionTracking(
  stream: ReadableStream<Uint8Array>,
  upstreamId: string
): ReadableStream<Uint8Array> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  return new ReadableStream({
    async start(controller) {
      reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          controller.enqueue(value);
        }
        controller.close();
        // Stream completed successfully - release connection and mark healthy
        releaseConnection(upstreamId);
        void markHealthy(upstreamId, 100);
      } catch (error) {
        controller.error(error);
        // Stream errored - release connection and mark unhealthy
        releaseConnection(upstreamId);
        void markUnhealthy(upstreamId, error instanceof Error ? error.message : "Stream error");
      } finally {
        reader?.releaseLock();
        reader = null;
      }
    },
    async cancel(reason) {
      // Propagate cancel to the upstream stream to avoid leaking work/connections.
      await reader?.cancel(reason);
      releaseConnection(upstreamId);
    },
  });
}

/**
 * Handle all HTTP methods for proxy
 */
async function handleProxy(request: NextRequest, context: RouteContext): Promise<Response> {
  const requestId = randomUUID().slice(0, 8);
  const startTime = Date.now();

  // Extract path
  const { path: pathSegments } = await context.params;
  const path = pathSegments.join("/");
  const requiredProvider = getRequiredProvider(path);

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

  // Check for X-Upstream-Group header first (load balanced routing)
  const upstreamGroupName = request.headers.get("x-upstream-group");

  // Get upstream - check X-Upstream-Name header, then X-Upstream-Group, then use default
  const upstreamName = request.headers.get("x-upstream-name");

  let selectedUpstream: Upstream | undefined;
  let useLoadBalancer = false;
  let groupId: string | null = null;
  let groupStrategy: string | null = null;
  let groupName: string | null = null;

  // Determine routing type based on headers
  let routingType: "direct" | "group" | "default" = "default";

  if (upstreamGroupName && !upstreamName) {
    // Group-based load balanced routing
    routingType = "group";
    const group = await getUpstreamGroupByName(upstreamGroupName);

    if (!group) {
      return NextResponse.json(
        { error: `Upstream group '${upstreamGroupName}' not found` },
        { status: 404 }
      );
    }

    if (!group.isActive) {
      return NextResponse.json(
        { error: `Upstream group '${upstreamGroupName}' is not active` },
        { status: 400 }
      );
    }

    // Validate provider matches group
    if (requiredProvider && group.provider !== requiredProvider) {
      return NextResponse.json(
        {
          error: `Upstream group '${upstreamGroupName}' does not support '${requiredProvider}' requests`,
        },
        { status: 400 }
      );
    }

    // Validate API key has permission for at least one upstream in this group
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

    const groupUpstreams = await db.query.upstreams.findMany({
      where: and(eq(upstreams.groupId, group.id), eq(upstreams.isActive, true)),
      columns: { id: true },
    });

    const hasPermission = groupUpstreams.some((u) => allowedUpstreamIds.includes(u.id));
    if (!hasPermission) {
      return NextResponse.json(
        { error: `API key not authorized for upstream group '${upstreamGroupName}'` },
        { status: 403 }
      );
    }

    useLoadBalancer = true;
    groupId = group.id;
    groupName = group.name;
    groupStrategy = group.strategy;
  } else if (upstreamName) {
    // Explicit upstream name specified
    routingType = "direct";
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

    if (requiredProvider && selectedUpstream.provider !== requiredProvider) {
      return NextResponse.json(
        {
          error: `Upstream '${upstreamName}' does not support '${requiredProvider}' requests`,
        },
        { status: 400 }
      );
    }
  } else {
    // Default upstream selection (no explicit name or group)
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

    const upstreamConditions = [
      eq(upstreams.isActive, true),
      inArray(upstreams.id, allowedUpstreamIds),
    ];

    if (requiredProvider) {
      upstreamConditions.push(eq(upstreams.provider, requiredProvider));
    }

    // Get default or first allowed upstream (filtered by provider when required)
    selectedUpstream = await db.query.upstreams.findFirst({
      where: and(eq(upstreams.isDefault, true), ...upstreamConditions),
    });

    if (!selectedUpstream) {
      // Fall back to first active allowed upstream
      selectedUpstream = await db.query.upstreams.findFirst({
        where: and(...upstreamConditions),
      });
    }

    if (!selectedUpstream && requiredProvider) {
      return NextResponse.json(
        { error: `No upstreams configured for '${requiredProvider}' requests` },
        { status: 400 }
      );
    }
  }

  // Parse request body for model name (before forwarding)
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

  // Track failover history outside try block for error logging
  let failoverHistory: FailoverAttempt[] = [];

  // Forward request to upstream
  try {
    let result: ProxyResult;
    let upstreamForLogging: Upstream;

    if (useLoadBalancer && groupId && groupStrategy) {
      // Use load balancer with failover for group-based routing
      const {
        result: proxyResult,
        selectedUpstream: selected,
        failoverHistory: history,
      } = await forwardWithFailover(request, groupId, path, requestId, requiredProvider);
      result = proxyResult;
      upstreamForLogging = selected;
      failoverHistory = history;
    } else if (selectedUpstream) {
      // Direct upstream routing (no load balancing)
      const upstreamForProxy = prepareUpstreamForProxy(selectedUpstream);
      result = await forwardRequest(request, upstreamForProxy, path, requestId);
      upstreamForLogging = selectedUpstream;
    } else {
      return NextResponse.json({ error: "No active upstream available" }, { status: 503 });
    }

    // Build routing decision for logging
    const routingDecision: RoutingDecision = {
      routingType,
      groupName,
      lbStrategy: groupStrategy,
      failoverAttempts: failoverHistory.length,
      failoverHistory,
    };

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
            upstreamId: upstreamForLogging.id,
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
            routingType: routingDecision.routingType,
            groupName: routingDecision.groupName,
            lbStrategy: routingDecision.lbStrategy,
            failoverAttempts: routingDecision.failoverAttempts,
            failoverHistory:
              routingDecision.failoverHistory.length > 0 ? routingDecision.failoverHistory : null,
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
        upstreamId: upstreamForLogging.id,
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
        routingType: routingDecision.routingType,
        groupName: routingDecision.groupName,
        lbStrategy: routingDecision.lbStrategy,
        failoverAttempts: routingDecision.failoverAttempts,
        failoverHistory:
          routingDecision.failoverHistory.length > 0 ? routingDecision.failoverHistory : null,
      });

      return new Response(Buffer.from(bodyBytes), {
        status: result.statusCode,
        headers: responseHeaders,
      });
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;

    // Determine which upstream to log (for load balanced requests, we may not have one if all failed)
    const logUpstreamId = selectedUpstream?.id ?? null;

    // Log failed request
    await logRequest({
      apiKeyId: validApiKey.id,
      upstreamId: logUpstreamId,
      method: request.method,
      path,
      model: requestBody?.model as string | null,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      statusCode: error instanceof Error && error.message.includes("timed out") ? 504 : 502,
      durationMs,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      routingType,
      groupName,
      lbStrategy: groupStrategy,
      failoverAttempts: failoverHistory.length,
      failoverHistory: failoverHistory.length > 0 ? failoverHistory : null,
    });

    if (error instanceof UpstreamGroupNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof NoHealthyUpstreamsError) {
      return NextResponse.json(
        { error: "No healthy upstreams available in the group" },
        { status: 503 }
      );
    }

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
