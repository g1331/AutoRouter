import {
  forwardRequest,
  prepareUpstreamForProxy,
  FirstByteTimeoutError,
  StreamIdleTimeoutError,
  UpstreamEmptyResponseError,
  UpstreamNoContentStreamError,
  type CompensationHeader,
  type HeaderDiff,
  type ProxyResult,
} from "@/lib/services/proxy-client";
import {
  selectFromUpstreamCandidates,
  decideQueuedUpstreamResume,
  reselectQueuedUpstreamOnce,
  loadActiveUpstreamSnapshot,
  releaseConnection,
  AllCandidatesConcurrencyFullError,
  NoHealthyUpstreamsError,
  NoAuthorizedUpstreamsError,
  mergeCircuitBlockedCandidates,
  type WaitableUpstreamCandidate,
  type ConcurrencyExcludedCandidate,
  type CircuitBlockedCandidate,
  type UpstreamWithCircuitBreaker,
} from "@/lib/services/load-balancer";
import { markHealthy, markUnhealthy } from "@/lib/services/health-checker";
import {
  recordSuccess,
  recordFailure,
  getEffectiveCircuitBreakerConfig,
  CircuitBreakerOpenError,
} from "@/lib/services/circuit-breaker";
import {
  upstreamQueueAdmission,
  UpstreamQueueWaitTimeoutError,
  UpstreamQueueWaitAbortedError,
} from "@/lib/services/upstream-queue-admission";
import { matchFailureRule, type MatchedFailureRule } from "@/lib/services/upstream-failure-rules";
import {
  type CapabilityProvider,
  getPrimaryProviderByCapabilities,
  getProviderByRouteCapability,
  type RouteCapability,
} from "@/lib/route-capabilities";
import {
  resolveCliproxyAccountPrefix,
  buildCliproxyPrefixedModel,
} from "@/lib/services/cliproxy-upstream-preset";
import {
  type FailoverConfig,
  DEFAULT_FAILOVER_CONFIG,
  shouldTriggerFailover,
  shouldContinueFailover,
} from "@/lib/services/failover-config";
import {
  createSSEErrorEvent,
  getHttpStatusForError,
  type UnifiedErrorCode,
  type UnifiedErrorReason,
} from "@/lib/services/unified-error";
import type { Upstream } from "@/lib/db";
import type {
  FailoverAttempt,
  RoutingExcluded,
  RoutingFailureStage,
  RoutingQueueLog,
  RoutingSelectionReason,
} from "@/types/api";
import { affinityStore } from "@/lib/services/session-affinity";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("proxy-execution");
function buildRetryReason(
  failoverHistory: FailoverAttempt[]
): RoutingSelectionReason["retry_reason"] {
  const previousAttempt =
    failoverHistory.length > 0 ? failoverHistory[failoverHistory.length - 1] : null;

  if (!previousAttempt) {
    return null;
  }

  return {
    previous_upstream_id: previousAttempt.upstream_id ?? null,
    previous_upstream_name: previousAttempt.upstream_name ?? null,
    previous_error_type: previousAttempt.error_type ?? null,
    previous_error_message: previousAttempt.error_message ?? null,
  };
}
function attachRetryReason(
  selectionReason: RoutingSelectionReason | null | undefined,
  failoverHistory: FailoverAttempt[]
): RoutingSelectionReason | null {
  if (!selectionReason) {
    return null;
  }

  const retryReason = buildRetryReason(failoverHistory);
  if (!retryReason) {
    return selectionReason;
  }

  return {
    ...selectionReason,
    retry_reason: retryReason,
  };
}
export interface FailoverErrorWithHistory extends Error {
  failoverHistory?: FailoverAttempt[];
  concurrencyExcludedCandidates?: RoutingExcluded[];
  didSendUpstream?: boolean;
  headerDiff?: HeaderDiff | null;
  queue?: RoutingQueueLog | null;
}

interface FailoverContext {
  failoverHistory: FailoverAttempt[];
  didSendUpstream: boolean;
  concurrencyExcludedCandidates: RoutingExcluded[];
  headerDiff?: HeaderDiff | null;
  queue?: RoutingQueueLog | null;
}

function attachFailoverContext<T extends Error>(
  error: T,
  context: FailoverContext
): T & FailoverErrorWithHistory {
  const enrichedError = error as T & FailoverErrorWithHistory;
  enrichedError.failoverHistory = [...context.failoverHistory];
  enrichedError.concurrencyExcludedCandidates = [...context.concurrencyExcludedCandidates];
  enrichedError.didSendUpstream = context.didSendUpstream;
  enrichedError.headerDiff = context.headerDiff ?? null;
  enrichedError.queue = context.queue ?? enrichedError.queue ?? null;
  return enrichedError;
}

export function withQueueStreamFlag(
  queue: RoutingQueueLog | null | undefined,
  isStream: boolean
): RoutingQueueLog | null {
  if (!queue) {
    return null;
  }

  return {
    ...queue,
    is_stream: isStream,
  };
}

function extractHeaderDiffFromError(error: unknown): HeaderDiff | null {
  if (!error || typeof error !== "object" || !("headerDiff" in error)) {
    return null;
  }
  const candidate = (error as { headerDiff?: unknown }).headerDiff;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  return candidate as HeaderDiff;
}

function isSyntheticFailoverAttempt(attempt: FailoverAttempt): boolean {
  return attempt.error_type === "concurrency_full";
}

const CIRCUIT_BREAKER_NEUTRAL_PATHS = new Set(["messages/count_tokens"]);

function normalizeCircuitBreakerPath(path: string): string {
  const normalized = path.trim().replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();
  return normalized.startsWith("v1/") ? normalized.slice("v1/".length) : normalized;
}

