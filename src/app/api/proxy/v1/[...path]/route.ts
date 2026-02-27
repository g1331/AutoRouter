import { NextRequest, NextResponse } from "next/server";
import { extractApiKey, getKeyPrefix, verifyApiKey } from "@/lib/utils/auth";
import { db, apiKeys, apiKeyUpstreams, upstreams, type Upstream } from "@/lib/db";
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
  selectFromUpstreamCandidates,
  recordConnection,
  releaseConnection,
  NoHealthyUpstreamsError,
  NoAuthorizedUpstreamsError,
} from "@/lib/services/load-balancer";
import { markHealthy, markUnhealthy } from "@/lib/services/health-checker";
import {
  recordSuccess,
  recordFailure,
  CircuitBreakerOpenError,
} from "@/lib/services/circuit-breaker";
import { randomUUID } from "crypto";
import {
  type CapabilityProvider,
  getPrimaryProviderByCapabilities,
  getProviderByRouteCapability,
  resolveRouteCapabilities,
  type RouteCapability,
  type RouteMatchSource,
} from "@/lib/route-capabilities";
import { matchRouteCapability } from "@/lib/services/route-capability-matcher";
import { ensureRouteCapabilityMigration } from "@/lib/services/route-capability-migration";
import {
  type FailoverConfig,
  DEFAULT_FAILOVER_CONFIG,
  shouldTriggerFailover,
  shouldContinueFailover,
} from "@/lib/services/failover-config";
import {
  createUnifiedErrorBody,
  createUnifiedErrorResponse,
  createSSEErrorEvent,
  getHttpStatusForError,
  type UnifiedErrorCode,
  type UnifiedErrorReason,
} from "@/lib/services/unified-error";
import type {
  RoutingDecisionLog,
  RoutingCandidate,
  RoutingExcluded,
  RoutingFailureStage,
} from "@/types/api";
import {
  shouldRecordFixture,
  readRequestBody,
  readStreamChunks,
  teeStreamForRecording,
  buildFixture,
  recordTrafficFixture,
} from "@/lib/services/traffic-recorder";
import {
  extractSessionId,
  affinityStore,
  type AffinityUsage,
} from "@/lib/services/session-affinity";
import { buildCompensations } from "@/lib/services/compensation-service";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("proxy-route");

// Edge runtime for streaming support
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

/**
 * Transform ModelRouterResult to RoutingDecisionLog for storage.
 */
interface RoutingDecisionDiagnostics {
  candidateUpstreamId?: string | null;
  actualUpstreamId?: string | null;
  didSendUpstream?: boolean;
  failureStage?: RoutingFailureStage | null;
}

function transformPathRoutingDecisionLog(
  input: {
    matchedRouteCapability: RouteCapability;
    routeMatchSource: RouteMatchSource;
    model: string | null;
    capabilityCandidates: Upstream[];
    finalCandidates: Upstream[];
    excludedCandidates: Array<{ upstream: Upstream; reason: "unhealthy" | "circuit_open" }>;
  },
  selectedUpstreamId: string | null,
  diagnostics?: RoutingDecisionDiagnostics
): RoutingDecisionLog {
  const candidates: RoutingCandidate[] = input.capabilityCandidates.map((upstream) => ({
    id: upstream.id,
    name: upstream.name,
    weight: upstream.weight,
    circuit_state: "closed",
  }));

  const excluded: RoutingExcluded[] = input.excludedCandidates.map(({ upstream, reason }) => ({
    id: upstream.id,
    name: upstream.name,
    reason,
  }));

  return {
    original_model: input.model ?? "(path-based)",
    resolved_model: input.model ?? "(path-based)",
    model_redirect_applied: false,
    provider_type: getProviderByRouteCapability(input.matchedRouteCapability),
    routing_type: "path_capability",
    matched_route_capability: input.matchedRouteCapability,
    route_match_source: input.routeMatchSource,
    capability_candidates_count: input.capabilityCandidates.length,
    candidates,
    excluded,
    candidate_count: input.capabilityCandidates.length,
    final_candidate_count: input.finalCandidates.length,
    selected_upstream_id: selectedUpstreamId,
    candidate_upstream_id: diagnostics?.candidateUpstreamId ?? selectedUpstreamId,
    actual_upstream_id: diagnostics?.actualUpstreamId ?? null,
    ...(typeof diagnostics?.didSendUpstream === "boolean"
      ? { did_send_upstream: diagnostics.didSendUpstream }
      : {}),
    ...(diagnostics?.failureStage !== undefined ? { failure_stage: diagnostics.failureStage } : {}),
    selection_strategy: "weighted",
  };
}

/**
 * Routing decision information for logging.
 */
interface RoutingDecision {
  routingType: "tiered";
  priorityTier: number | null;
  resolvedModel: string | null;
  failoverAttempts: number;
  failoverHistory: FailoverAttempt[];
}

interface FailoverErrorWithHistory extends Error {
  failoverHistory?: FailoverAttempt[];
  didSendUpstream?: boolean;
}

function attachFailoverContext<T extends Error>(
  error: T,
  failoverHistory: FailoverAttempt[],
  didSendUpstream: boolean
): T & FailoverErrorWithHistory {
  const enrichedError = error as T & FailoverErrorWithHistory;
  enrichedError.failoverHistory = [...failoverHistory];
  enrichedError.didSendUpstream = didSendUpstream;
  return enrichedError;
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

function isNoAuthorizedUpstreamsError(error: unknown): boolean {
  if (error instanceof NoAuthorizedUpstreamsError) {
    return true;
  }
  if (!(error instanceof NoHealthyUpstreamsError)) {
    return false;
  }
  return error.message.toLowerCase().includes("no authorized upstreams");
}

function isDownstreamStreamingError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  const hasStreamToken = /\bstream(?:ing)?\b/.test(message);
  const hasDownstreamContext =
    message.includes("downstream") || message.includes("client") || message.includes("sse");
  return hasStreamToken && hasDownstreamContext;
}

