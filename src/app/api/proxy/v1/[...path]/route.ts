import { NextRequest, NextResponse } from "next/server";
import { extractApiKey, getKeyPrefix, verifyApiKey } from "@/lib/utils/auth";
import { db, apiKeys, apiKeyUpstreams, type Upstream } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import {
  forwardRequest,
  prepareUpstreamForProxy,
  type ProxyResult,
} from "@/lib/services/proxy-client";
import { logRequest, extractTokenUsage, type FailoverAttempt } from "@/lib/services/request-logger";
import {
  selectFromProviderType,
  recordConnection,
  releaseConnection,
  getUpstreamGroupByName,
  NoHealthyUpstreamsError,
  UpstreamGroupNotFoundError,
  LoadBalancerStrategy,
} from "@/lib/services/load-balancer";
import { markHealthy, markUnhealthy } from "@/lib/services/health-checker";
import {
  recordSuccess,
  recordFailure,
  CircuitBreakerOpenError,
} from "@/lib/services/circuit-breaker";
import { randomUUID } from "crypto";
import { routeByModel, NoUpstreamGroupError, type ProviderType } from "@/lib/services/model-router";
import {
  type FailoverConfig,
  DEFAULT_FAILOVER_CONFIG,
  shouldTriggerFailover,
  shouldContinueFailover,
} from "@/lib/services/failover-config";
import {
  createUnifiedErrorResponse,
  createSSEErrorEvent,
  getHttpStatusForError,
} from "@/lib/services/unified-error";

// Edge runtime for streaming support
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

/**
 * Routing decision information for logging.
 */
interface RoutingDecision {
  routingType: "auto";
  groupName: string | null;
  lbStrategy: string | null;
  providerType: ProviderType | null;
  resolvedModel: string | null;
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
  if (error instanceof CircuitBreakerOpenError) return "circuit_open";
  if (statusCode === 429) return "http_429";
  if (statusCode && statusCode >= 400 && statusCode < 500) return "http_4xx";
  if (statusCode && statusCode >= 500) return "http_5xx";
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("timed out") || msg.includes("timeout")) return "timeout";
    if (msg.includes("circuit breaker") || msg.includes("circuit_open")) return "circuit_open";
  }
  return "connection_error";
}

/**
 * Check if an error indicates we should attempt failover.
 * All connection/timeout/circuit breaker errors are failoverable.
 */
function isFailoverableError(error: unknown): boolean {
  if (error instanceof CircuitBreakerOpenError) {
    return true;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("timed out") ||
      msg.includes("timeout") ||
      msg.includes("econnrefused") ||
      msg.includes("econnreset") ||
      msg.includes("socket hang up") ||
      msg.includes("network") ||
      msg.includes("fetch failed") ||
      msg.includes("circuit breaker")
    );
  }
  return false;
}

/**
 * Forward a request with failover support using circuit breaker.
 * Tries multiple upstreams based on the configured failover strategy.
 *
 * Key features:
 * - exhaust_all strategy: tries all available upstreams until success
 * - All non-2xx responses trigger failover (configurable via excludeStatusCodes)
 * - Detects downstream client disconnect to stop unnecessary retries
 * - First-chunk validation for streaming responses
 */
