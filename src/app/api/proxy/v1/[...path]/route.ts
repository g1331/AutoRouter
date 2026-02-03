import { NextRequest, NextResponse } from "next/server";
import { extractApiKey, getKeyPrefix, verifyApiKey } from "@/lib/utils/auth";
import { db, apiKeys, apiKeyUpstreams, type Upstream } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import {
  forwardRequest,
  prepareUpstreamForProxy,
  filterHeaders,
  injectAuthHeader,
  type ProxyResult,
} from "@/lib/services/proxy-client";
import {
  logRequest,
  logRequestStart,
  updateRequestLog,
  extractTokenUsage,
  type FailoverAttempt,
} from "@/lib/services/request-logger";
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
import {
  routeByModel,
  NoUpstreamGroupError,
  type ProviderType,
  type ModelRouterResult,
} from "@/lib/services/model-router";
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
import type {
  RoutingDecisionLog,
  RoutingCandidate,
  RoutingExcluded,
  RoutingCircuitState,
} from "@/types/api";
import {
  isRecorderEnabled,
  recordTrafficFixture,
  redactHeaders,
  type TrafficRecordFixture,
} from "@/lib/services/traffic-recorder";

// Edge runtime for streaming support
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

/**
 * Transform ModelRouterResult to RoutingDecisionLog for storage.
 */
function transformToRoutingDecisionLog(
  routerResult: ModelRouterResult,
  selectedUpstreamId: string | null,
  lbStrategy: string | null
): RoutingDecisionLog {
  // Transform candidates to simplified format (handle undefined)
  const candidates: RoutingCandidate[] = (routerResult.candidateUpstreams || []).map((c) => ({
    id: c.id,
    name: c.name,
    weight: c.weight,
    circuit_state: (c.circuitState as RoutingCircuitState) || "closed",
  }));

  // Transform excluded upstreams (handle undefined)
  const excluded: RoutingExcluded[] = (routerResult.excludedUpstreams || []).map((e) => ({
    id: e.id,
    name: e.name,
    reason: e.reason,
  }));

  return {
    original_model: routerResult.routingDecision.originalModel,
    resolved_model: routerResult.routingDecision.resolvedModel,
    model_redirect_applied: routerResult.routingDecision.modelRedirectApplied,
    provider_type: routerResult.providerType,
    routing_type: routerResult.routingDecision.routingType,
    candidates,
    excluded,
    candidate_count: routerResult.routingDecision.candidateCount,
    final_candidate_count: routerResult.routingDecision.finalCandidateCount,
    selected_upstream_id: selectedUpstreamId,
    selection_strategy: lbStrategy || "weighted",
  };
}

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
 * - Only selects from authorized upstreams (API key permission filtering)
 */