function resolveFailureStage(
  error: unknown,
  didSendUpstream: boolean,
  lastFailoverAttempt: FailoverAttempt | undefined
): RoutingFailureStage {
  if (isNoAuthorizedUpstreamsError(error)) {
    return "auth_filter";
  }
  if (isDownstreamStreamingError(error)) {
    return "downstream_streaming";
  }
  if (!didSendUpstream) {
    return "candidate_selection";
  }
  if (lastFailoverAttempt?.status_code != null) {
    return "upstream_response";
  }
  return "upstream_request";
}

function resolveFailureReason(
  error: unknown,
  didSendUpstream: boolean,
  lastFailoverAttempt: FailoverAttempt | undefined
): UnifiedErrorReason {
  if (isNoAuthorizedUpstreamsError(error)) {
    return "NO_AUTHORIZED_UPSTREAMS";
  }
  if (error instanceof ClientDisconnectedError) {
    return "CLIENT_DISCONNECTED";
  }
  if (!didSendUpstream) {
    return "NO_HEALTHY_CANDIDATES";
  }
  if (lastFailoverAttempt?.status_code != null) {
    return "UPSTREAM_HTTP_ERROR";
  }
  return "UPSTREAM_NETWORK_ERROR";
}

function getUserHint(
  errorCode: UnifiedErrorCode,
  reason: UnifiedErrorReason,
  routeCapability: RouteCapability
): string {
  if (errorCode === "NO_AUTHORIZED_UPSTREAMS") {
    const capabilityLabel: Record<RouteCapability, string> = {
      anthropic_messages: "Anthropic Messages",
      codex_responses: "Codex Responses",
      openai_chat_compatible: "OpenAI Chat Completions",
      openai_extended: "OpenAI Extended APIs",
      gemini_native_generate: "Gemini Native Generate",
      gemini_code_assist_internal: "Gemini Code Assist Internal",
    };
    return `当前密钥没有可用的 ${capabilityLabel[routeCapability]} 上游授权，请在密钥配置中绑定至少一个启用上游`;
  }
  if (reason === "NO_HEALTHY_CANDIDATES") {
    return "当前没有可用上游候选，请检查上游启用状态、熔断状态与路径能力配置";
  }
  if (reason === "UPSTREAM_HTTP_ERROR" || reason === "UPSTREAM_NETWORK_ERROR") {
    return "请求已尝试发送到上游，请检查上游服务状态或稍后重试";
  }
  if (reason === "CLIENT_DISCONNECTED") {
    return "调用方连接已中断，请检查客户端超时配置、网络链路或重试策略";
  }
  return "请稍后重试，或联系管理员检查上游配置与健康状态";
}

function resolveUpstreamProvider(
  upstream: Pick<Upstream, "routeCapabilities"> | null | undefined,
  routeCapability: RouteCapability
): CapabilityProvider {
  return (
    (upstream ? getPrimaryProviderByCapabilities(upstream.routeCapabilities) : null) ??
    getProviderByRouteCapability(routeCapability)
  );
}

const MAX_FAILOVER_ERROR_BODY_BYTES = 256 * 1024;
const FAILOVER_STREAM_CAPTURE_TIMEOUT_MS = 200;