async function forwardWithFailover(
  request: NextRequest,
  providerType: ProviderType,
  path: string,
  requestId: string,
  config: FailoverConfig = DEFAULT_FAILOVER_CONFIG
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

  // Loop until we succeed, exhaust all upstreams, or hit max attempts
  let attemptCount = 0;
  while (true) {
    // Check if downstream client has disconnected
    if (request.signal.aborted) {
      console.warn(`[${requestId}] Client disconnected during failover, stopping retries`);
      throw new ClientDisconnectedError("Client disconnected during failover");
    }

    let selectedUpstream: Upstream | null = null;
    let hasMoreUpstreams = true;

    try {
      // Select an upstream using provider type, excluding previously failed ones
      const selection = await selectFromProviderType(
        providerType,
        LoadBalancerStrategy.WEIGHTED,
        failedUpstreamIds.length > 0 ? failedUpstreamIds : undefined
      );

      selectedUpstream = selection.upstream;
    } catch (error) {
      if (error instanceof NoHealthyUpstreamsError) {
        hasMoreUpstreams = false;
      } else {
        throw error;
      }
    }

    // Check if we should continue trying
    if (!shouldContinueFailover(attemptCount, hasMoreUpstreams, config, request.signal.aborted)) {
      // No more upstreams or hit max attempts - throw NoHealthyUpstreamsError
      // to indicate all failover attempts have been exhausted
      throw new NoHealthyUpstreamsError(lastError?.message ?? "All upstreams exhausted");
    }

    if (!selectedUpstream) {
      throw new NoHealthyUpstreamsError("No upstream available");
    }

    attemptCount++;

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
      if (shouldTriggerFailover(result.statusCode, config)) {
        // Release connection and mark as unhealthy
        releaseConnection(selectedUpstream.id);
        void markUnhealthy(selectedUpstream.id, `HTTP ${result.statusCode} error`);
        // Record failure in circuit breaker
        void recordFailure(selectedUpstream.id, `http_${result.statusCode}`);
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

      // Success! Record success in circuit breaker and update health status
      void recordSuccess(selectedUpstream.id);

      // For streaming responses, we track the connection until the stream ends
      if (!result.isStream) {
        releaseConnection(selectedUpstream.id);
        // Mark healthy with a reasonable latency estimate
        void markHealthy(selectedUpstream.id, 100);
      } else {
        // For streaming, wrap the stream to release connection when done
        // and handle mid-stream errors
        const originalStream = result.body as ReadableStream<Uint8Array>;
        const wrappedStream = wrapStreamWithConnectionTracking(
          originalStream,
          selectedUpstream.id,
          request.signal
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

      // Check if client disconnected
      if (request.signal.aborted) {
        console.warn(`[${requestId}] Client disconnected during request, stopping`);
        throw new ClientDisconnectedError("Client disconnected during request");
      }

      // Record failure in circuit breaker for failoverable errors
      if (isFailoverableError(error) || error instanceof CircuitBreakerOpenError) {
        void recordFailure(
          selectedUpstream.id,
          getErrorType(error instanceof Error ? error : null, null)
        );

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
  }
}

/**
 * Error thrown when downstream client disconnects.
 */
class ClientDisconnectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientDisconnectedError";
  }
}

/**
 * Wrap a ReadableStream to track and release connection when the stream ends.
 * Also records circuit breaker success/failure based on stream completion.
 * Supports downstream disconnect detection and SSE error events.
 *
 * @param stream - The upstream response stream
 * @param upstreamId - The upstream ID for connection tracking
 * @param abortSignal - Optional abort signal to detect downstream disconnect
 */
function wrapStreamWithConnectionTracking(
  stream: ReadableStream<Uint8Array>,
  upstreamId: string,
  abortSignal?: AbortSignal
): ReadableStream<Uint8Array> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      reader = stream.getReader();

      // Set up abort listener if signal provided
      const abortHandler = () => {
        console.warn(`[Stream] Client disconnected, cancelling upstream stream`);
        reader?.cancel("Client disconnected");
        releaseConnection(upstreamId);
        try {
          controller.close();
        } catch {
          // Controller may already be closed
        }
      };

      if (abortSignal) {
        abortSignal.addEventListener("abort", abortHandler, { once: true });
      }

      try {
        while (true) {
          // Check if client disconnected
          if (abortSignal?.aborted) {
            console.warn(`[Stream] Client already disconnected, stopping stream`);
            break;
          }

          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          controller.enqueue(value);
        }
        controller.close();
        // Stream completed successfully - release connection, mark healthy, record circuit breaker success
        releaseConnection(upstreamId);
        void markHealthy(upstreamId, 100);
        void recordSuccess(upstreamId);
      } catch (error) {
        // Check if this is due to client disconnect
        if (abortSignal?.aborted) {
          console.warn(`[Stream] Stream error due to client disconnect`);
          releaseConnection(upstreamId);
          return;
        }

        // Stream errored mid-way - send SSE error event to downstream
        try {
          const sseErrorEvent = createSSEErrorEvent("STREAM_ERROR");
          controller.enqueue(encoder.encode(sseErrorEvent));
          controller.close();
        } catch {
          // Controller may already be in error state
          controller.error(error);
        }

        // Release connection, mark unhealthy, record circuit breaker failure
        releaseConnection(upstreamId);
        void markUnhealthy(upstreamId, error instanceof Error ? error.message : "Stream error");
        void recordFailure(upstreamId, "stream_error");
      } finally {
        reader?.releaseLock();
        reader = null;
        if (abortSignal) {
          abortSignal.removeEventListener("abort", abortHandler);
        }
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
 * Extract model from request body
 */
async function extractModelFromRequest(request: NextRequest): Promise<string | null> {
  try {
    const clonedRequest = request.clone();
    const bodyText = await clonedRequest.text();
    if (bodyText) {
      const body = JSON.parse(bodyText);
      return body.model || null;
    }
  } catch {
    // Not JSON or empty body
  }
  return null;
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

  // Extract model from request body for model-based routing
  const model = await extractModelFromRequest(request);

  if (!model) {
    return NextResponse.json({ error: "Missing required field: model" }, { status: 400 });
  }

  // Model-based routing
  let selectedUpstream: Upstream | undefined;
  let useLoadBalancer = false;
  let groupStrategy: string | null = null;
  let groupName: string | null = null;
  let providerType: ProviderType | null = null;
  let resolvedModel = model;

  // Routing type is always "auto" for model-based routing
  const routingType = "auto" as const;

  try {
    // Route by model
    const routingResult = await routeByModel(model);

    if (!routingResult.upstream) {
      return NextResponse.json(
        { error: `No upstream group configured for model: ${model}` },
        { status: 400 }
      );
    }

    selectedUpstream = routingResult.upstream;
    groupName = routingResult.groupName;
    providerType = routingResult.providerType;
    resolvedModel = routingResult.resolvedModel;

    // Get group details for load balancing
    if (groupName) {
      const group = await getUpstreamGroupByName(groupName);
      if (group) {
        groupStrategy = group.strategy;
        useLoadBalancer = true;
      }
    }

    // Validate API key has permission for this upstream
    const upstreamPermissions = await db.query.apiKeyUpstreams.findMany({
      where: eq(apiKeyUpstreams.apiKeyId, validApiKey.id),
    });
    const allowedUpstreamIds = upstreamPermissions.map((p) => p.upstreamId);

    if (!allowedUpstreamIds.includes(selectedUpstream.id)) {
      return NextResponse.json(
        { error: `API key not authorized for upstream '${selectedUpstream.name}'` },
        { status: 403 }
      );
    }
  } catch (error) {
    if (error instanceof NoUpstreamGroupError) {
      return NextResponse.json(
        { error: `No upstream group configured for model: ${model}` },
        { status: 400 }
      );
    }
    throw error;
  }

  // Track failover history outside try block for error logging
  let failoverHistory: FailoverAttempt[] = [];

  // Forward request to upstream
  try {
    let result: ProxyResult;
    let upstreamForLogging: Upstream;

    if (useLoadBalancer && providerType) {
      // Use load balancer with circuit breaker failover for provider-type routing
      const {
        result: proxyResult,
        selectedUpstream: selected,
        failoverHistory: history,
      } = await forwardWithFailover(request, providerType, path, requestId);
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
      providerType,
      resolvedModel,
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
            model: resolvedModel,
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
        model: resolvedModel,
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

    // Determine error code for unified response
    let errorCode:
      | "ALL_UPSTREAMS_UNAVAILABLE"
      | "REQUEST_TIMEOUT"
      | "CLIENT_DISCONNECTED"
      | "SERVICE_UNAVAILABLE" = "SERVICE_UNAVAILABLE";
    if (error instanceof NoHealthyUpstreamsError) {
      errorCode = "ALL_UPSTREAMS_UNAVAILABLE";
    } else if (error instanceof ClientDisconnectedError) {
      errorCode = "CLIENT_DISCONNECTED";
    } else if (error instanceof Error && error.message.includes("timed out")) {
      errorCode = "REQUEST_TIMEOUT";
    }

    // Log failed request (internal logging with full details)
    await logRequest({
      apiKeyId: validApiKey.id,
      upstreamId: logUpstreamId,
      method: request.method,
      path,
      model: resolvedModel,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      statusCode: getHttpStatusForError(errorCode),
      durationMs,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      routingType,
      groupName,
      lbStrategy: groupStrategy,
      failoverAttempts: failoverHistory.length,
      failoverHistory: failoverHistory.length > 0 ? failoverHistory : null,
    });

    // Handle client disconnect silently (no response needed)
    if (error instanceof ClientDisconnectedError) {
      console.warn(`[${requestId}] Client disconnected, no response sent`);
      return createUnifiedErrorResponse("CLIENT_DISCONNECTED");
    }

    // Return unified error response (no upstream details exposed)
    if (error instanceof NoHealthyUpstreamsError) {
      return createUnifiedErrorResponse("ALL_UPSTREAMS_UNAVAILABLE");
    }

    if (error instanceof Error && error.message.includes("timed out")) {
      return createUnifiedErrorResponse("REQUEST_TIMEOUT");
    }

    if (error instanceof CircuitBreakerOpenError) {
      return createUnifiedErrorResponse("ALL_UPSTREAMS_UNAVAILABLE");
    }

    if (error instanceof UpstreamGroupNotFoundError) {
      return createUnifiedErrorResponse("NO_UPSTREAMS_CONFIGURED");
    }

    console.error(`Proxy error for request ${requestId}:`, error);
    return createUnifiedErrorResponse("SERVICE_UNAVAILABLE");
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