function shouldRecordCircuitBreakerFailure(path: string): boolean {
  const normalizedPath = normalizeCircuitBreakerPath(path);
  return !CIRCUIT_BREAKER_NEUTRAL_PATHS.has(normalizedPath);
}

export function getLastSentFailoverAttempt(
  failoverHistory: FailoverAttempt[]
): FailoverAttempt | undefined {
  for (let index = failoverHistory.length - 1; index >= 0; index -= 1) {
    const attempt = failoverHistory[index];
    if (!isSyntheticFailoverAttempt(attempt)) {
      return attempt;
    }
  }
  return undefined;
}

/**
 * Determine error type for failover logging.
 */
function getErrorType(
  error: Error | null,
  statusCode: number | null
): FailoverAttempt["error_type"] {
  if (error instanceof CircuitBreakerOpenError) return "circuit_open";
  if (error instanceof FirstByteTimeoutError) return "first_byte_timeout";
  if (error instanceof UpstreamEmptyResponseError) return "upstream_empty_response";
  if (error instanceof UpstreamNoContentStreamError) return "upstream_no_content_stream";
  if (error instanceof StreamIdleTimeoutError) return "stream_idle_timeout";
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
  if (
    error instanceof FirstByteTimeoutError ||
    error instanceof StreamIdleTimeoutError ||
    error instanceof UpstreamEmptyResponseError ||
    error instanceof UpstreamNoContentStreamError
  ) {
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

export function isNoAuthorizedUpstreamsError(error: unknown): boolean {
  if (error instanceof NoAuthorizedUpstreamsError) {
    return true;
  }
  if (!(error instanceof NoHealthyUpstreamsError)) {
    return false;
  }
  return error.message.toLowerCase().includes("no authorized upstreams");
}

function isAllCandidatesConcurrencyFullError(error: unknown): boolean {
  if (error instanceof AllCandidatesConcurrencyFullError) {
    return true;
  }
  if (!(error instanceof NoHealthyUpstreamsError)) {
    return false;
  }
  return error.message.toLowerCase().includes("max concurrency");
}

export function isQueueWaitTimeoutError(error: unknown): error is UpstreamQueueWaitTimeoutError {
  return error instanceof UpstreamQueueWaitTimeoutError;
}

export function isQueueWaitAbortedError(error: unknown): error is UpstreamQueueWaitAbortedError {
  return error instanceof UpstreamQueueWaitAbortedError;
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

export function resolveFailureStage(
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
  if (error instanceof ClientDisconnectedError && didSendUpstream) {
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

export function resolveFailureReason(
  error: unknown,
  didSendUpstream: boolean,
  lastFailoverAttempt: FailoverAttempt | undefined
): UnifiedErrorReason {
  if (isNoAuthorizedUpstreamsError(error)) {
    return "NO_AUTHORIZED_UPSTREAMS";
  }
  if (isQueueWaitTimeoutError(error)) {
    return "QUEUE_WAIT_TIMEOUT";
  }
  if (isQueueWaitAbortedError(error)) {
    return "QUEUE_WAIT_ABORTED";
  }
  if (error instanceof ClientDisconnectedError) {
    return "CLIENT_DISCONNECTED";
  }
  if (
    isAllCandidatesConcurrencyFullError(error) ||
    (!didSendUpstream && lastFailoverAttempt?.error_type === "concurrency_full")
  ) {
    return "CONCURRENCY_FULL";
  }
  if (!didSendUpstream) {
    if (getCircuitBlockedCandidates(error).length > 0) {
      return "UPSTREAM_CIRCUIT_OPEN";
    }
    return "NO_HEALTHY_CANDIDATES";
  }
  if (lastFailoverAttempt?.status_code != null) {
    return "UPSTREAM_HTTP_ERROR";
  }
  return "UPSTREAM_NETWORK_ERROR";
}

export function getCircuitBlockedCandidates(error: unknown): CircuitBlockedCandidate[] {
  if (error instanceof NoHealthyUpstreamsError && error.circuitBlockedCandidates) {
    return error.circuitBlockedCandidates;
  }
  return [];
}

export function resolveDidSendUpstream(
  error: FailoverErrorWithHistory | null | undefined,
  lastSentFailoverAttempt: FailoverAttempt | undefined
): boolean {
  const attachedDidSend =
    typeof error?.didSendUpstream === "boolean" ? error.didSendUpstream : undefined;

  // Prefer positive evidence: if any non-synthetic failover attempt exists, upstream was sent.
  if (lastSentFailoverAttempt != null) {
    return true;
  }

  return attachedDidSend === true;
}

export function getUserHint(
  errorCode: UnifiedErrorCode,
  reason: UnifiedErrorReason,
  routeCapability: RouteCapability,
  circuitBlockedCandidates: CircuitBlockedCandidate[] = []
): string {
  if (errorCode === "NO_AUTHORIZED_UPSTREAMS") {
    const capabilityLabel: Record<RouteCapability, string> = {
      openai_responses: "OpenAI Responses",
      codex_cli_responses: "Codex CLI Responses",
      openai_chat_compatible: "OpenAI Chat Completions",
      openai_extended: "OpenAI Extended APIs",
      anthropic_messages: "Anthropic Messages",
      claude_code_messages: "Claude Code Messages",
      gemini_native_generate: "Gemini Native Generate",
      gemini_code_assist_internal: "Gemini Code Assist Internal",
    };
    return `当前密钥没有可用的 ${capabilityLabel[routeCapability]} 上游授权，请在密钥配置中绑定至少一个启用上游`;
  }
  if (reason === "CONCURRENCY_FULL") {
    return "当前所有可选上游均已达到并发上限，请提高上游并发配置或增加可用上游后重试";
  }
  if (reason === "QUEUE_WAIT_TIMEOUT") {
    return "请求已进入等待队列，但在获得可用槽位前超过等待时限，请调整队列超时或补充上游容量";
  }
  if (reason === "QUEUE_WAIT_ABORTED") {
    return "调用方在等待队列期间中断了连接，请检查客户端超时配置、网络链路或重试策略";
  }
  if (reason === "API_KEY_QUOTA_EXCEEDED") {
    return "当前密钥已达到消费限额，请等待额度窗口恢复或联系管理员调整额度规则";
  }
  if (reason === "UPSTREAM_CIRCUIT_OPEN") {
    // Do not leak upstream identities downstream; details go to internal logs only.
    // Report the earliest recovery: a single probe-eligible upstream is enough for
    // routing to succeed, so the minimum remaining time is the usable retry-after.
    const remainingSeconds = circuitBlockedCandidates.reduce<number | null>(
      (min, candidate) =>
        candidate.remainingSeconds != null && (min == null || candidate.remainingSeconds < min)
          ? candidate.remainingSeconds
          : min,
      null
    );
    return (
      "当前所有可选上游因近期连续失败已被熔断保护暂时拦截" +
      (remainingSeconds != null ? `，最快 ${remainingSeconds} 秒后自动恢复探测` : "") +
      "；请稍后重试或联系管理员"
    );
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

export function resolveUpstreamProvider(
  upstream: Pick<Upstream, "routeCapabilities"> | null | undefined,
  routeCapability: RouteCapability
): CapabilityProvider {
  return (
    (upstream ? getPrimaryProviderByCapabilities(upstream.routeCapabilities) : null) ??
    getProviderByRouteCapability(routeCapability)
  );
}

interface FailoverAttemptEvidence {
  errorType: FailoverAttempt["error_type"];
  errorMessage: string;
  statusCode: number | null;
  responseHeaders: Record<string, string>;
  responseBodyText: string | null;
  responseBodyJson: unknown | null;
  headerDiff: FailoverAttempt["header_diff"];
  circuitBreakerRecorded: boolean;
  matchedFailureRule: MatchedFailureRule | null;
}

function buildFailoverAttempt(
  selectedUpstream: Upstream,
  routeCapability: RouteCapability,
  attemptUpstreamBaseUrl: string,
  selectionReason: RoutingSelectionReason | null,
  evidence: FailoverAttemptEvidence
): FailoverAttempt {
  return {
    upstream_id: selectedUpstream.id,
    upstream_name: selectedUpstream.name,
    upstream_provider_type: resolveUpstreamProvider(selectedUpstream, routeCapability),
    upstream_base_url: attemptUpstreamBaseUrl,
    attempted_at: new Date().toISOString(),
    error_type: evidence.errorType,
    error_message: evidence.errorMessage,
    status_code: evidence.statusCode,
    response_headers: evidence.responseHeaders,
    response_body_text: evidence.responseBodyText,
    response_body_json: evidence.responseBodyJson,
    selection_reason: selectionReason,
    header_diff: evidence.headerDiff ?? null,
    circuit_breaker_recorded: evidence.circuitBreakerRecorded,
    matched_failure_rule: evidence.matchedFailureRule,
  };
}

const MAX_FAILOVER_ERROR_BODY_BYTES = 256 * 1024;
const FAILOVER_STREAM_CAPTURE_TIMEOUT_MS = 200;

function truncateFailoverEvidenceText(text: string): string {
  if (text.length <= MAX_FAILOVER_ERROR_BODY_BYTES) {
    return text;
  }
  return `${text.slice(0, MAX_FAILOVER_ERROR_BODY_BYTES)}...[TRUNCATED]`;
}

function extractMessageFromErrorPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as {
    message?: unknown;
    detail?: unknown;
    error?: unknown;
  };

  if (typeof candidate.message === "string" && candidate.message.trim()) {
    return truncateFailoverEvidenceText(candidate.message.trim());
  }
  if (typeof candidate.detail === "string" && candidate.detail.trim()) {
    return truncateFailoverEvidenceText(candidate.detail.trim());
  }
  if (candidate.error && candidate.error !== payload) {
    return extractMessageFromErrorPayload(candidate.error);
  }
  return null;
}

const FAILOVER_REDACTED_RESPONSE_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "x-api-key",
  "x-goog-api-key",
  "cookie",
  "set-cookie",
  "www-authenticate",
  "proxy-authenticate",
  "authentication-info",
  "proxy-authentication-info",
]);

function sanitizeFailoverResponseHeaderValue(headerName: string, value: string): string {
  if (!value) {
    return "";
  }
  return FAILOVER_REDACTED_RESPONSE_HEADERS.has(headerName.toLowerCase()) ? "***" : value;
}
function normalizeFailoverResponseHeaders(headers: unknown): Record<string, string> {
  const normalizeEntries = (entries: Iterable<[string, unknown]>): Record<string, string> =>
    Object.fromEntries(
      [...entries]
        .filter(([key]) => typeof key === "string")
        .map(
          ([key, value]) => [key, sanitizeFailoverResponseHeaderValue(key, String(value))] as const
        )
    );

  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    return normalizeEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    const entries = headers.filter(
      (entry): entry is [string, unknown] =>
        Array.isArray(entry) && entry.length >= 2 && typeof entry[0] === "string"
    );
    return normalizeEntries(entries);
  }
  if (typeof headers === "object") {
    return normalizeEntries(Object.entries(headers as Record<string, unknown>));
  }
  return {};
}

function extractFailoverBodyEvidence(body: unknown): {
  bodyText: string | null;
  bodyJson: unknown | null;
} {
  if (body == null) {
    return { bodyText: null, bodyJson: null };
  }

  if (typeof body === "string") {
    const bodyText = truncateFailoverEvidenceText(body);
    try {
      return { bodyText, bodyJson: JSON.parse(bodyText) };
    } catch {
      return { bodyText, bodyJson: null };
    }
  }

  if (body instanceof Uint8Array) {
    return extractFailoverBodyEvidence(new TextDecoder().decode(body));
  }

  if (typeof body === "object") {
    try {
      const serialized = JSON.stringify(body);
      const bodyText = truncateFailoverEvidenceText(serialized);
      return {
        bodyText,
        bodyJson: serialized.length <= MAX_FAILOVER_ERROR_BODY_BYTES ? body : null,
      };
    } catch {
      return { bodyText: null, bodyJson: null };
    }
  }

  return {
    bodyText: truncateFailoverEvidenceText(String(body)),
    bodyJson: null,
  };
}

function extractFailoverErrorEvidence(error: unknown): {
  statusCode: number | null;
  responseHeaders: Record<string, string>;
  responseBodyText: string | null;
  responseBodyJson: unknown | null;
  errorMessage: string;
} {
  const errorObject =
    error && typeof error === "object" ? (error as Record<string, unknown>) : null;

  const statusCandidate = errorObject?.statusCode ?? errorObject?.status;
  const statusCode =
    typeof statusCandidate === "number" && Number.isFinite(statusCandidate)
      ? Math.trunc(statusCandidate)
      : null;

  const responseHeaders = normalizeFailoverResponseHeaders(
    errorObject?.headers ??
      (errorObject?.response as Record<string, unknown> | undefined)?.headers ??
      (errorObject?.cause as Record<string, unknown> | undefined)?.headers
  );

  const rawBody =
    errorObject?.responseBody ??
    errorObject?.body ??
    (errorObject?.response as Record<string, unknown> | undefined)?.body ??
    (errorObject?.cause as Record<string, unknown> | undefined)?.responseBody ??
    (errorObject?.cause as Record<string, unknown> | undefined)?.body;
  const bodyEvidence = extractFailoverBodyEvidence(rawBody);
  const payloadMessage = extractMessageFromErrorPayload(bodyEvidence.bodyJson);
  const fallbackErrorMessage =
    error instanceof Error && error.message.trim() ? error.message.trim() : "Request failed";
  const errorMessage = payloadMessage ?? truncateFailoverEvidenceText(fallbackErrorMessage);

  return {
    statusCode,
    responseHeaders,
    responseBodyText:
      bodyEvidence.bodyText ?? (errorMessage ? truncateFailoverEvidenceText(errorMessage) : null),
    responseBodyJson: bodyEvidence.bodyJson,
    errorMessage,
  };
}

function resolveFailedResponseErrorMessage(
  statusCode: number,
  failedResponse: { bodyText: string | null; bodyJson: unknown | null }
): string {
  const payloadMessage = extractMessageFromErrorPayload(failedResponse.bodyJson);
  if (payloadMessage) {
    return payloadMessage;
  }
  if (failedResponse.bodyText) {
    return truncateFailoverEvidenceText(failedResponse.bodyText);
  }
  return `HTTP ${statusCode} error`;
}

async function captureFailedResponse(result: ProxyResult): Promise<{
  headers: Record<string, string>;
  bodyText: string | null;
  bodyJson: unknown | null;
}> {
  const headers = normalizeFailoverResponseHeaders(result.headers);

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
export interface ProxyExecutionInput {
  request: Request;
  routeCapability: RouteCapability;
  path: string;
  requestId: string;
  candidateUpstreamIds: string[];
  candidateSnapshot?: UpstreamWithCircuitBreaker[];
  requestModel: string | null;
  affinityContext: {
    apiKeyId: string;
    sessionId: string | null;
    contentLength: number;
  } | null;
  compensationHeaders: CompensationHeader[];
  onQueueStateChange?: (queue: RoutingQueueLog) => void | Promise<void>;
  onDispatchStart?: (upstream: Upstream) => void;
  config?: FailoverConfig;
}

export interface ProxyExecutionResult {
  result: ProxyResultWithStreamFailure;
  selectedUpstream: Upstream;
  failedUpstreamIds: string[];
  failoverHistory: FailoverAttempt[];
  concurrencyExcludedCandidates: RoutingExcluded[];
  affinityHit: boolean;
  affinityMigrated: boolean;
  finalSelectionReason: RoutingSelectionReason | null;
  queue: RoutingQueueLog | null;
}

export async function forwardWithFailover(
  input: ProxyExecutionInput
): Promise<ProxyExecutionResult> {
  const {
    request,
    routeCapability,
    path,
    requestId,
    candidateUpstreamIds,
    candidateSnapshot,
    requestModel,
    affinityContext,
    compensationHeaders,
    onQueueStateChange,
    onDispatchStart,
    config = DEFAULT_FAILOVER_CONFIG,
  } = input;
  const failedUpstreamIds: string[] = [];
  const failoverHistory: FailoverAttempt[] = [];
  const concurrencyExcludedCandidates: RoutingExcluded[] = [];
  let lastError: Error | null = null;
  let didSendUpstream = false;
  let affinityHit = false;
  let affinityMigrated = false;
  let finalSelectionReason: RoutingSelectionReason | null = null;
  let queueLifecycle: RoutingQueueLog | null = null;

  const circuitBlockedCandidates: CircuitBlockedCandidate[] = [];

  const appendCircuitBlocked = (error: unknown) => {
    mergeCircuitBlockedCandidates(circuitBlockedCandidates, getCircuitBlockedCandidates(error));
  };

  const appendConcurrencyExclusions = (
    excludedCandidates: NonNullable<
      Awaited<ReturnType<typeof selectFromUpstreamCandidates>>["concurrencyExcluded"]
    >
  ) => {
    for (const excluded of excludedCandidates) {
      if (
        !concurrencyExcludedCandidates.some(
          (candidate) =>
            candidate.id === excluded.upstreamId && candidate.reason === "concurrency_full"
        )
      ) {
        concurrencyExcludedCandidates.push({
          id: excluded.upstreamId,
          name: excluded.upstreamName,
          reason: "concurrency_full",
        });
      }
    }
  };

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
        {
          failoverHistory,
          didSendUpstream,
          concurrencyExcludedCandidates,
        }
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
        affinitySelectionContext,
        { candidateSnapshot }
      );
      appendConcurrencyExclusions(selection.concurrencyExcluded ?? []);

      selectedUpstream = selection.upstream;
      finalSelectionReason = attachRetryReason(selection.selectionReason ?? null, failoverHistory);
      // Capture affinity info from first successful selection
      if (failedUpstreamIds.length === 0) {
        affinityHit = selection.affinityHit ?? false;
        affinityMigrated = selection.affinityMigrated ?? false;
      }
    } catch (error) {
      if (isNoAuthorizedUpstreamsError(error)) {
        throw attachFailoverContext(error instanceof Error ? error : new Error(String(error)), {
          failoverHistory,
          didSendUpstream,
          concurrencyExcludedCandidates,
        });
      }
      if (error instanceof AllCandidatesConcurrencyFullError) {
        appendConcurrencyExclusions(error.excludedCandidates);
        if (error.waitableCandidate) {
          try {
            const resumedSelection = await resumeQueuedUpstreamSelection({
              request,
              requestId,
              candidateUpstreamIds,
              failedUpstreamIds,
              failoverHistory,
              waitableCandidate: error.waitableCandidate,
              onQueueStateChange,
            });
            appendConcurrencyExclusions(resumedSelection.concurrencyExcludedCandidates);
            selectedUpstream = resumedSelection.selectedUpstream;
            finalSelectionReason = resumedSelection.selectionReason;
            queueLifecycle = resumedSelection.queue;
          } catch (resumeError) {
            if (resumeError instanceof AllCandidatesConcurrencyFullError) {
              appendConcurrencyExclusions(resumeError.excludedCandidates);
              lastError = resumeError;
              hasMoreUpstreams = false;
            } else if (resumeError instanceof NoHealthyUpstreamsError) {
              appendCircuitBlocked(resumeError);
              lastError = resumeError;
              hasMoreUpstreams = false;
            } else if (resumeError instanceof ClientDisconnectedError) {
              throw attachFailoverContext(resumeError, {
                failoverHistory,
                didSendUpstream,
                concurrencyExcludedCandidates,
                queue: (resumeError as FailoverErrorWithHistory).queue ?? null,
              });
            } else {
              throw attachFailoverContext(
                resumeError instanceof Error ? resumeError : new Error(String(resumeError)),
                {
                  failoverHistory,
                  didSendUpstream,
                  concurrencyExcludedCandidates,
                  queue: (resumeError as FailoverErrorWithHistory).queue ?? null,
                }
              );
            }
          }
        } else {
          lastError = error;
          hasMoreUpstreams = false;
        }
      } else if (error instanceof NoHealthyUpstreamsError) {
        appendCircuitBlocked(error);
        hasMoreUpstreams = false;
      } else {
        throw attachFailoverContext(error instanceof Error ? error : new Error(String(error)), {
          failoverHistory,
          didSendUpstream,
          concurrencyExcludedCandidates,
          queue: queueLifecycle,
        });
      }
    }

    // Check if we should continue trying
    if (!shouldContinueFailover(attemptCount, hasMoreUpstreams, config, request.signal.aborted)) {
      // No more upstreams or hit max attempts - throw NoHealthyUpstreamsError
      // to indicate all failover attempts have been exhausted
      const exhaustedError = new NoHealthyUpstreamsError(
        lastError?.message ?? "All upstreams exhausted"
      );
      if (circuitBlockedCandidates.length > 0) {
        exhaustedError.circuitBlockedCandidates = circuitBlockedCandidates;
      }
      throw attachFailoverContext(exhaustedError, {
        failoverHistory,
        didSendUpstream,
        concurrencyExcludedCandidates,
      });
    }

    if (!selectedUpstream) {
      throw attachFailoverContext(new NoHealthyUpstreamsError("No upstream available"), {
        failoverHistory,
        didSendUpstream,
        concurrencyExcludedCandidates,
      });
    }

    attemptCount++;

    let attemptUpstreamBaseUrl = selectedUpstream.baseUrl;
    const releaseSelectedConnectionOnce = createReleaseConnectionOnce(selectedUpstream.id);

    try {
      // Create a new request with the buffered body
      const proxyRequest = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: requestBodyBuffer.byteLength > 0 ? requestBodyBuffer : undefined,
      });

      const circuitBreakerConfig = await getEffectiveCircuitBreakerConfig(selectedUpstream.id);
      const upstreamForProxy = prepareUpstreamForProxy(selectedUpstream, {
        firstByteTimeout: circuitBreakerConfig.firstByteTimeout,
        streamIdleTimeout: circuitBreakerConfig.streamIdleTimeout,
      });
      attemptUpstreamBaseUrl = upstreamForProxy.baseUrl;
      didSendUpstream = true;

      // CLIProxyAPI 单账号映射上游：按绑定账号的前缀拼出携带前缀的模型名注入转发，
      // 使 CLIProxyAPI 把请求固定路由到该账号。普通上游与池上游不带账号文件名，跳过注入。
      let cliproxyModelOverride: string | undefined;
      if (
        selectedUpstream.cliproxyAuthFileName &&
        selectedUpstream.cliproxyInstanceId &&
        requestModel
      ) {
        const accountPrefix = await resolveCliproxyAccountPrefix(
          selectedUpstream.cliproxyInstanceId,
          selectedUpstream.cliproxyAuthFileName
        );
        if (accountPrefix) {
          cliproxyModelOverride = buildCliproxyPrefixedModel(accountPrefix, requestModel);
        }
      }

      onDispatchStart?.(selectedUpstream);
      const result = await forwardRequest(
        proxyRequest,
        upstreamForProxy,
        path,
        requestId,
        compensationHeaders,
        cliproxyModelOverride
      );

      // Check if response indicates we should failover
      if (shouldTriggerFailover(result.statusCode, config)) {
        const failedResponse = await captureFailedResponse(result);
        const errorType = getErrorType(null, result.statusCode);
        const matchedFailureRule = await matchFailureRule({
          upstreamId: selectedUpstream.id,
          statusCode: result.statusCode,
          errorType,
          responseHeaders: failedResponse.headers,
          responseBodyText: failedResponse.bodyText,
          errorMessage: resolveFailedResponseErrorMessage(result.statusCode, failedResponse),
        });
        const circuitBreakerRecorded =
          shouldRecordCircuitBreakerFailure(path) && matchedFailureRule === null;
        // Release connection and mark as unhealthy
        releaseSelectedConnectionOnce();
        void markUnhealthy(selectedUpstream.id, `HTTP ${result.statusCode} error`);
        // Record failure in circuit breaker when this route should affect upstream reliability.
        if (circuitBreakerRecorded) {
          void recordFailure(selectedUpstream.id, `http_${result.statusCode}`);
        }
        // Record failover attempt
        failoverHistory.push(
          buildFailoverAttempt(
            selectedUpstream,
            routeCapability,
            attemptUpstreamBaseUrl,
            finalSelectionReason,
            {
              errorType,
              errorMessage: resolveFailedResponseErrorMessage(result.statusCode, failedResponse),
              statusCode: result.statusCode,
              responseHeaders: failedResponse.headers,
              responseBodyText: failedResponse.bodyText,
              responseBodyJson: failedResponse.bodyJson,
              headerDiff: result.headerDiff,
              circuitBreakerRecorded,
              matchedFailureRule,
            }
          )
        );
        failedUpstreamIds.push(selectedUpstream.id);
        lastError = new Error(`Upstream returned ${result.statusCode}`);
        continue;
      }

      if (affinityContext?.sessionId) {
        affinityStore.set(
          affinityContext.apiKeyId,
          routeCapability,
          affinityContext.sessionId,
          selectedUpstream.id,
          affinityContext.contentLength
        );
      }

      // For streaming responses, we track the connection until the stream ends
      if (!result.isStream) {
        releaseSelectedConnectionOnce();
        // Mark healthy with a reasonable latency estimate
        void markHealthy(selectedUpstream.id, 100);
        void recordSuccess(selectedUpstream.id);
      } else {
        // For streaming, wrap the stream to release connection when done
        // and handle mid-stream errors
        const originalStream = result.body as ReadableStream<Uint8Array>;
        const upstreamStreamFailurePromise = (result as ProxyResultWithStreamFailure)
          .streamFailurePromise;
        let resolveStreamFailure!: (settlement: StreamRuntimeFailureSettlement) => void;
        const trackedStreamFailurePromise = new Promise<StreamRuntimeFailureSettlement>(
          (resolve) => {
            resolveStreamFailure = resolve;
          }
        );
        const streamFailurePromise = upstreamStreamFailurePromise
          ? Promise.race([trackedStreamFailurePromise, upstreamStreamFailurePromise])
          : trackedStreamFailurePromise;
        const wrappedStream = wrapStreamWithConnectionTracking(
          originalStream,
          selectedUpstream.id,
          releaseSelectedConnectionOnce,
          request.signal,
          upstreamForProxy.streamIdleTimeout,
          async ({ errorType, errorMessage }) => {
            let settlement: StreamRuntimeFailureSettlement;
            try {
              settlement = await settleStreamRuntimeFailureForCircuitBreaker({
                upstreamId: selectedUpstream.id,
                path,
                errorType,
                errorMessage,
              });
            } catch (handlerError) {
              log.error(
                { err: handlerError, upstreamId: selectedUpstream.id, errorType },
                "failed to settle stream runtime failure"
              );
              const circuitBreakerRecorded = shouldRecordCircuitBreakerFailure(path);
              if (circuitBreakerRecorded) {
                void recordFailure(selectedUpstream.id, errorType);
              }
              settlement = {
                errorType,
                errorMessage,
                statusCode: getHttpStatusForError(
                  errorType === "stream_idle_timeout" ? "REQUEST_TIMEOUT" : "STREAM_ERROR"
                ),
                matchedFailureRule: null,
                circuitBreakerRecorded,
                occurredAt: new Date().toISOString(),
              };
            }
            resolveStreamFailure(settlement);
            return settlement;
          }
        );
        return {
          result: { ...result, body: wrappedStream, streamFailurePromise },
          selectedUpstream,
          failedUpstreamIds,
          failoverHistory,
          concurrencyExcludedCandidates,
          affinityHit,
          affinityMigrated,
          finalSelectionReason,
          queue: withQueueStreamFlag(queueLifecycle, result.isStream),
        };
      }

      return {
        result,
        selectedUpstream,
        failedUpstreamIds,
        failoverHistory,
        concurrencyExcludedCandidates,
        affinityHit,
        affinityMigrated,
        finalSelectionReason,
        queue: withQueueStreamFlag(queueLifecycle, result.isStream),
      };
    } catch (error) {
      // Release connection on error
      releaseSelectedConnectionOnce();
      const errorHeaderDiff = extractHeaderDiffFromError(error);

      // Check if client disconnected
      if (request.signal.aborted) {
        log.warn({ requestId }, "client disconnected during request, stopping");
        throw attachFailoverContext(
          new ClientDisconnectedError("Client disconnected during request"),
          {
            failoverHistory,
            didSendUpstream,
            concurrencyExcludedCandidates,
            queue: queueLifecycle,
          }
        );
      }

      // Record failure in circuit breaker for failoverable errors
      if (isFailoverableError(error) || error instanceof CircuitBreakerOpenError) {
        const errorEvidence = extractFailoverErrorEvidence(error);
        const errorType = getErrorType(
          error instanceof Error ? error : null,
          errorEvidence.statusCode
        );
        const matchedFailureRule = await matchFailureRule({
          upstreamId: selectedUpstream.id,
          statusCode: errorEvidence.statusCode,
          errorType,
          responseHeaders: errorEvidence.responseHeaders,
          responseBodyText: errorEvidence.responseBodyText,
          errorMessage: errorEvidence.errorMessage,
        });
        const circuitBreakerRecorded =
          shouldRecordCircuitBreakerFailure(path) && matchedFailureRule === null;
        if (circuitBreakerRecorded) {
          void recordFailure(selectedUpstream.id, errorType);
        }

        // Mark upstream as unhealthy
        const errorMessage = errorEvidence.errorMessage;
        void markUnhealthy(selectedUpstream.id, errorMessage);
        // Record failover attempt
        failoverHistory.push(
          buildFailoverAttempt(
            selectedUpstream,
            routeCapability,
            attemptUpstreamBaseUrl,
            finalSelectionReason,
            {
              errorType,
              errorMessage,
              statusCode: errorEvidence.statusCode,
              responseHeaders: errorEvidence.responseHeaders,
              responseBodyText: errorEvidence.responseBodyText,
              responseBodyJson: errorEvidence.responseBodyJson,
              headerDiff: errorHeaderDiff,
              circuitBreakerRecorded,
              matchedFailureRule,
            }
          )
        );
        failedUpstreamIds.push(selectedUpstream.id);
        lastError = error instanceof Error ? error : new Error(String(error));
        continue;
      }

      // Non-failoverable error - rethrow
      const nonFailoverError = (error instanceof Error ? error : new Error(String(error))) as
        | Error
        | FailoverErrorWithHistory;
      throw attachFailoverContext(nonFailoverError, {
        failoverHistory,
        didSendUpstream,
        concurrencyExcludedCandidates,
        headerDiff: errorHeaderDiff,
        queue: queueLifecycle,
      });
    }
  }
}