async function forwardWithFailover(
  request: NextRequest,
  providerType: ProviderType,
  path: string,
  requestId: string,
  allowedUpstreamIds: string[],
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
      // and filtering by allowed upstream IDs (API key authorization)
      const selection = await selectFromProviderType(
        providerType,
        LoadBalancerStrategy.WEIGHTED,
        failedUpstreamIds.length > 0 ? failedUpstreamIds : undefined,
        allowedUpstreamIds
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

async function readRequestBody(
  request: NextRequest
): Promise<{ text: string | null; json: unknown | null; buffer: ArrayBuffer | null }> {
  const clone = request.clone();
  const buffer = await clone.arrayBuffer();
  if (buffer.byteLength === 0) {
    return { text: null, json: null, buffer: null };
  }
  const text = new TextDecoder().decode(buffer);
  try {
    return { text, json: JSON.parse(text), buffer };
  } catch {
    return { text, json: null, buffer };
  }
}

async function readStreamChunks(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(decoder.decode(value, { stream: true }));
      }
    }
  } finally {
    reader.releaseLock();
  }
  return chunks;
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
  let allowedUpstreamIds: string[] = [];
  let routerResult: ModelRouterResult | null = null;
  const recorderEnabled = isRecorderEnabled();
  const inboundBody = recorderEnabled ? await readRequestBody(request) : null;

  // Routing type is always "auto" for model-based routing
  const routingType = "auto" as const;

  try {
    // Route by model
    routerResult = await routeByModel(model);

    if (!routerResult.upstream) {
      return createUnifiedErrorResponse("NO_UPSTREAMS_CONFIGURED");
    }

    selectedUpstream = routerResult.upstream;
    groupName = routerResult.groupName;
    providerType = routerResult.providerType;
    resolvedModel = routerResult.resolvedModel;

    // Get group details for load balancing
    if (groupName) {
      const group = await getUpstreamGroupByName(groupName);
      if (group) {
        groupStrategy = group.strategy;
        useLoadBalancer = true;
      }
    }

    // Get API key's allowed upstream IDs for authorization filtering
    const upstreamPermissions = await db.query.apiKeyUpstreams.findMany({
      where: eq(apiKeyUpstreams.apiKeyId, validApiKey.id),
    });
    allowedUpstreamIds = upstreamPermissions.map((p) => p.upstreamId);

    // For non-load-balanced routing, validate API key has permission for this upstream
    if (!useLoadBalancer && !allowedUpstreamIds.includes(selectedUpstream.id)) {
      // Log the actual reason internally but return generic error to downstream
      console.warn(
        `[Auth] API key ${validApiKey.id} not authorized for upstream '${selectedUpstream.name}'`
      );
      return createUnifiedErrorResponse("SERVICE_UNAVAILABLE");
    }
  } catch (error) {
    if (error instanceof NoUpstreamGroupError) {
      return createUnifiedErrorResponse("NO_UPSTREAMS_CONFIGURED");
    }
    throw error;
  }

  // Track failover history outside try block for error logging
  let failoverHistory: FailoverAttempt[] = [];
  let requestLogId: string | null = null;

  // Build initial routing decision log (will be updated with final upstream after selection)
  const initialRoutingDecisionLog =
    routerResult && routerResult.routingDecision
      ? transformToRoutingDecisionLog(
          routerResult,
          useLoadBalancer ? null : (selectedUpstream?.id ?? null),
          groupStrategy
        )
      : null;

  // Create an in-progress log entry so the admin UI can show active requests.
  // Never fail the proxy request if logging fails.
  try {
    const startLog = await logRequestStart({
      apiKeyId: validApiKey.id,
      upstreamId: useLoadBalancer ? null : (selectedUpstream?.id ?? null),
      method: request.method,
      path,
      model: resolvedModel,
      routingType,
      groupName,
      lbStrategy: groupStrategy,
      routingDecision: initialRoutingDecisionLog,
    });
    requestLogId = startLog.id;
  } catch (e) {
    console.error("Failed to create in-progress request log:", e);
  }

  // Forward request to upstream
  try {
    let result: ProxyResult;
    let upstreamForLogging: Upstream;

    if (useLoadBalancer && providerType) {
      // Use load balancer with circuit breaker failover for provider-type routing
      // Pass allowedUpstreamIds to filter by API key authorization
      const {
        result: proxyResult,
        selectedUpstream: selected,
        failoverHistory: history,
      } = await forwardWithFailover(request, providerType, path, requestId, allowedUpstreamIds);
      result = proxyResult;
      upstreamForLogging = selected;
      failoverHistory = history;
    } else if (selectedUpstream) {
      // Direct upstream routing (no load balancing)
      const upstreamForProxy = prepareUpstreamForProxy(selectedUpstream);
      result = await forwardRequest(request, upstreamForProxy, path, requestId);
      upstreamForLogging = selectedUpstream;
    } else {
      return createUnifiedErrorResponse("NO_UPSTREAMS_CONFIGURED");
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

    // Build final routing decision log with actual selected upstream
    const finalRoutingDecisionLog =
      routerResult && routerResult.routingDecision
        ? transformToRoutingDecisionLog(routerResult, upstreamForLogging.id, groupStrategy)
        : null;

    // For load-balanced routing, the upstream is only known after selection. Update it early
    // so the in-progress row shows the upstream as soon as possible.
    if (requestLogId && useLoadBalancer) {
      void updateRequestLog(requestLogId, {
        upstreamId: upstreamForLogging.id,
        routingDecision: finalRoutingDecisionLog,
      }).catch((e) => console.error("Failed to update request log upstream:", e));
    }

    // Create response headers
    const responseHeaders = new Headers(result.headers);

    if (result.isStream) {
      // Streaming response
      const originalStream = result.body as ReadableStream<Uint8Array>;
      let recordingStream: ReadableStream<Uint8Array> | null = null;
      let responseStream = originalStream;

      if (recorderEnabled && inboundBody) {
        const [clientStream, recordStream] = originalStream.tee();
        recordingStream = recordStream;
        responseStream = clientStream;
      }
      const usagePromise = result.usagePromise ?? Promise.resolve(result.usage ?? null);

      void usagePromise
        .then((usage) => {
          if (requestLogId) {
            return updateRequestLog(requestLogId, {
              upstreamId: upstreamForLogging.id,
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
              errorMessage: null,
              routingType: routingDecision.routingType,
              groupName: routingDecision.groupName,
              lbStrategy: routingDecision.lbStrategy,
              failoverAttempts: routingDecision.failoverAttempts,
              failoverHistory:
                routingDecision.failoverHistory.length > 0 ? routingDecision.failoverHistory : null,
              routingDecision: finalRoutingDecisionLog,
            });
          }

          return logRequest({
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
            routingDecision: finalRoutingDecisionLog,
          });
        })
        .catch((e) => console.error("Failed to log request:", e));

      // Set streaming headers
      responseHeaders.set("Content-Type", "text/event-stream");
      responseHeaders.set("Cache-Control", "no-cache");
      responseHeaders.set("Connection", "keep-alive");

      if (recorderEnabled && inboundBody && recordingStream) {
        const upstreamForProxy = prepareUpstreamForProxy(upstreamForLogging);
        const outboundHeaders = injectAuthHeader(
          filterHeaders(new Headers(request.headers)),
          upstreamForProxy
        );
        void readStreamChunks(recordingStream)
          .then((chunks) => {
            const fixture: TrafficRecordFixture = {
              meta: {
                requestId,
                createdAt: new Date().toISOString(),
                provider: upstreamForLogging.provider,
                route: path,
                model: resolvedModel,
                durationMs: Date.now() - startTime,
              },
              inbound: {
                method: request.method,
                path,
                headers: redactHeaders(request.headers),
                bodyText: inboundBody.text,
                bodyJson: inboundBody.json,
              },
              outbound: {
                upstream: {
                  id: upstreamForLogging.id,
                  name: upstreamForLogging.name,
                  provider: upstreamForLogging.provider,
                  baseUrl: upstreamForProxy.baseUrl,
                },
                request: {
                  method: request.method,
                  path,
                  headers: redactHeaders(outboundHeaders),
                  bodyText: inboundBody.text,
                  bodyJson: inboundBody.json,
                },
                response: {
                  status: result.statusCode,
                  headers: redactHeaders(result.headers),
                  bodyText: null,
                  bodyJson: null,
                  streamChunks: chunks,
                },
              },
            };
            return recordTrafficFixture(fixture);
          })
          .catch((error) => console.error("Failed to record stream fixture:", error));
      }

      return new Response(responseStream, {
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
      if (requestLogId) {
        await updateRequestLog(requestLogId, {
          upstreamId: upstreamForLogging.id,
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
          errorMessage: null,
          routingType: routingDecision.routingType,
          groupName: routingDecision.groupName,
          lbStrategy: routingDecision.lbStrategy,
          failoverAttempts: routingDecision.failoverAttempts,
          failoverHistory:
            routingDecision.failoverHistory.length > 0 ? routingDecision.failoverHistory : null,
          routingDecision: finalRoutingDecisionLog,
        });
      } else {
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
          routingDecision: finalRoutingDecisionLog,
        });
      }

      if (recorderEnabled && inboundBody) {
        const upstreamForProxy = prepareUpstreamForProxy(upstreamForLogging);
        const outboundHeaders = injectAuthHeader(
          filterHeaders(new Headers(request.headers)),
          upstreamForProxy
        );
        const responseText = bodyBytes.length > 0 ? new TextDecoder().decode(bodyBytes) : null;
        let responseJson: unknown | null = null;
        if (responseText) {
          try {
            responseJson = JSON.parse(responseText);
          } catch {
            responseJson = null;
          }
        }

        const fixture: TrafficRecordFixture = {
          meta: {
            requestId,
            createdAt: new Date().toISOString(),
            provider: upstreamForLogging.provider,
            route: path,
            model: resolvedModel,
            durationMs,
          },
          inbound: {
            method: request.method,
            path,
            headers: redactHeaders(request.headers),
            bodyText: inboundBody.text,
            bodyJson: inboundBody.json,
          },
          outbound: {
            upstream: {
              id: upstreamForLogging.id,
              name: upstreamForLogging.name,
              provider: upstreamForLogging.provider,
              baseUrl: upstreamForProxy.baseUrl,
            },
            request: {
              method: request.method,
              path,
              headers: redactHeaders(outboundHeaders),
              bodyText: inboundBody.text,
              bodyJson: inboundBody.json,
            },
            response: {
              status: result.statusCode,
              headers: redactHeaders(result.headers),
              bodyText: responseText,
              bodyJson: responseJson,
            },
          },
        };

        void recordTrafficFixture(fixture).catch((error) =>
          console.error("Failed to record fixture:", error)
        );
      }

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
    if (requestLogId) {
      await updateRequestLog(requestLogId, {
        upstreamId: logUpstreamId,
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
        routingDecision: initialRoutingDecisionLog,
      });
    } else {
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
        routingDecision: initialRoutingDecisionLog,
      });
    }

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