async function captureFailedResponse(result: ProxyResult): Promise<{
  headers: Record<string, string>;
  bodyText: string | null;
  bodyJson: unknown | null;
}> {
  const headers = Object.fromEntries(result.headers.entries());

  if (result.isStream) {
    const reader = (result.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let bodyText: string | null = null;

    try {
      const timedRead = await Promise.race([
        reader.read().then((value) => ({ type: "read" as const, value })),
        new Promise<{ type: "timeout" }>((resolve) =>
          setTimeout(() => resolve({ type: "timeout" }), FAILOVER_STREAM_CAPTURE_TIMEOUT_MS)
        ),
      ]);

      if (timedRead.type === "timeout") {
        void reader.cancel("failover_stream_capture_timeout").catch(() => undefined);
        return { headers, bodyText: null, bodyJson: null };
      }

      const chunkText =
        !timedRead.value.done && timedRead.value.value ? decoder.decode(timedRead.value.value) : "";
      if (!chunkText) {
        return { headers, bodyText: null, bodyJson: null };
      }

      bodyText =
        chunkText.length > MAX_FAILOVER_ERROR_BODY_BYTES
          ? `${chunkText.slice(0, MAX_FAILOVER_ERROR_BODY_BYTES)}...[TRUNCATED]`
          : chunkText;
    } finally {
      reader.releaseLock();
    }

    if (!bodyText) {
      return { headers, bodyText: null, bodyJson: null };
    }

    try {
      return { headers, bodyText, bodyJson: JSON.parse(bodyText) };
    } catch {
      return { headers, bodyText, bodyJson: null };
    }
  }

  const bytes = result.body as Uint8Array;
  const limitedBytes =
    bytes.byteLength > MAX_FAILOVER_ERROR_BODY_BYTES
      ? bytes.slice(0, MAX_FAILOVER_ERROR_BODY_BYTES)
      : bytes;
  const decoded = limitedBytes.byteLength > 0 ? new TextDecoder().decode(limitedBytes) : null;
  const bodyText =
    bytes.byteLength > MAX_FAILOVER_ERROR_BODY_BYTES && decoded
      ? `${decoded}...[TRUNCATED]`
      : decoded;

  if (!bodyText) {
    return { headers, bodyText: null, bodyJson: null };
  }

  try {
    return { headers, bodyText, bodyJson: JSON.parse(bodyText) };
  } catch {
    return { headers, bodyText, bodyJson: null };
  }
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
 * - Session affinity support for prompt cache optimization
 */
async function forwardWithFailover(
  request: NextRequest,
  routeCapability: RouteCapability,
  path: string,
  requestId: string,
  candidateUpstreamIds: string[],
  affinityContext: {
    apiKeyId: string;
    sessionId: string | null;
    contentLength: number;
  } | null,
  compensationHeaders: import("@/lib/services/proxy-client").CompensationHeader[],
  config: FailoverConfig = DEFAULT_FAILOVER_CONFIG
): Promise<{
  result: ProxyResult;
  selectedUpstream: Upstream;
  failedUpstreamIds: string[];
  failoverHistory: FailoverAttempt[];
  affinityHit: boolean;
  affinityMigrated: boolean;
}> {
  const failedUpstreamIds: string[] = [];
  const failoverHistory: FailoverAttempt[] = [];
  let lastError: Error | null = null;
  let didSendUpstream = false;
  let affinityHit = false;
  let affinityMigrated = false;

  // Clone the request body once for potential retries
  const requestClone = request.clone();
  const requestBodyBuffer = await requestClone.arrayBuffer();

  // Loop until we succeed, exhaust all upstreams, or hit max attempts
  let attemptCount = 0;
  while (true) {
    // Check if downstream client has disconnected
    if (request.signal.aborted) {
      log.warn({ requestId }, "client disconnected during failover, stopping retries");
      throw attachFailoverContext(
        new ClientDisconnectedError("Client disconnected during failover"),
        failoverHistory,
        didSendUpstream
      );
    }

    let selectedUpstream: Upstream | null = null;
    let hasMoreUpstreams = true;

    try {
      // Select an upstream using provider type, excluding previously failed ones
      // and filtering by allowed upstream IDs (API key authorization)
      // Pass session affinity context if available
      const excludeIds = failedUpstreamIds.length > 0 ? failedUpstreamIds : undefined;
      const affinitySelectionContext = affinityContext?.sessionId
        ? {
            apiKeyId: affinityContext.apiKeyId,
            sessionId: affinityContext.sessionId,
            contentLength: affinityContext.contentLength,
            affinityScope: routeCapability,
          }
        : undefined;
      const selection = await selectFromUpstreamCandidates(
        candidateUpstreamIds,
        excludeIds,
        affinitySelectionContext
      );

      selectedUpstream = selection.upstream;
      // Capture affinity info from first successful selection
      if (failedUpstreamIds.length === 0) {
        affinityHit = selection.affinityHit ?? false;
        affinityMigrated = selection.affinityMigrated ?? false;
      }
    } catch (error) {
      if (isNoAuthorizedUpstreamsError(error)) {
        throw attachFailoverContext(
          error instanceof Error ? error : new Error(String(error)),
          failoverHistory,
          didSendUpstream
        );
      }
      if (error instanceof NoHealthyUpstreamsError) {
        hasMoreUpstreams = false;
      } else {
        throw attachFailoverContext(
          error instanceof Error ? error : new Error(String(error)),
          failoverHistory,
          didSendUpstream
        );
      }
    }

    // Check if we should continue trying
    if (!shouldContinueFailover(attemptCount, hasMoreUpstreams, config, request.signal.aborted)) {
      // No more upstreams or hit max attempts - throw NoHealthyUpstreamsError
      // to indicate all failover attempts have been exhausted
      const exhaustedError = new NoHealthyUpstreamsError(
        lastError?.message ?? "All upstreams exhausted"
      );
      throw attachFailoverContext(exhaustedError, failoverHistory, didSendUpstream);
    }

    if (!selectedUpstream) {
      throw attachFailoverContext(
        new NoHealthyUpstreamsError("No upstream available"),
        failoverHistory,
        didSendUpstream
      );
    }

    attemptCount++;

    // Track connection for least-connections strategy
    recordConnection(selectedUpstream.id);
    let attemptUpstreamBaseUrl = selectedUpstream.baseUrl;

    try {
      // Create a new request with the buffered body
      const proxyRequest = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: requestBodyBuffer.byteLength > 0 ? requestBodyBuffer : undefined,
      });

      const upstreamForProxy = prepareUpstreamForProxy(selectedUpstream);
      attemptUpstreamBaseUrl = upstreamForProxy.baseUrl;
      didSendUpstream = true;
      const result = await forwardRequest(
        proxyRequest,
        upstreamForProxy,
        path,
        requestId,
        compensationHeaders
      );

      // Check if response indicates we should failover
      if (shouldTriggerFailover(result.statusCode, config)) {
        const failedResponse = await captureFailedResponse(result);
        // Release connection and mark as unhealthy
        releaseConnection(selectedUpstream.id);
        void markUnhealthy(selectedUpstream.id, `HTTP ${result.statusCode} error`);
        // Record failure in circuit breaker
        void recordFailure(selectedUpstream.id, `http_${result.statusCode}`);
        // Record failover attempt
        failoverHistory.push({
          upstream_id: selectedUpstream.id,
          upstream_name: selectedUpstream.name,
          upstream_provider_type: resolveUpstreamProvider(selectedUpstream, routeCapability),
          upstream_base_url: attemptUpstreamBaseUrl,
          attempted_at: new Date().toISOString(),
          error_type: getErrorType(null, result.statusCode),
          error_message: `HTTP ${result.statusCode} error`,
          status_code: result.statusCode,
          response_headers: failedResponse.headers,
          response_body_text: failedResponse.bodyText,
          response_body_json: failedResponse.bodyJson,
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
          affinityHit,
          affinityMigrated,
        };
      }

      return {
        result,
        selectedUpstream,
        failedUpstreamIds,
        failoverHistory,
        affinityHit,
        affinityMigrated,
      };
    } catch (error) {
      // Release connection on error
      releaseConnection(selectedUpstream.id);

      // Check if client disconnected
      if (request.signal.aborted) {
        log.warn({ requestId }, "client disconnected during request, stopping");
        throw attachFailoverContext(
          new ClientDisconnectedError("Client disconnected during request"),
          failoverHistory,
          didSendUpstream
        );
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
          upstream_provider_type: resolveUpstreamProvider(selectedUpstream, routeCapability),
          upstream_base_url: attemptUpstreamBaseUrl,
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
      const nonFailoverError = (error instanceof Error ? error : new Error(String(error))) as
        | Error
        | FailoverErrorWithHistory;
      throw attachFailoverContext(nonFailoverError, failoverHistory, didSendUpstream);
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
  let streamCompleted = false;
  let disconnectWarnLogged = false;
  let connectionReleased = false;
  const encoder = new TextEncoder();

  const releaseConnectionOnce = () => {
    if (!connectionReleased) {
      releaseConnection(upstreamId);
      connectionReleased = true;
    }
  };

  const warnDownstreamDisconnect = (message: string) => {
    if (!disconnectWarnLogged) {
      log.warn({ upstreamId }, message);
      disconnectWarnLogged = true;
    }
  };

  return new ReadableStream({
    async start(controller) {
      reader = stream.getReader();

      // Set up abort listener if signal provided
      const abortHandler = () => {
        if (streamCompleted) {
          return;
        }
        warnDownstreamDisconnect(
          "client disconnected before stream completion, cancelling upstream stream"
        );
        void reader?.cancel("Client disconnected").catch(() => undefined);
        releaseConnectionOnce();
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
            warnDownstreamDisconnect(
              "client already disconnected before stream completion, stopping stream"
            );
            break;
          }

          const { done, value } = await reader.read();
          if (done) {
            streamCompleted = true;
            break;
          }
          controller.enqueue(value);
        }
        controller.close();
        releaseConnectionOnce();
        if (streamCompleted) {
          // Stream completed successfully - mark healthy and record circuit breaker success.
          void markHealthy(upstreamId, 100);
          void recordSuccess(upstreamId);
        }
      } catch (error) {
        // Check if this is due to client disconnect
        if (abortSignal?.aborted) {
          warnDownstreamDisconnect(
            "stream read interrupted by client disconnect before completion"
          );
          releaseConnectionOnce();
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
        releaseConnectionOnce();
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
      releaseConnectionOnce();
    },
  });
}

/**
 * Compute total input tokens for affinity tracking, avoiding double-count.
 *
 * OpenAI: promptTokens already includes cached tokens (subset of prompt_tokens).
 * Anthropic: when input_tokens > 0, total = input_tokens + cache tokens;
 * when input_tokens === 0 (fallback), promptTokens already equals cache tokens.
 * Use rawInputTokens to distinguish these cases precisely.
 */
function computeAffinityTokens(
  routeCapability: RouteCapability,
  usage: {
    promptTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    rawInputTokens?: number;
  }
): number {
  const prompt = usage.promptTokens || 0;

  if (routeCapability !== "anthropic_messages") {
    return prompt;
  }

  const rawInput = usage.rawInputTokens ?? 0;
  const cacheRead = usage.cacheReadTokens || 0;
  const cacheCreation = usage.cacheCreationTokens || 0;

  // rawInputTokens > 0: promptTokens is the raw input_tokens (excludes cache), add cache separately
  // rawInputTokens === 0: promptTokens was already set to cacheRead + cacheCreation by fallback
  if (rawInput > 0) {
    return rawInput + cacheRead + cacheCreation;
  }

  return prompt;
}

/**
 * Request context extracted from incoming request
 */
interface RequestContext {
  model: string | null;
  sessionId: string | null;
  bodyJson: Record<string, unknown> | null;
}

/**
 * Extract request context (model, sessionId) from request body and headers.
 * Single-pass extraction to avoid parsing body multiple times.
 */
async function extractRequestContext(request: NextRequest): Promise<RequestContext> {
  try {
    const clonedRequest = request.clone();
    const bodyText = await clonedRequest.text();

    if (!bodyText) {
      return { model: null, sessionId: null, bodyJson: null };
    }

    const bodyJson = JSON.parse(bodyText) as Record<string, unknown>;
    const model = typeof bodyJson.model === "string" ? bodyJson.model || null : null;

    return { model, sessionId: null, bodyJson };
  } catch {
    // Not JSON or empty body
    return { model: null, sessionId: null, bodyJson: null };
  }
}

/**
 * Handle all HTTP methods for proxy
 */
async function handleProxy(request: NextRequest, context: RouteContext): Promise<Response> {
  const requestId = randomUUID().slice(0, 8);
  const startTime = Date.now();
  let routingDurationMs: number | null = null;

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

  // Recorder setup
  const shouldRecordSuccess = shouldRecordFixture("success");
  const shouldRecordFailure = shouldRecordFixture("failure");
  const recorderEnabled = shouldRecordSuccess || shouldRecordFailure;
  const inboundBody = recorderEnabled ? await readRequestBody(request) : null;

  // Routing type is always "tiered" for priority-based routing
  const routingType = "tiered" as const;

  await ensureRouteCapabilityMigration();

  // Extract model from request body. For path-based routing, model may be absent.
  const tempContext = await extractRequestContext(request);
  const model = tempContext.model;
  const bodyJson: Record<string, unknown> | null = tempContext.bodyJson;
  const matchedRouteCapability = matchRouteCapability(request.method, path);

  if (!matchedRouteCapability) {
    log.warn(
      { requestId, method: request.method, path, matchedRouteCapability: null },
      "path capability not matched, skipping upstream routing"
    );
    return createUnifiedErrorResponse("NO_UPSTREAMS_CONFIGURED", {
      reason: "NO_HEALTHY_CANDIDATES",
      did_send_upstream: false,
      request_id: requestId,
      user_hint: "当前请求路径未匹配到受支持的能力类型，请检查请求方法和路径是否在支持列表中",
    });
  }

  // Get API key's authorized upstream IDs
  const upstreamPermissions = await db.query.apiKeyUpstreams.findMany({
    where: eq(apiKeyUpstreams.apiKeyId, validApiKey.id),
  });
  const allowedUpstreamIds = Array.isArray(upstreamPermissions)
    ? upstreamPermissions.map((p) => p.upstreamId)
    : [];
  const allowedUpstreamIdSet = new Set(allowedUpstreamIds);

  // Route context
  let priorityTier: number | null = null;
  const resolvedModel: string | null = model;
  const routeMatchSource: RouteMatchSource = "path";
  let candidateUpstreamIds: string[] = [];
  let capabilityCandidates: Upstream[] = [];
  let finalCapabilityCandidates: Upstream[] = [];
  let excludedCapabilityCandidates: Array<{
    upstream: Upstream;
    reason: "unhealthy" | "circuit_open";
  }> = [];
  let sessionId: string | null = null;
  let sessionIdSource: "header" | "body" | null = null;
  const activeUpstreams = await db.query.upstreams.findMany({
    where: eq(upstreams.isActive, true),
  });

  capabilityCandidates = activeUpstreams.filter((upstream) =>
    resolveRouteCapabilities(upstream.routeCapabilities).includes(matchedRouteCapability)
  );

  if (capabilityCandidates.length === 0) {
    log.warn(
      {
        requestId,
        path,
        matchedRouteCapability,
        activeUpstreamCount: activeUpstreams.length,
        capabilityCandidatesCount: capabilityCandidates.length,
      },
      "no upstream supports matched route capability"
    );
    return createUnifiedErrorResponse("NO_UPSTREAMS_CONFIGURED", {
      reason: "NO_HEALTHY_CANDIDATES",
      did_send_upstream: false,
      request_id: requestId,
      user_hint: `未找到支持路径能力 ${matchedRouteCapability} 的上游，请先检查上游能力配置`,
    });
  }

  const authorizedCapabilityCandidates = capabilityCandidates.filter((upstream) =>
    allowedUpstreamIdSet.has(upstream.id)
  );

  if (authorizedCapabilityCandidates.length === 0) {
    log.warn(
      {
        requestId,
        path,
        matchedRouteCapability,
        capabilityCandidatesCount: capabilityCandidates.length,
        authorizedCapabilityCandidatesCount: authorizedCapabilityCandidates.length,
        allowedUpstreamCount: allowedUpstreamIds.length,
      },
      "no authorized upstream for matched route capability"
    );
    return createUnifiedErrorResponse("NO_AUTHORIZED_UPSTREAMS", {
      reason: "NO_AUTHORIZED_UPSTREAMS",
      did_send_upstream: false,
      request_id: requestId,
      user_hint: "当前密钥没有可用的路径能力授权，请在密钥配置中绑定对应上游",
    });
  }

  finalCapabilityCandidates = authorizedCapabilityCandidates;
  excludedCapabilityCandidates = [];

  const selectedCandidate = finalCapabilityCandidates[0];
  candidateUpstreamIds = finalCapabilityCandidates.map((upstream) => upstream.id);

  log.debug(
    {
      requestId,
      path,
      matchedRouteCapability,
      candidateCount: capabilityCandidates.length,
      authorizedCount: authorizedCapabilityCandidates.length,
      selectableCount: finalCapabilityCandidates.length,
    },
    "path-based capability routing decision"
  );

  // Extract session ID after routing context is known
  if (bodyJson) {
    const sessionIdResult = extractSessionId(
      matchedRouteCapability,
      Object.fromEntries(request.headers.entries()),
      bodyJson
    );
    sessionId = sessionIdResult.sessionId;
    sessionIdSource = sessionIdResult.source;
    if (sessionId) {
      log.debug(
        { requestId, matchedRouteCapability, sessionId, sessionIdSource },
        "session affinity: extracted sessionId"
      );
    }
  }

  // Track failover history outside try block for error logging
  let failoverHistory: FailoverAttempt[] = [];
  let requestLogId: string | null = null;
  let isAffinityHit = false;
  let isAffinityMigrated = false;

  // Build initial routing decision log (will be updated with final upstream after selection)
  const initialRoutingDecisionLog = transformPathRoutingDecisionLog(
    {
      matchedRouteCapability,
      routeMatchSource,
      model,
      capabilityCandidates,
      finalCandidates: finalCapabilityCandidates,
      excludedCandidates: excludedCapabilityCandidates,
    },
    selectedCandidate?.id ?? null,
    {
      candidateUpstreamId: selectedCandidate?.id ?? null,
      actualUpstreamId: null,
      didSendUpstream: false,
      failureStage: null,
    }
  );

  // Create an in-progress log entry so the admin UI can show active requests.
  // Never fail the proxy request if logging fails.
  try {
    const startLog = await logRequestStart({
      apiKeyId: validApiKey.id,
      upstreamId: null,
      method: request.method,
      path,
      model: resolvedModel,
      routingType,
      priorityTier: null,
      routingDecision: initialRoutingDecisionLog,
      sessionId,
    });
    requestLogId = startLog.id;
  } catch (e) {
    log.error({ err: e, requestId }, "failed to create in-progress request log");
  }

  // Forward request to upstream
  try {
    // Prepare affinity context if session ID is available
    const contentLength = parseInt(request.headers.get("content-length") ?? "", 10) || 0;
    const affinityContext = sessionId
      ? {
          apiKeyId: validApiKey.id,
          sessionId,
          contentLength,
        }
      : null;

    // Capture routing decision time (before actual upstream request begins)
    routingDurationMs = Date.now() - startTime;

    // Build outbound header compensations based on current capability and request
    const inboundHeaders = Object.fromEntries(request.headers.entries());
    const compensationHeaders = await buildCompensations(
      matchedRouteCapability,
      inboundHeaders,
      bodyJson
    );

    const {
      result: proxyResult,
      selectedUpstream: selected,
      failoverHistory: history,
      affinityHit: afHit,
      affinityMigrated: afMigrated,
    } = await forwardWithFailover(
      request,
      matchedRouteCapability,
      path,
      requestId,
      candidateUpstreamIds,
      affinityContext,
      compensationHeaders
    );
    const result: ProxyResult = proxyResult;
    const upstreamForLogging: Upstream = selected;
    failoverHistory = history;
    isAffinityHit = afHit;
    isAffinityMigrated = afMigrated;
    priorityTier = selected.priority;
    const headerDiff = result.headerDiff ?? {
      inbound_count: 0,
      outbound_count: 0,
      dropped: [],
      auth_replaced: null,
      compensated: [],
      unchanged: [],
    };
    const sessionIdCompensated = headerDiff.compensated.some((c) => c.header === "session_id");

    // Build routing decision for logging
    const routingDecision: RoutingDecision = {
      routingType,
      priorityTier,
      resolvedModel,
      failoverAttempts: failoverHistory.length,
      failoverHistory,
    };

    // Build final routing decision log with actual selected upstream
    const finalRoutingDecisionLog = transformPathRoutingDecisionLog(
      {
        matchedRouteCapability,
        routeMatchSource,
        model,
        capabilityCandidates,
        finalCandidates: finalCapabilityCandidates,
        excludedCandidates: excludedCapabilityCandidates,
      },
      upstreamForLogging.id,
      {
        candidateUpstreamId: upstreamForLogging.id,
        actualUpstreamId: upstreamForLogging.id,
        didSendUpstream: true,
        failureStage: null,
      }
    );

    // Update the in-progress log with the actual upstream
    if (requestLogId) {
      void updateRequestLog(requestLogId, {
        upstreamId: upstreamForLogging.id,
        routingDecision: finalRoutingDecisionLog,
      }).catch((e) => log.error({ err: e, requestId }, "failed to update request log upstream"));
    }

    // Create response headers
    const responseHeaders = new Headers(result.headers);

    if (result.isStream) {
      // Streaming response
      const originalStream = result.body as ReadableStream<Uint8Array>;
      let recordingStream: ReadableStream<Uint8Array> | null = null;
      let responseStream = originalStream;

      if (shouldRecordSuccess && inboundBody) {
        const [clientStream, recordStream] = teeStreamForRecording(originalStream);
        recordingStream = recordStream;
        responseStream = clientStream;
      }
      const metricsPromise =
        result.streamMetricsPromise ??
        Promise.resolve({ usage: result.usage ?? null, ttftMs: result.ttftMs });

      void metricsPromise
        .then(({ usage, ttftMs }) => {
          // Update session affinity cumulative tokens if we have a session
          if (affinityContext?.sessionId && usage) {
            const affinityUsage: AffinityUsage = {
              totalInputTokens: computeAffinityTokens(matchedRouteCapability, usage),
            };
            affinityStore.updateCumulativeTokens(
              affinityContext.apiKeyId,
              matchedRouteCapability,
              affinityContext.sessionId,
              affinityUsage
            );
            log.debug(
              {
                requestId,
                sessionId: affinityContext.sessionId,
                upstreamId: upstreamForLogging.id,
                tokens: affinityUsage,
              },
              "session affinity: updated cumulative tokens"
            );
          }

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
              routingDurationMs,
              errorMessage: null,
              routingType: routingDecision.routingType,
              priorityTier: routingDecision.priorityTier,
              failoverAttempts: routingDecision.failoverAttempts,
              failoverHistory:
                routingDecision.failoverHistory.length > 0 ? routingDecision.failoverHistory : null,
              routingDecision: finalRoutingDecisionLog,
              affinityHit: isAffinityHit,
              affinityMigrated: isAffinityMigrated,
              ttftMs: ttftMs ?? null,
              isStream: true,
              sessionIdCompensated,
              headerDiff,
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
            routingDurationMs,
            routingType: routingDecision.routingType,
            priorityTier: routingDecision.priorityTier,
            failoverAttempts: routingDecision.failoverAttempts,
            failoverHistory:
              routingDecision.failoverHistory.length > 0 ? routingDecision.failoverHistory : null,
            routingDecision: finalRoutingDecisionLog,
            sessionId,
            affinityHit: isAffinityHit,
            affinityMigrated: isAffinityMigrated,
            ttftMs: ttftMs ?? null,
            isStream: true,
            sessionIdCompensated,
            headerDiff,
          });
        })
        .catch((e) => log.error({ err: e, requestId }, "failed to log request"));

      // Set streaming headers
      responseHeaders.set("Content-Type", "text/event-stream");
      responseHeaders.set("Cache-Control", "no-cache");
      responseHeaders.set("Connection", "keep-alive");

      if (shouldRecordSuccess && inboundBody && recordingStream) {
        const upstreamForProxy = prepareUpstreamForProxy(upstreamForLogging);
        const outboundHeaders = injectAuthHeader(
          filterHeaders(new Headers(request.headers)).filtered,
          upstreamForProxy
        );
        void readStreamChunks(recordingStream)
          .then((chunks) => {
            const fixture = buildFixture({
              requestId,
              startTime,
              providerType: resolveUpstreamProvider(upstreamForLogging, matchedRouteCapability),
              route: path,
              model: resolvedModel,
              inboundRequest: {
                method: request.method,
                path,
                headers: request.headers,
                bodyText: inboundBody.text,
                bodyJson: inboundBody.json,
              },
              upstream: {
                id: upstreamForLogging.id,
                name: upstreamForLogging.name,
                providerType: resolveUpstreamProvider(upstreamForLogging, matchedRouteCapability),
                baseUrl: upstreamForProxy.baseUrl,
              },
              outboundHeaders,
              response: {
                statusCode: result.statusCode,
                headers: result.headers,
                streamChunks: chunks,
              },
              outboundRequestSent: true,
              outboundResponseSource: "upstream",
            });
            return recordTrafficFixture(fixture);
          })
          .catch((error) =>
            log.error({ err: error, requestId }, "failed to record stream fixture")
          );
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

      // Update session affinity cumulative tokens if we have a session
      if (affinityContext?.sessionId && usage) {
        const affinityUsage: AffinityUsage = {
          totalInputTokens: computeAffinityTokens(matchedRouteCapability, usage),
        };
        affinityStore.updateCumulativeTokens(
          affinityContext.apiKeyId,
          matchedRouteCapability,
          affinityContext.sessionId,
          affinityUsage
        );
        log.debug(
          {
            requestId,
            sessionId: affinityContext.sessionId,
            upstreamId: upstreamForLogging.id,
            tokens: affinityUsage,
          },
          "session affinity: updated cumulative tokens"
        );
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
          routingDurationMs,
          errorMessage: null,
          routingType: routingDecision.routingType,
          priorityTier: routingDecision.priorityTier,
          failoverAttempts: routingDecision.failoverAttempts,
          failoverHistory:
            routingDecision.failoverHistory.length > 0 ? routingDecision.failoverHistory : null,
          routingDecision: finalRoutingDecisionLog,
          affinityHit: isAffinityHit,
          affinityMigrated: isAffinityMigrated,
          isStream: false,
          sessionIdCompensated,
          headerDiff,
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
          routingDurationMs,
          routingType: routingDecision.routingType,
          priorityTier: routingDecision.priorityTier,
          failoverAttempts: routingDecision.failoverAttempts,
          failoverHistory:
            routingDecision.failoverHistory.length > 0 ? routingDecision.failoverHistory : null,
          routingDecision: finalRoutingDecisionLog,
          sessionId,
          affinityHit: isAffinityHit,
          affinityMigrated: isAffinityMigrated,
          isStream: false,
          sessionIdCompensated,
          headerDiff,
        });
      }

      if (shouldRecordSuccess && inboundBody) {
        const upstreamForProxy = prepareUpstreamForProxy(upstreamForLogging);
        const outboundHeaders = injectAuthHeader(
          filterHeaders(new Headers(request.headers)).filtered,
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

        const fixture = buildFixture({
          requestId,
          startTime,
          providerType: resolveUpstreamProvider(upstreamForLogging, matchedRouteCapability),
          route: path,
          model: resolvedModel,
          inboundRequest: {
            method: request.method,
            path,
            headers: request.headers,
            bodyText: inboundBody.text,
            bodyJson: inboundBody.json,
          },
          upstream: {
            id: upstreamForLogging.id,
            name: upstreamForLogging.name,
            providerType: resolveUpstreamProvider(upstreamForLogging, matchedRouteCapability),
            baseUrl: upstreamForProxy.baseUrl,
          },
          outboundHeaders,
          response: {
            statusCode: result.statusCode,
            headers: result.headers,
            bodyText: responseText,
            bodyJson: responseJson,
          },
          outboundRequestSent: true,
          outboundResponseSource: "upstream",
        });

        void recordTrafficFixture(fixture).catch((error) =>
          log.error({ err: error, requestId }, "failed to record fixture")
        );
      }

      return new Response(Buffer.from(bodyBytes), {
        status: result.statusCode,
        headers: responseHeaders,
      });
    }
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "failoverHistory" in error &&
      Array.isArray((error as FailoverErrorWithHistory).failoverHistory)
    ) {
      failoverHistory = (error as FailoverErrorWithHistory).failoverHistory ?? [];
    }

    const durationMs = Date.now() - startTime;
    const lastFailoverAttempt = failoverHistory[failoverHistory.length - 1];
    const didSendUpstream =
      typeof (error as FailoverErrorWithHistory | null)?.didSendUpstream === "boolean"
        ? Boolean((error as FailoverErrorWithHistory).didSendUpstream)
        : failoverHistory.length > 0;

    // Determine error code for unified response
    let errorCode: UnifiedErrorCode = "SERVICE_UNAVAILABLE";
    if (isNoAuthorizedUpstreamsError(error)) {
      errorCode = "NO_AUTHORIZED_UPSTREAMS";
    } else if (
      error instanceof NoHealthyUpstreamsError ||
      error instanceof CircuitBreakerOpenError
    ) {
      errorCode = "ALL_UPSTREAMS_UNAVAILABLE";
    } else if (error instanceof ClientDisconnectedError) {
      errorCode = "CLIENT_DISCONNECTED";
    } else if (error instanceof Error && error.message.includes("timed out")) {
      errorCode = "REQUEST_TIMEOUT";
    }

    const failureStage = resolveFailureStage(error, didSendUpstream, lastFailoverAttempt);
    const failureReason = resolveFailureReason(error, didSendUpstream, lastFailoverAttempt);
    const actualUpstreamId =
      lastFailoverAttempt?.upstream_id ??
      (didSendUpstream ? (selectedCandidate?.id ?? null) : null);
    const candidateUpstreamId = didSendUpstream
      ? (lastFailoverAttempt?.upstream_id ?? selectedCandidate?.id ?? null)
      : null;

    const errorStatusCode = getHttpStatusForError(errorCode);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorDetails = {
      reason: failureReason,
      did_send_upstream: didSendUpstream,
      request_id: requestId,
      user_hint: getUserHint(errorCode, failureReason, matchedRouteCapability),
    } as const;
    const downstreamErrorBody = createUnifiedErrorBody(errorCode, errorDetails);

    const failureRoutingDecisionLog = transformPathRoutingDecisionLog(
      {
        matchedRouteCapability,
        routeMatchSource,
        model,
        capabilityCandidates,
        finalCandidates: finalCapabilityCandidates,
        excludedCandidates: excludedCapabilityCandidates,
      },
      actualUpstreamId,
      {
        candidateUpstreamId,
        actualUpstreamId,
        didSendUpstream,
        failureStage,
      }
    );

    if (shouldRecordFailure && inboundBody) {
      const fallbackOutboundHeaders = filterHeaders(new Headers(request.headers)).filtered;
      const fallbackProviderType =
        selectedCandidate != null
          ? resolveUpstreamProvider(selectedCandidate, matchedRouteCapability)
          : getProviderByRouteCapability(matchedRouteCapability);
      const fallbackUpstream = {
        id: didSendUpstream ? (selectedCandidate?.id ?? "unknown") : "unknown",
        name: didSendUpstream ? (selectedCandidate?.name ?? "unknown") : "not-sent",
        providerType: fallbackProviderType,
        baseUrl: didSendUpstream ? (selectedCandidate?.baseUrl ?? "unknown") : "unknown",
      };
      let outboundHeaders: Headers | Record<string, string> = didSendUpstream
        ? fallbackOutboundHeaders
        : {};
      let upstreamForFixture = fallbackUpstream;

      if (didSendUpstream && lastFailoverAttempt?.upstream_id) {
        const attemptProvider =
          lastFailoverAttempt.upstream_provider_type === "openai" ||
          lastFailoverAttempt.upstream_provider_type === "anthropic" ||
          lastFailoverAttempt.upstream_provider_type === "google"
            ? lastFailoverAttempt.upstream_provider_type
            : fallbackProviderType;
        upstreamForFixture = {
          id: lastFailoverAttempt.upstream_id,
          name: lastFailoverAttempt.upstream_name,
          providerType: attemptProvider,
          baseUrl: lastFailoverAttempt.upstream_base_url ?? selectedCandidate?.baseUrl ?? "unknown",
        };

        try {
          const attemptedUpstream = await db.query.upstreams.findFirst({
            where: eq(upstreams.id, lastFailoverAttempt.upstream_id),
          });
          if (attemptedUpstream) {
            const attemptedUpstreamForProxy = prepareUpstreamForProxy(attemptedUpstream);
            outboundHeaders = injectAuthHeader(fallbackOutboundHeaders, attemptedUpstreamForProxy);
            upstreamForFixture = {
              id: attemptedUpstream.id,
              name: attemptedUpstream.name,
              providerType: resolveUpstreamProvider(attemptedUpstream, matchedRouteCapability),
              baseUrl: attemptedUpstreamForProxy.baseUrl,
            };
          }
        } catch (recorderBuildError) {
          log.warn(
            { err: recorderBuildError, requestId },
            "failed to resolve attempted upstream for failure fixture"
          );
        }
      } else if (didSendUpstream && selectedCandidate) {
        try {
          const upstreamForProxy = prepareUpstreamForProxy(selectedCandidate);
          outboundHeaders = injectAuthHeader(fallbackOutboundHeaders, upstreamForProxy);
          upstreamForFixture = {
            id: selectedCandidate.id,
            name: selectedCandidate.name,
            providerType: resolveUpstreamProvider(selectedCandidate, matchedRouteCapability),
            baseUrl: upstreamForProxy.baseUrl,
          };
        } catch (recorderBuildError) {
          log.warn(
            { err: recorderBuildError, requestId },
            "failed to build upstream auth headers for failure fixture"
          );
        }
      }

      const failureFixture = buildFixture({
        requestId,
        startTime,
        providerType: fallbackProviderType,
        route: path,
        model: resolvedModel,
        inboundRequest: {
          method: request.method,
          path,
          headers: request.headers,
          bodyText: inboundBody.text,
          bodyJson: inboundBody.json,
        },
        upstream: upstreamForFixture,
        outboundHeaders,
        response: {
          statusCode: lastFailoverAttempt?.status_code ?? errorStatusCode,
          headers: lastFailoverAttempt?.response_headers ?? {},
          bodyJson: lastFailoverAttempt?.response_body_json ?? null,
          bodyText:
            lastFailoverAttempt?.response_body_json == null
              ? (lastFailoverAttempt?.response_body_text ?? null)
              : null,
        },
        outboundRequestSent: didSendUpstream,
        outboundResponseSource:
          didSendUpstream && lastFailoverAttempt?.status_code != null ? "upstream" : "gateway",
        downstreamResponse: {
          statusCode: errorStatusCode,
          headers: { "content-type": "application/json" },
          bodyJson: downstreamErrorBody,
        },
        failoverHistory: failoverHistory.length > 0 ? failoverHistory : null,
      });

      void recordTrafficFixture(failureFixture).catch((recordError) =>
        log.error({ err: recordError, requestId }, "failed to record error fixture")
      );
    }

    // Log failed request (internal logging with full details)
    if (requestLogId) {
      await updateRequestLog(requestLogId, {
        upstreamId: actualUpstreamId,
        model: resolvedModel,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        statusCode: errorStatusCode,
        durationMs,
        routingDurationMs,
        errorMessage,
        routingType,
        priorityTier,
        failoverAttempts: failoverHistory.length,
        failoverHistory: failoverHistory.length > 0 ? failoverHistory : null,
        routingDecision: failureRoutingDecisionLog,
      });
    } else {
      await logRequest({
        apiKeyId: validApiKey.id,
        upstreamId: actualUpstreamId,
        method: request.method,
        path,
        model: resolvedModel,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        statusCode: errorStatusCode,
        durationMs,
        routingDurationMs,
        errorMessage,
        routingType,
        priorityTier,
        failoverAttempts: failoverHistory.length,
        failoverHistory: failoverHistory.length > 0 ? failoverHistory : null,
        routingDecision: failureRoutingDecisionLog,
      });
    }

    // Handle client disconnect silently (no response needed)
    if (error instanceof ClientDisconnectedError) {
      log.warn({ requestId }, "client disconnected, no response sent");
      return createUnifiedErrorResponse(errorCode, errorDetails);
    }

    if (errorCode === "SERVICE_UNAVAILABLE") {
      log.error({ err: error, requestId }, "proxy error");
    }
    return createUnifiedErrorResponse(errorCode, errorDetails);
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