function createReleaseConnectionOnce(upstreamId: string): () => void {
  let released = false;

  return () => {
    if (released) {
      return;
    }
    released = true;
    releaseConnection(upstreamId);
  };
}

async function resumeQueuedUpstreamSelection(options: {
  request: Request;
  requestId: string;
  candidateUpstreamIds: string[];
  failedUpstreamIds: string[];
  failoverHistory: FailoverAttempt[];
  waitableCandidate: WaitableUpstreamCandidate;
  onQueueStateChange?: (queue: RoutingQueueLog) => void | Promise<void>;
}): Promise<{
  selectedUpstream: Upstream;
  selectionReason: RoutingSelectionReason | null;
  concurrencyExcludedCandidates: ConcurrencyExcludedCandidate[];
  queue: RoutingQueueLog | null;
}> {
  const {
    request,
    requestId,
    candidateUpstreamIds,
    failedUpstreamIds,
    failoverHistory,
    waitableCandidate,
    onQueueStateChange,
  } = options;
  const queuePolicy = waitableCandidate.upstream.queuePolicy;

  if (!queuePolicy?.enabled) {
    throw new AllCandidatesConcurrencyFullError([], null);
  }

  const enteredAt = new Date().toISOString();
  const waitingQueue: RoutingQueueLog = {
    status: "waiting",
    upstream_id: waitableCandidate.upstream.id,
    entered_at: enteredAt,
    resumed_at: null,
    wait_duration_ms: null,
    timeout_ms: queuePolicy.timeout_ms,
    is_stream: null,
  };

  const queued = upstreamQueueAdmission.enqueueWait({
    upstreamId: waitableCandidate.upstream.id,
    requestId,
    maxQueueLength: queuePolicy.max_queue_length ?? null,
    timeoutMs: queuePolicy.timeout_ms,
    signal: request.signal,
  });

  if (!queued.accepted) {
    if (queued.reason === "aborted") {
      const abortError = new UpstreamQueueWaitAbortedError(
        waitableCandidate.upstream.id,
        requestId,
        0
      );
      (abortError as FailoverErrorWithHistory).queue = {
        ...waitingQueue,
        status: "aborted",
        wait_duration_ms: 0,
      };
      throw abortError;
    }
    throw new AllCandidatesConcurrencyFullError([], waitableCandidate);
  }

  if (onQueueStateChange) {
    void Promise.resolve(onQueueStateChange(waitingQueue)).catch((error) =>
      log.error(
        { err: error, requestId, upstreamId: waitableCandidate.upstream.id },
        "failed to persist queue waiting state"
      )
    );
  }

  let waitGrant: Awaited<typeof queued.waitPromise>;
  try {
    waitGrant = await queued.waitPromise;
  } catch (error) {
    if (isQueueWaitTimeoutError(error)) {
      (error as FailoverErrorWithHistory).queue = {
        ...waitingQueue,
        status: "timed_out",
        wait_duration_ms: error.waitDurationMs,
      };
      throw error;
    }
    if (isQueueWaitAbortedError(error)) {
      (error as FailoverErrorWithHistory).queue = {
        ...waitingQueue,
        status: "aborted",
        wait_duration_ms: error.waitDurationMs,
      };
      throw error;
    }
    throw error;
  }

  const refreshedCandidateSnapshot = await loadActiveUpstreamSnapshot();

  const excludeIds = failedUpstreamIds.length > 0 ? failedUpstreamIds : undefined;
  const resumeDecision = await decideQueuedUpstreamResume(
    waitableCandidate.upstream.id,
    candidateUpstreamIds,
    excludeIds,
    { candidateSnapshot: refreshedCandidateSnapshot }
  );

  if (resumeDecision.action === "resume" && resumeDecision.upstream) {
    return {
      selectedUpstream: resumeDecision.upstream,
      selectionReason: attachRetryReason(null, failoverHistory),
      concurrencyExcludedCandidates: [],
      queue: {
        ...waitingQueue,
        status: "resumed",
        resumed_at: new Date().toISOString(),
        wait_duration_ms: waitGrant.waitDurationMs,
      },
    };
  }

  releaseConnection(waitableCandidate.upstream.id);
  const reselection = await reselectQueuedUpstreamOnce(
    waitableCandidate.upstream.id,
    candidateUpstreamIds,
    resumeDecision.excludeIds,
    { candidateSnapshot: refreshedCandidateSnapshot }
  );

  return {
    selectedUpstream: reselection.upstream,
    selectionReason: attachRetryReason(reselection.selectionReason ?? null, failoverHistory),
    concurrencyExcludedCandidates: reselection.concurrencyExcluded ?? [],
    queue: {
      ...waitingQueue,
      status: "resumed",
      resumed_at: new Date().toISOString(),
      wait_duration_ms: waitGrant.waitDurationMs,
    },
  };
}

/**
 * Error thrown when downstream client disconnects.
 */
export class ClientDisconnectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientDisconnectedError";
  }
}

export type StreamRuntimeFailureType = Extract<
  FailoverAttempt["error_type"],
  "stream_idle_timeout" | "stream_error"
>;

export interface StreamRuntimeFailureSettlement {
  errorType: StreamRuntimeFailureType;
  errorMessage: string;
  statusCode: number;
  matchedFailureRule: MatchedFailureRule | null;
  circuitBreakerRecorded: boolean;
  occurredAt: string;
}

export interface ProxyResultWithStreamFailure extends ProxyResult {
  streamFailurePromise?: Promise<StreamRuntimeFailureSettlement>;
}

/**
 * Applies failure-rule suppression before recording runtime stream failures.
 */
export async function settleStreamRuntimeFailureForCircuitBreaker(input: {
  upstreamId: string;
  path: string;
  errorType: StreamRuntimeFailureType;
  errorMessage: string;
}): Promise<StreamRuntimeFailureSettlement> {
  const matchedFailureRule = await matchFailureRule({
    upstreamId: input.upstreamId,
    errorType: input.errorType,
    errorMessage: input.errorMessage,
  });
  const circuitBreakerRecorded =
    shouldRecordCircuitBreakerFailure(input.path) && matchedFailureRule === null;
  if (circuitBreakerRecorded) {
    void recordFailure(input.upstreamId, input.errorType);
  }

  return {
    errorType: input.errorType,
    errorMessage: input.errorMessage,
    statusCode: getHttpStatusForError(
      input.errorType === "stream_idle_timeout" ? "REQUEST_TIMEOUT" : "STREAM_ERROR"
    ),
    matchedFailureRule,
    circuitBreakerRecorded,
    occurredAt: new Date().toISOString(),
  };
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
  releaseConnectionOnce: () => void,
  abortSignal?: AbortSignal,
  streamIdleTimeoutMs?: number,
  onStreamFailure?: (failure: {
    errorType: StreamRuntimeFailureType;
    errorMessage: string;
  }) => Promise<StreamRuntimeFailureSettlement>
): ReadableStream<Uint8Array> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let streamCompleted = false;
  let disconnectWarnLogged = false;
  const encoder = new TextEncoder();

  const warnDownstreamDisconnect = (message: string) => {
    if (!disconnectWarnLogged) {
      log.warn({ upstreamId }, message);
      disconnectWarnLogged = true;
    }
  };

  const readWithIdleTimeout = async () => {
    if (!streamIdleTimeoutMs || streamIdleTimeoutMs <= 0) {
      return reader!.read();
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        void reader?.cancel("stream_idle_timeout").catch(() => undefined);
        reject(new StreamIdleTimeoutError(streamIdleTimeoutMs));
      }, streamIdleTimeoutMs);
    });

    try {
      return await Promise.race([reader!.read(), timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
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

          const { done, value } = await readWithIdleTimeout();
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
          const errorCode =
            error instanceof StreamIdleTimeoutError ? "REQUEST_TIMEOUT" : "STREAM_ERROR";
          const sseErrorEvent = createSSEErrorEvent(errorCode);
          controller.enqueue(encoder.encode(sseErrorEvent));
          controller.close();
        } catch {
          // Controller may already be in error state
          controller.error(error);
        }

        const errorType: StreamRuntimeFailureType =
          error instanceof StreamIdleTimeoutError ? "stream_idle_timeout" : "stream_error";
        const errorMessage = error instanceof Error ? error.message : "Stream error";

        // Release connection, mark unhealthy, record circuit breaker failure
        releaseConnectionOnce();
        void markUnhealthy(upstreamId, errorMessage);
        if (onStreamFailure) {
          try {
            await onStreamFailure({ errorType, errorMessage });
          } catch (handlerError) {
            log.error(
              { err: handlerError, upstreamId, errorType },
              "failed to settle stream runtime failure"
            );
            void recordFailure(upstreamId, errorType);
          }
        } else {
          void recordFailure(upstreamId, errorType);
        }
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
