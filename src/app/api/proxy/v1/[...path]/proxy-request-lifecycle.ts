import { NextRequest, NextResponse } from "next/server";
import { extractApiKey, getKeyPrefix, verifyApiKey } from "@/lib/utils/auth";
import { db, apiKeys, apiKeyUpstreams, upstreams, users, type Upstream } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import {
  isStreamRequest,
  prepareUpstreamForProxy,
  filterHeaders,
  injectAuthHeader,
  applyCompensationHeaders,
  type CompensationHeader,
} from "@/lib/services/proxy-client";
import {
  logRequest,
  logRequestStart,
  updateRequestLog,
  extractTokenUsage,
  type FailoverAttempt,
} from "@/lib/services/request-logger";
import { calculateAndPersistRequestBillingSnapshot } from "@/lib/services/billing-cost-service";
import {
  AllCandidatesConcurrencyFullError,
  NoHealthyUpstreamsError,
  mergeCircuitBlockedCandidates,
  loadActiveUpstreamSnapshot,
} from "@/lib/services/load-balancer";
import { CircuitBreakerOpenError } from "@/lib/services/circuit-breaker";
import { randomUUID } from "crypto";
import {
  getFallbackRouteCapability,
  getProviderByRouteCapability,
  isCliRouteCapability,
  resolveRouteCapabilities,
  type RouteCapability,
  type RouteMatchSource,
} from "@/lib/route-capabilities";
import {
  extractGeminiModelFromPath,
  isOpenAIModelListRequest,
  resolveRouteCapability,
} from "@/lib/services/route-capability-matcher";
import { ensureRouteCapabilityMigration } from "@/lib/services/route-capability-migration";
import {
  matchUpstreamModelRules,
  normalizeUpstreamModelRules,
} from "@/lib/services/upstream-model-rules";
import {
  createUnifiedErrorBody,
  createUnifiedErrorResponse,
  getHttpStatusForError,
  type UnifiedErrorCode,
  type UnifiedErrorReason,
} from "@/lib/services/unified-error";
import type {
  RequestThinkingConfig,
  ReasoningEffort,
  RequestedServiceTier,
  EffectiveServiceTier,
  RoutingDecisionLog,
  RoutingCandidate,
  RoutingExcluded,
  RoutingFailureStage,
  RoutingQueueLog,
  RoutingSelectionReason,
} from "@/types/api";
import {
  shouldRecordFixture,
  readRequestBody,
  readStreamChunks,
  teeStreamForRecording,
  buildFixture,
  recordTrafficFixture,
} from "@/lib/services/traffic-recorder";
import { getTrafficRecordingSettings } from "@/lib/services/traffic-recording-service";
import {
  extractSessionId,
  affinityStore,
  type AffinityUsage,
} from "@/lib/services/session-affinity";
import { buildCompensations } from "@/lib/services/compensation-service";
import { createLogger } from "@/lib/utils/logger";
import {
  forwardWithFailover,
  ClientDisconnectedError,
  getCircuitBlockedCandidates,
  getUserHint,
  isNoAuthorizedUpstreamsError,
  isQueueWaitAbortedError,
  isQueueWaitTimeoutError,
  resolveDidSendUpstream,
  resolveFailureReason,
  resolveFailureStage,
  resolveUpstreamProvider,
  withQueueStreamFlag,
  type FailoverErrorWithHistory,
  type ProxyResultWithStreamFailure,
  type StreamRuntimeFailureSettlement,
} from "./proxy-execution";
import {
  settleNonStreamRequest,
  type NonStreamFailureTerminal,
  type NonStreamLifecycleContext,
  type NonStreamProxyResult,
} from "./proxy-non-stream-lifecycle";
import { extractRequestThinkingConfig } from "@/lib/utils/request-thinking-config";
import { apiKeyQuotaTracker } from "@/lib/services/api-key-quota-tracker";
import {
  checkAndRecordApiKeyRateLimit,
  recordApiKeyTokenUsage,
  type ApiKeyRateLimitDimension,
} from "@/lib/services/api-key-rate-limiter";
import { resolveBillingModelPrice } from "@/lib/services/billing-price-service";
import {
  createApiKeyModelListResponseBody,
  isModelAllowedByApiKey,
  normalizeApiKeyAllowedModels,
  pickUpstreamLocalModels,
} from "@/lib/api-key-models";

const log = createLogger("proxy-route");

export type RouteContext = { params: Promise<{ path: string[] }> };

async function persistBillingSnapshotSafely(input: {
  requestLogId: string;
  apiKeyId: string | null;
  upstreamId: string | null;
  model: string | null;
  requestedServiceTier?: RequestedServiceTier | null;
  effectiveServiceTier?: EffectiveServiceTier | null;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  requestId: string;
}): Promise<void> {
  try {
    await calculateAndPersistRequestBillingSnapshot({
      requestLogId: input.requestLogId,
      apiKeyId: input.apiKeyId,
      upstreamId: input.upstreamId,
      model: input.model,
      requestedServiceTier: input.requestedServiceTier ?? null,
      effectiveServiceTier: input.effectiveServiceTier ?? null,
      usage: input.usage,
    });
  } catch (error) {
    log.error({ err: error, requestId: input.requestId }, "failed to persist billing snapshot");
  }
}

async function shouldRejectExceededApiKeyQuotaBeforeProxy(input: {
  quotaStatus: ReturnType<typeof apiKeyQuotaTracker.getQuotaStatus>;
  model: string | null;
  requestedStream: boolean;
  requestId: string;
}): Promise<boolean> {
  if (!input.quotaStatus?.isExceeded) {
    return false;
  }

  // Requests whose billability is only known after proxying must still reach snapshot persistence.
  if (!input.requestedStream) {
    return false;
  }

  const normalizedModel = input.model?.trim() ?? "";
  if (!normalizedModel) {
    return false;
  }

  try {
    const resolvedPrice = await resolveBillingModelPrice(normalizedModel);
    return resolvedPrice !== null;
  } catch (error) {
    log.error(
      { err: error, requestId: input.requestId, model: normalizedModel },
      "failed to resolve billing price before API key quota check"
    );
    return false;
  }
}
function buildRoutingDecisionLog(input: {
  model: string | null;
  matchedRouteCapability: RouteCapability | null;
  routeMatchSource: RouteMatchSource | null;
  failureStage: RoutingFailureStage | null;
  providerType?: string | null;
}): RoutingDecisionLog {
  return {
    original_model: input.model ?? "(path-based)",
    resolved_model: input.model ?? "(path-based)",
    model_redirect_applied: false,
    provider_type:
      input.providerType !== undefined
        ? input.providerType
        : input.matchedRouteCapability
          ? getProviderByRouteCapability(input.matchedRouteCapability)
          : null,
    routing_type: "none",
    matched_route_capability: input.matchedRouteCapability,
    route_match_source: input.routeMatchSource,
    capability_candidates_count: 0,
    candidates: [],
    excluded: [],
    candidate_count: 0,
    final_candidate_count: 0,
    selected_upstream_id: null,
    candidate_upstream_id: null,
    actual_upstream_id: null,
    did_send_upstream: false,
    failure_stage: input.failureStage,
    final_selection_reason: null,
    selection_strategy: "weighted",
  };
}

async function logRejectedRequest(input: {
  apiKeyId: string | null;
  apiKeyName?: string | null;
  apiKeyPrefix?: string | null;
  userId?: string | null;
  request: NextRequest;
  path: string;
  model: string | null;
  reasoningEffort?: ReasoningEffort | null;
  requestedServiceTier?: RequestedServiceTier | null;
  thinkingConfig?: RequestThinkingConfig | null;
  requestId: string;
  startTime: number;
  statusCode: number;
  errorMessage: string;
  routingDecision: RoutingDecisionLog;
  routingType?: "tiered" | "direct" | "provider_type" | null;
  priorityTier?: number | null;
  routingDurationMs?: number | null;
  sessionId?: string | null;
  isStream?: boolean;
}): Promise<void> {
  try {
    await logRequest({
      apiKeyId: input.apiKeyId,
      apiKeyName: input.apiKeyName ?? null,
      apiKeyPrefix: input.apiKeyPrefix ?? null,
      userId: input.userId ?? null,
      upstreamId: null,
      method: input.request.method,
      path: input.path,
      model: input.model,
      reasoningEffort: input.reasoningEffort ?? null,
      requestedServiceTier: input.requestedServiceTier ?? null,
      effectiveServiceTier: null,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      statusCode: input.statusCode,
      durationMs: Date.now() - input.startTime,
      routingDurationMs: input.routingDurationMs ?? null,
      errorMessage: input.errorMessage,
      routingType: input.routingType ?? null,
      priorityTier: input.priorityTier ?? null,
      failoverAttempts: 0,
      failoverHistory: null,
      routingDecision: input.routingDecision,
      thinkingConfig: input.thinkingConfig ?? null,
      sessionId: input.sessionId ?? null,
      affinityHit: false,
      affinityMigrated: false,
      isStream: input.isStream ?? false,
    });
  } catch (error) {
    log.error({ err: error, requestId: input.requestId }, "failed to log rejected proxy request");
  }
}

function buildApiKeyQuotaExceededErrorMessage(
  apiKeyId: string,
  exceededRules: Array<{
    periodType: "daily" | "monthly" | "rolling";
    periodHours: number | null;
    currentSpending: number;
    spendingLimit: number;
  }>
): string {
  const rulesSummary = exceededRules
    .map((rule) => {
      if (rule.periodType === "rolling") {
        return `rolling-${rule.periodHours ?? 24}h ${rule.currentSpending}/${rule.spendingLimit}`;
      }
      return `${rule.periodType} ${rule.currentSpending}/${rule.spendingLimit}`;
    })
    .join("; ");

  return `API key spending quota exceeded (api_key_id=${apiKeyId}; rules=${rulesSummary})`;
}

async function logApiKeyQuotaRejectedRequest(input: {
  apiKeyId: string;
  apiKeyName: string | null;
  apiKeyPrefix: string | null;
  userId: string | null;
  request: NextRequest;
  path: string;
  model: string | null;
  reasoningEffort: ReasoningEffort | null;
  requestedServiceTier: RequestedServiceTier | null;
  thinkingConfig: RequestThinkingConfig | null;
  requestId: string;
  startTime: number;
  sessionId: string | null;
  matchedRouteCapability: RouteCapability | null;
  routeMatchSource: RouteMatchSource | null;
  errorMessage: string;
  isStream: boolean;
}): Promise<void> {
  await logRejectedRequest({
    apiKeyId: input.apiKeyId,
    apiKeyName: input.apiKeyName,
    apiKeyPrefix: input.apiKeyPrefix,
    userId: input.userId,
    request: input.request,
    path: input.path,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    requestedServiceTier: input.requestedServiceTier,
    thinkingConfig: input.thinkingConfig,
    requestId: input.requestId,
    startTime: input.startTime,
    sessionId: input.sessionId,
    statusCode: getHttpStatusForError("API_KEY_QUOTA_EXCEEDED"),
    errorMessage: input.errorMessage,
    isStream: input.isStream,
    routingDecision: buildRoutingDecisionLog({
      model: input.model,
      matchedRouteCapability: input.matchedRouteCapability,
      routeMatchSource: input.routeMatchSource,
      failureStage: "auth_filter",
      providerType: null,
    }),
  });
}

function buildApiKeyRateLimitedErrorMessage(
  apiKeyId: string,
  limitedBy: ApiKeyRateLimitDimension[]
): string {
  return `API key rate_limited (api_key_id=${apiKeyId}; dimensions=${limitedBy.join(",")})`;
}

async function logApiKeyAdmissionRejectedRequest(input: {
  apiKeyId: string;
  apiKeyName: string | null;
  apiKeyPrefix: string | null;
  userId: string | null;
  request: NextRequest;
  path: string;
  model: string | null;
  reasoningEffort: ReasoningEffort | null;
  requestedServiceTier: RequestedServiceTier | null;
  thinkingConfig: RequestThinkingConfig | null;
  requestId: string;
  startTime: number;
  sessionId: string | null;
  matchedRouteCapability: RouteCapability | null;
  routeMatchSource: RouteMatchSource | null;
  errorCode: "API_KEY_MODEL_NOT_ALLOWED" | "API_KEY_RATE_LIMITED";
  errorMessage: string;
  isStream: boolean;
}): Promise<void> {
  await logRejectedRequest({
    apiKeyId: input.apiKeyId,
    apiKeyName: input.apiKeyName,
    apiKeyPrefix: input.apiKeyPrefix,
    userId: input.userId,
    request: input.request,
    path: input.path,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    requestedServiceTier: input.requestedServiceTier,
    thinkingConfig: input.thinkingConfig,
    requestId: input.requestId,
    startTime: input.startTime,
    sessionId: input.sessionId,
    statusCode: getHttpStatusForError(input.errorCode),
    errorMessage: input.errorMessage,
    isStream: input.isStream,
    routingDecision: buildRoutingDecisionLog({
      model: input.model,
      matchedRouteCapability: input.matchedRouteCapability,
      routeMatchSource: input.routeMatchSource,
      failureStage: "auth_filter",
    }),
  });
}

async function logLocalApiKeyModelListRequest(input: {
  apiKeyId: string;
  apiKeyName: string | null;
  apiKeyPrefix: string | null;
  userId: string | null;
  request: NextRequest;
  path: string;
  requestId: string;
  startTime: number;
  matchedRouteCapability: RouteCapability | null;
  routeMatchSource: RouteMatchSource | null;
}): Promise<void> {
  const routingDecision = buildRoutingDecisionLog({
    model: "(model-list)",
    matchedRouteCapability: input.matchedRouteCapability,
    routeMatchSource: input.routeMatchSource,
    failureStage: null,
  });

  await logRequest({
    apiKeyId: input.apiKeyId,
    apiKeyName: input.apiKeyName,
    apiKeyPrefix: input.apiKeyPrefix,
    userId: input.userId,
    upstreamId: null,
    method: input.request.method,
    path: input.path,
    model: "(model-list)",
    reasoningEffort: null,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    statusCode: 200,
    durationMs: Date.now() - input.startTime,
    routingDurationMs: 0,
    errorMessage: null,
    routingType: null,
    priorityTier: null,
    failoverAttempts: 0,
    failoverHistory: null,
    routingDecision,
    thinkingConfig: null,
    sessionId: null,
    affinityHit: false,
    affinityMigrated: false,
    isStream: false,
  });
}

/**
 * Transform ModelRouterResult to RoutingDecisionLog for storage.
 */
interface RoutingDecisionDiagnostics {
  candidateUpstreamId?: string | null;
  actualUpstreamId?: string | null;
  didSendUpstream?: boolean;
  failureStage?: RoutingFailureStage | null;
  finalSelectionReason?: RoutingSelectionReason | null;
  queue?: RoutingQueueLog | null;
}

type CandidateCircuitStateMap = Record<string, RoutingCandidate["circuit_state"]>;

function normalizeRoutingCircuitState(
  state: string | null | undefined
): RoutingCandidate["circuit_state"] {
  if (state === "open" || state === "half_open" || state === "closed") {
    return state;
  }
  return "closed";
}

function buildCandidateCircuitStateMap(
  capabilityCandidates: Upstream[],
  snapshot: Array<{ upstream: Upstream; circuitState: string | null }>
): CandidateCircuitStateMap {
  const circuitStateMap = new Map(
    snapshot.map((entry) => [entry.upstream.id, normalizeRoutingCircuitState(entry.circuitState)])
  );

  return Object.fromEntries(
    capabilityCandidates.map((upstream) => [
      upstream.id,
      circuitStateMap.get(upstream.id) ?? "closed",
    ])
  );
}

function transformPathRoutingDecisionLog(
  input: {
    matchedRouteCapability: RouteCapability;
    routeMatchSource: RouteMatchSource;
    originalModel: string | null;
    resolvedModel: string | null;
    modelRedirectApplied: boolean;
    capabilityCandidates: Upstream[];
    finalCandidates: Upstream[];
    excludedCandidates: RoutingExcluded[];
    candidateCircuitStates?: CandidateCircuitStateMap;
  },
  selectedUpstreamId: string | null,
  diagnostics?: RoutingDecisionDiagnostics
): RoutingDecisionLog {
  const candidates: RoutingCandidate[] = input.capabilityCandidates.map((upstream) => ({
    id: upstream.id,
    name: upstream.name,
    weight: upstream.weight,
    circuit_state: input.candidateCircuitStates?.[upstream.id] ?? "closed",
  }));

  return {
    original_model: input.originalModel ?? "(path-based)",
    resolved_model: input.resolvedModel ?? "(path-based)",
    model_redirect_applied: input.modelRedirectApplied,
    provider_type: getProviderByRouteCapability(input.matchedRouteCapability),
    routing_type: "path_capability",
    matched_route_capability: input.matchedRouteCapability,
    route_match_source: input.routeMatchSource,
    capability_candidates_count: input.capabilityCandidates.length,
    candidates,
    excluded: input.excludedCandidates,
    candidate_count: input.capabilityCandidates.length,
    final_candidate_count: input.finalCandidates.length,
    selected_upstream_id: selectedUpstreamId,
    candidate_upstream_id: diagnostics?.candidateUpstreamId ?? selectedUpstreamId,
    actual_upstream_id: diagnostics?.actualUpstreamId ?? null,
    ...(typeof diagnostics?.didSendUpstream === "boolean"
      ? { did_send_upstream: diagnostics.didSendUpstream }
      : {}),
    ...(diagnostics?.failureStage !== undefined ? { failure_stage: diagnostics.failureStage } : {}),
    final_selection_reason: diagnostics?.finalSelectionReason ?? null,
    ...(diagnostics?.queue !== undefined ? { queue: diagnostics.queue } : {}),
    selection_strategy: "weighted",
  };
}

function resolvePathRoutingModelForUpstream(
  originalModel: string | null,
  upstream: Upstream | null | undefined
): {
  matched: boolean;
  hasExplicitRules: boolean;
  resolvedModel: string | null;
  redirectApplied: boolean;
} {
  if (!originalModel || !upstream) {
    return {
      matched: true,
      hasExplicitRules: false,
      resolvedModel: originalModel,
      redirectApplied: false,
    };
  }

  const result = matchUpstreamModelRules(
    originalModel,
    normalizeUpstreamModelRules({
      modelRules: upstream.modelRules,
      allowedModels: upstream.allowedModels,
      modelRedirects: upstream.modelRedirects,
    })
  );
  return {
    matched: result.matched,
    hasExplicitRules: result.hasExplicitRules,
    resolvedModel: result.resolvedModel,
    redirectApplied: result.redirectApplied,
  };
}

function filterCandidatesByModelRules(
  originalModel: string | null,
  candidates: Upstream[]
): { allowed: Upstream[]; excluded: RoutingExcluded[] } {
  if (!originalModel) {
    return {
      allowed: candidates,
      excluded: [],
    };
  }

  const allowed: Upstream[] = [];
  const excluded: RoutingExcluded[] = [];
  for (const candidate of candidates) {
    const modelResolution = resolvePathRoutingModelForUpstream(originalModel, candidate);
    if (modelResolution.matched) {
      allowed.push(candidate);
      continue;
    }

    if (modelResolution.hasExplicitRules) {
      excluded.push({
        id: candidate.id,
        name: candidate.name,
        reason: "model_not_allowed",
      });
      continue;
    }

    allowed.push(candidate);
  }

  return { allowed, excluded };
}

function getApiKeyVisibleModelList(
  apiKeyAllowedModels: string[],
  candidates: Upstream[]
): string[] {
  return apiKeyAllowedModels.filter((model) =>
    candidates.some((candidate) => resolvePathRoutingModelForUpstream(model, candidate).matched)
  );
}

/**
 * Collect the model names an upstream is known to serve, from local data only:
 * synced model catalog first, then declared allowed models, then exact model rules.
 * Used to answer /v1/models locally when no upstream candidate is reachable.
 */
function collectLocalModelListFallbackModels(candidates: Upstream[]): string[] {
  const models = new Set<string>();
  for (const upstream of candidates) {
    const upstreamModels = pickUpstreamLocalModels({
      catalogModels: (upstream.modelCatalog ?? []).map((entry) => entry.model),
      allowedModels: upstream.allowedModels ?? [],
      exactRuleModels: (upstream.modelRules ?? [])
        .filter((rule) => rule.type === "exact")
        .map((rule) => rule.value),
    });
    for (const model of upstreamModels) {
      models.add(model);
    }
  }
  return [...models].sort((a, b) => a.localeCompare(b));
}

function mergeExcludedCandidates(
  base: RoutingExcluded[],
  additions: RoutingExcluded[]
): RoutingExcluded[] {
  if (additions.length === 0) {
    return base;
  }

  const merged = new Map<string, RoutingExcluded>();
  for (const item of base) {
    merged.set(`${item.id}:${item.reason}`, item);
  }
  for (const item of additions) {
    merged.set(`${item.id}:${item.reason}`, item);
  }
  return [...merged.values()];
}

interface RouteCapabilityCandidatePool {
  requestedCapability: RouteCapability;
  candidateCapability: RouteCapability;
  capabilityCandidates: Upstream[];
  authorizedCapabilityCandidates: Upstream[];
  candidateUpstreamIds: string[];
}

function resolveRouteCapabilityCandidatePool(
  activeUpstreams: Upstream[],
  allowedUpstreamIdSet: Set<string>,
  requestedCapability: RouteCapability,
  candidateCapability: RouteCapability
): RouteCapabilityCandidatePool {
  const capabilityCandidates = activeUpstreams.filter((upstream) =>
    resolveRouteCapabilities(upstream.routeCapabilities).includes(candidateCapability)
  );
  const authorizedCapabilityCandidates = capabilityCandidates.filter((upstream) =>
    allowedUpstreamIdSet.has(upstream.id)
  );

  return {
    requestedCapability,
    candidateCapability,
    capabilityCandidates,
    authorizedCapabilityCandidates,
    candidateUpstreamIds: authorizedCapabilityCandidates.map((upstream) => upstream.id),
  };
}

function shouldPreferGenericFallbackPool(
  primaryPool: RouteCapabilityCandidatePool,
  fallbackPool: RouteCapabilityCandidatePool | null
): boolean {
  if (!fallbackPool) {
    return false;
  }

  if (
    primaryPool.capabilityCandidates.length === 0 &&
    fallbackPool.capabilityCandidates.length > 0
  ) {
    return true;
  }

  if (
    primaryPool.authorizedCapabilityCandidates.length === 0 &&
    fallbackPool.authorizedCapabilityCandidates.length > 0
  ) {
    return true;
  }

  return false;
}

function shouldRetryWithGenericFallback(
  error: unknown,
  fallbackPool: RouteCapabilityCandidatePool | null
): boolean {
  if (!fallbackPool || fallbackPool.authorizedCapabilityCandidates.length === 0) {
    return false;
  }

  if (
    !(
      error instanceof NoHealthyUpstreamsError || error instanceof AllCandidatesConcurrencyFullError
    )
  ) {
    return false;
  }

  return (error as FailoverErrorWithHistory).didSendUpstream !== true;
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

function wrapStreamWithDownstreamSettlement(
  stream: ReadableStream<Uint8Array>,
  abortSignal: AbortSignal | undefined,
  onAbort: () => void
): ReadableStream<Uint8Array> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let streamCompleted = false;
  let abortHandled = false;

  const handleAbortOnce = () => {
    if (streamCompleted || abortHandled) {
      return;
    }
    abortHandled = true;
    onAbort();
  };

  return new ReadableStream({
    async start(controller) {
      reader = stream.getReader();

      const abortHandler = () => {
        handleAbortOnce();
        void reader?.cancel("Client disconnected").catch(() => undefined);
        try {
          controller.close();
        } catch {
          // Controller may already be closed.
        }
      };

      if (abortSignal) {
        abortSignal.addEventListener("abort", abortHandler, { once: true });
      }

      try {
        while (true) {
          if (abortSignal?.aborted) {
            handleAbortOnce();
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
      } catch (error) {
        if (abortSignal?.aborted) {
          handleAbortOnce();
          return;
        }

        controller.error(error);
      } finally {
        reader?.releaseLock();
        reader = null;
        if (abortSignal) {
          abortSignal.removeEventListener("abort", abortHandler);
        }
      }
    },
    async cancel(reason) {
      handleAbortOnce();
      await reader?.cancel(reason);
    },
  });
}

/**
 * Compute total input tokens for affinity tracking without double counting cached tokens.
 *
 * OpenAI already reports cached tokens inside `promptTokens`. Anthropic should add cache tokens
 * only when `input_tokens` is greater than zero; otherwise the fallback `promptTokens` value already
 * equals the cache-token total. `rawInputTokens` lets us distinguish these cases precisely.
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

  if (routeCapability !== "anthropic_messages" && routeCapability !== "claude_code_messages") {
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
  isStream: boolean;
  reasoningEffort: ReasoningEffort | null;
  requestedServiceTier: RequestedServiceTier | null;
}

type AuthSource = "authorization" | "x-api-key" | "x-goog-api-key" | "none";

function extractProxyApiKey(request: NextRequest): {
  keyValue: string | null;
  authSource: AuthSource;
} {
  const fromAuthorization = extractApiKey(request.headers.get("authorization"));
  if (fromAuthorization) {
    return { keyValue: fromAuthorization, authSource: "authorization" };
  }

  const fromApiKey = extractApiKey(request.headers.get("x-api-key"));
  if (fromApiKey) {
    return { keyValue: fromApiKey, authSource: "x-api-key" };
  }

  const fromGoogleApiKey = extractApiKey(request.headers.get("x-goog-api-key"));
  if (fromGoogleApiKey) {
    return { keyValue: fromGoogleApiKey, authSource: "x-goog-api-key" };
  }

  return { keyValue: null, authSource: "none" };
}

/**
 * Extract request context (model, sessionId) from request body and headers.
 * Single-pass extraction to avoid parsing body multiple times.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeRequestedServiceTier(value: unknown): RequestedServiceTier | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "fast" || normalized === "priority") {
    return "fast";
  }
  return normalized === "default" ? "standard" : null;
}

function resolveEffectiveServiceTier(
  requestedServiceTier: RequestedServiceTier | null,
  confirmedServiceTier: RequestedServiceTier | null | undefined
): EffectiveServiceTier | null {
  if (confirmedServiceTier) {
    return confirmedServiceTier;
  }
  return requestedServiceTier === "fast" ? "unknown" : null;
}

function normalizeReasoningEffort(value: unknown): ReasoningEffort | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "none" ||
    normalized === "minimal" ||
    normalized === "low" ||
    normalized === "medium" ||
    normalized === "high" ||
    normalized === "xhigh" ||
    normalized === "max" ||
    normalized === "enabled"
    ? normalized
    : null;
}

function extractReasoningEffortFromOutputConfig(
  payload: Record<string, unknown> | null
): ReasoningEffort | null {
  if (!payload) {
    return null;
  }

  const outputConfig = asRecord(payload.output_config);
  return normalizeReasoningEffort(outputConfig?.effort);
}

function extractReasoningEffortFromGeminiThinkingConfig(
  payload: Record<string, unknown> | null
): ReasoningEffort | null {
  if (!payload) {
    return null;
  }

  const generationConfig = asRecord(payload.generationConfig);
  const thinkingConfig = asRecord(generationConfig?.thinkingConfig);
  return normalizeReasoningEffort(thinkingConfig?.thinkingLevel);
}

function extractReasoningEffortFromBody(
  bodyJson: Record<string, unknown> | null
): ReasoningEffort | null {
  if (!bodyJson) {
    return null;
  }

  const directReasoningEffort = normalizeReasoningEffort(bodyJson.reasoning_effort);
  if (directReasoningEffort) {
    return directReasoningEffort;
  }

  const reasoningConfig = asRecord(bodyJson.reasoning);
  const reasoningEffort = normalizeReasoningEffort(reasoningConfig?.effort);
  if (reasoningEffort) {
    return reasoningEffort;
  }

  const outputConfigEffort = extractReasoningEffortFromOutputConfig(bodyJson);
  if (outputConfigEffort) {
    return outputConfigEffort;
  }

  const geminiThinkingLevel = extractReasoningEffortFromGeminiThinkingConfig(bodyJson);
  if (geminiThinkingLevel) {
    return geminiThinkingLevel;
  }

  const thinkingConfig = asRecord(bodyJson.thinking);
  if (thinkingConfig?.type === "enabled") {
    return "enabled";
  }

  const extraBody = asRecord(bodyJson.extra_body);
  if (!extraBody) {
    return null;
  }

  const nestedReasoningEffort = normalizeReasoningEffort(extraBody.reasoning_effort);
  if (nestedReasoningEffort) {
    return nestedReasoningEffort;
  }

  const nestedReasoningConfig = asRecord(extraBody.reasoning);
  const nestedReasoningValue = normalizeReasoningEffort(nestedReasoningConfig?.effort);
  if (nestedReasoningValue) {
    return nestedReasoningValue;
  }

  const nestedOutputConfigEffort = extractReasoningEffortFromOutputConfig(extraBody);
  if (nestedOutputConfigEffort) {
    return nestedOutputConfigEffort;
  }

  const nestedGeminiThinkingLevel = extractReasoningEffortFromGeminiThinkingConfig(extraBody);
  if (nestedGeminiThinkingLevel) {
    return nestedGeminiThinkingLevel;
  }

  const nestedThinkingConfig = asRecord(extraBody.thinking);
  if (nestedThinkingConfig?.type === "enabled") {
    return "enabled";
  }

  return null;
}

async function extractRequestContext(request: NextRequest, path: string): Promise<RequestContext> {
  const modelFromPath = extractGeminiModelFromPath(path);
  const requestUrl = new URL(request.url);

  try {
    const clonedRequest = request.clone();
    const bodyText = await clonedRequest.text();

    if (!bodyText) {
      return {
        model: modelFromPath,
        sessionId: null,
        bodyJson: null,
        isStream: isStreamRequest({}, path, requestUrl),
        reasoningEffort: null,
        requestedServiceTier: null,
      };
    }

    const bodyJson = JSON.parse(bodyText) as Record<string, unknown>;
    const modelFromBody = typeof bodyJson.model === "string" ? bodyJson.model || null : null;
    const isStream = isStreamRequest(bodyJson, path, requestUrl);
    const reasoningEffort = extractReasoningEffortFromBody(bodyJson);
    const requestedServiceTier = normalizeRequestedServiceTier(bodyJson.service_tier);

    return {
      model: modelFromBody ?? modelFromPath,
      sessionId: null,
      bodyJson,
      isStream,
      reasoningEffort,
      requestedServiceTier,
    };
  } catch {
    // Not JSON or empty body
    return {
      model: modelFromPath,
      sessionId: null,
      bodyJson: null,
      isStream: isStreamRequest({}, path, requestUrl),
      reasoningEffort: null,
      requestedServiceTier: null,
    };
  }
}

/**
 * Handle all HTTP methods for proxy
 */
export async function handleProxy(request: NextRequest, context: RouteContext): Promise<Response> {
  const requestId = randomUUID().slice(0, 8);
  const startTime = Date.now();
  let routingDurationMs: number | null = null;

  // Extract path
  const { path: pathSegments } = await context.params;
  const path = pathSegments.join("/");
  const requestUrl = new URL(request.url);
  const authRequestIsStream = isStreamRequest({}, path, requestUrl);
  const logAuthRejected = async (input: {
    errorMessage: string;
    apiKeyId?: string | null;
    apiKeyName?: string | null;
    apiKeyPrefix?: string | null;
    userId?: string | null;
  }): Promise<void> => {
    await logRejectedRequest({
      apiKeyId: input.apiKeyId ?? null,
      apiKeyName: input.apiKeyName,
      apiKeyPrefix: input.apiKeyPrefix,
      userId: input.userId,
      request,
      path,
      model: null,
      requestId,
      startTime,
      statusCode: 401,
      errorMessage: input.errorMessage,
      isStream: authRequestIsStream,
      routingDecision: buildRoutingDecisionLog({
        model: null,
        matchedRouteCapability: null,
        routeMatchSource: null,
        failureStage: "auth_filter",
      }),
    });
  };

  // Extract and validate API key
  const { keyValue, authSource } = extractProxyApiKey(request);

  if (!keyValue) {
    log.debug({ requestId, authSource }, "proxy auth: missing supported API key header");
    await logAuthRejected({ errorMessage: "Missing API key" });
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }
  log.debug({ requestId, authSource }, "proxy auth: extracted API key");

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
        await logAuthRejected({
          errorMessage: "API key has expired",
          apiKeyId: candidate.id,
          apiKeyName: candidate.name,
          apiKeyPrefix: candidate.keyPrefix,
          userId: candidate.userId,
        });
        return NextResponse.json({ error: "API key has expired" }, { status: 401 });
      }
      validApiKey = candidate;
      break;
    }
  }

  if (!validApiKey) {
    await logAuthRejected({ errorMessage: "Invalid API key", apiKeyPrefix: keyPrefix });
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  // Deactivating a user cascades to their keys at the proxy boundary: a key
  // owned by an inactive user is rejected here. Ownerless keys (user_id NULL)
  // keep the legacy behaviour and are unaffected.
  if (validApiKey.userId) {
    const owner = await db.query.users.findFirst({
      where: eq(users.id, validApiKey.userId),
      columns: { isActive: true },
    });
    if (!owner?.isActive) {
      log.warn(
        { requestId, keyPrefix: validApiKey.keyPrefix, ownerId: validApiKey.userId },
        "proxy auth: rejected API key owned by an inactive user"
      );
      await logAuthRejected({
        errorMessage: "API key is disabled",
        apiKeyId: validApiKey.id,
        apiKeyName: validApiKey.name,
        apiKeyPrefix: validApiKey.keyPrefix,
        userId: validApiKey.userId,
      });
      return NextResponse.json({ error: "API key is disabled" }, { status: 401 });
    }
  }

  const apiKeySnapshot = {
    apiKeyName: validApiKey.name ?? null,
    apiKeyPrefix: validApiKey.keyPrefix ?? null,
    userId: validApiKey.userId ?? null,
  };

  // Extract model from request body. For path-based routing, model may be absent.
  const tempContext = await extractRequestContext(request, path);
  const model = tempContext.model;
  const bodyJson: Record<string, unknown> | null = tempContext.bodyJson;
  const requestedStream = tempContext.isStream;
  const reasoningEffort = tempContext.reasoningEffort;
  const requestedServiceTier = tempContext.requestedServiceTier;
  const matchedRouteCapabilityDetails = resolveRouteCapability(
    request.method,
    path,
    request.headers
  );
  const matchedRouteCapability = matchedRouteCapabilityDetails?.capability ?? null;
  const matchedRouteMatchSource = matchedRouteCapabilityDetails?.routeMatchSource ?? null;
  const thinkingConfig = extractRequestThinkingConfig(matchedRouteCapability, bodyJson);

  // Rate limiting is deliberately checked before recorder setup, migrations, and
  // upstream candidate lookup so rejected requests never consume upstream work.
  const rateLimitResult = checkAndRecordApiKeyRateLimit(validApiKey.id, {
    rpmLimit: validApiKey.rpmLimit,
    tpmLimit: validApiKey.tpmLimit,
  });
  if (!rateLimitResult.allowed) {
    const errorCode: UnifiedErrorCode = "API_KEY_RATE_LIMITED";
    const errorReason: UnifiedErrorReason = "API_KEY_RATE_LIMITED";
    const errorMessage = buildApiKeyRateLimitedErrorMessage(
      validApiKey.id,
      rateLimitResult.limitedBy
    );
    const errorDetails = {
      reason: errorReason,
      did_send_upstream: false,
      request_id: requestId,
      user_hint: "当前密钥的请求频率或 Token 用量已达到限制，请在 Retry-After 指定时间后重试",
    } as const;

    try {
      await logApiKeyAdmissionRejectedRequest({
        apiKeyId: validApiKey.id,
        apiKeyName: apiKeySnapshot.apiKeyName,
        apiKeyPrefix: apiKeySnapshot.apiKeyPrefix,
        userId: apiKeySnapshot.userId,
        request,
        path,
        model,
        reasoningEffort,
        requestedServiceTier,
        thinkingConfig,
        requestId,
        startTime,
        sessionId: null,
        isStream: requestedStream,
        matchedRouteCapability,
        routeMatchSource: matchedRouteMatchSource,
        errorCode,
        errorMessage,
      });
    } catch (error) {
      log.error(
        { err: error, requestId, apiKeyId: validApiKey.id },
        "failed to log API key rate limit rejection"
      );
    }

    return createUnifiedErrorResponse(errorCode, errorDetails, {
      "Retry-After": String(rateLimitResult.retryAfterSeconds),
    });
  }

  // Recorder setup
  const trafficRecordingSettings = await getTrafficRecordingSettings();
  const shouldRecordSuccess = shouldRecordFixture("success", trafficRecordingSettings);
  const shouldRecordFailure = shouldRecordFixture("failure", trafficRecordingSettings);
  const recorderEnabled = shouldRecordSuccess || shouldRecordFailure;
  const inboundBody = recorderEnabled ? await readRequestBody(request) : null;

  // Routing type is always "tiered" for priority-based routing
  const routingType = "tiered" as const;

  await ensureRouteCapabilityMigration();

  if (!isModelAllowedByApiKey(model, validApiKey.allowedModels)) {
    const errorCode: UnifiedErrorCode = "API_KEY_MODEL_NOT_ALLOWED";
    const errorReason: UnifiedErrorReason = "API_KEY_MODEL_NOT_ALLOWED";
    const errorMessage = `API key is not allowed to request model: ${model}`;
    const errorDetails = {
      reason: errorReason,
      did_send_upstream: false,
      request_id: requestId,
      user_hint: model
        ? `当前密钥未允许模型 ${model}，请在密钥配置中添加该模型`
        : "当前密钥未允许该请求模型，请检查密钥模型权限",
    } as const;

    try {
      await logApiKeyAdmissionRejectedRequest({
        apiKeyId: validApiKey.id,
        apiKeyName: apiKeySnapshot.apiKeyName,
        apiKeyPrefix: apiKeySnapshot.apiKeyPrefix,
        userId: apiKeySnapshot.userId,
        request,
        path,
        model,
        reasoningEffort,
        requestedServiceTier,
        thinkingConfig,
        startTime,
        requestId,
        isStream: requestedStream,
        sessionId: null,
        matchedRouteCapability,
        routeMatchSource: matchedRouteMatchSource,
        errorCode,
        errorMessage,
      });
    } catch (error) {
      log.error({ err: error, requestId, model }, "failed to log API key model rejection");
    }

    return createUnifiedErrorResponse(errorCode, errorDetails);
  }

  await apiKeyQuotaTracker.initialize();
  const apiKeyQuotaStatus = apiKeyQuotaTracker.getQuotaStatus(validApiKey.id);

  if (!matchedRouteCapability) {
    const unsupportedDurationMs = Date.now() - startTime;
    const unsupportedResponse = createUnifiedErrorResponse("NO_UPSTREAMS_CONFIGURED", {
      reason: "NO_HEALTHY_CANDIDATES",
      did_send_upstream: false,
      request_id: requestId,
      user_hint: "当前请求路径未匹配到受支持的能力类型，请检查请求方法和路径是否在支持列表中",
    });

    const unsupportedRoutingDecision = buildRoutingDecisionLog({
      model,
      matchedRouteCapability: null,
      routeMatchSource: null,
      failureStage: "candidate_selection",
      providerType: null,
    });

    log.warn(
      { requestId, method: request.method, path, matchedRouteCapability: null },
      "path capability not matched, skipping upstream routing"
    );
    await logRejectedRequest({
      apiKeyId: validApiKey.id,
      ...apiKeySnapshot,
      request,
      path,
      model,
      reasoningEffort,
      requestedServiceTier,
      thinkingConfig,
      requestId,
      startTime,
      statusCode: unsupportedResponse.status,
      errorMessage: "path capability not matched, skipping upstream routing",
      routingType,
      routingDurationMs: unsupportedDurationMs,
      isStream: requestedStream,
      routingDecision: unsupportedRoutingDecision,
    });

    return unsupportedResponse;
  }

  // Get API key's authorized upstream IDs
  const upstreamPermissions = await db.query.apiKeyUpstreams.findMany({
    where: eq(apiKeyUpstreams.apiKeyId, validApiKey.id),
  });
  const storedAllowedUpstreamIds = Array.isArray(upstreamPermissions)
    ? upstreamPermissions.map((p) => p.upstreamId)
    : [];
  const accessMode = validApiKey.accessMode ?? "restricted";

  // Route context
  let priorityTier: number | null = null;
  let resolvedModel: string | null = model;
  let modelRedirectApplied = false;
  const routeMatchSource: RouteMatchSource = matchedRouteMatchSource ?? "path";
  let candidateUpstreamIds: string[] = [];
  let capabilityCandidates: Upstream[] = [];
  let finalCapabilityCandidates: Upstream[] = [];
  let excludedCapabilityCandidates: RoutingExcluded[] = [];
  let candidateCircuitStates: CandidateCircuitStateMap = {};
  let sessionId: string | null = null;
  let sessionIdSource: "header" | "body" | null = null;
  let activeUpstreamSnapshot: Awaited<ReturnType<typeof loadActiveUpstreamSnapshot>>;
  try {
    activeUpstreamSnapshot = await loadActiveUpstreamSnapshot();
  } catch (error) {
    log.error({ err: error, requestId }, "failed to load active upstream snapshot");
    const snapshotResponse = createUnifiedErrorResponse("SERVICE_UNAVAILABLE", {
      did_send_upstream: false,
      request_id: requestId,
      user_hint: "上游状态暂时不可用，请稍后重试",
    });
    await logRejectedRequest({
      apiKeyId: validApiKey.id,
      ...apiKeySnapshot,
      request,
      path,
      model,
      reasoningEffort,
      requestedServiceTier,
      thinkingConfig,
      requestId,
      startTime,
      statusCode: snapshotResponse.status,
      errorMessage: "failed to load active upstream snapshot",
      routingType,
      routingDurationMs: Date.now() - startTime,
      isStream: requestedStream,
      routingDecision: buildRoutingDecisionLog({
        model,
        matchedRouteCapability,
        routeMatchSource,
        failureStage: "candidate_selection",
      }),
    });
    return snapshotResponse;
  }
  const activeUpstreams = activeUpstreamSnapshot.map((entry) => entry.upstream);
  const allowedUpstreamIds =
    accessMode === "restricted"
      ? storedAllowedUpstreamIds
      : activeUpstreams.map((upstream) => upstream.id);
  const allowedUpstreamIdSet = new Set(allowedUpstreamIds);

  // Serve the OpenAI-compatible model list locally for keys that declare allowed
  // models. Model listing is a discovery endpoint and must not be gated on a
  // specific route capability (openai_chat_compatible): a key whose authorized
  // upstreams only expose openai_responses / codex_cli_responses can still
  // enumerate its allowed models, mirroring what those upstreams actually serve.
  const apiKeyAllowedModels = normalizeApiKeyAllowedModels(validApiKey.allowedModels);
  if (isOpenAIModelListRequest(request.method, path) && apiKeyAllowedModels) {
    const authorizedActiveUpstreams = activeUpstreams.filter((upstream) =>
      allowedUpstreamIdSet.has(upstream.id)
    );
    if (authorizedActiveUpstreams.length > 0) {
      const visibleModels = getApiKeyVisibleModelList(
        apiKeyAllowedModels,
        authorizedActiveUpstreams
      );

      try {
        await logLocalApiKeyModelListRequest({
          apiKeyId: validApiKey.id,
          apiKeyName: apiKeySnapshot.apiKeyName,
          apiKeyPrefix: apiKeySnapshot.apiKeyPrefix,
          userId: apiKeySnapshot.userId,
          request,
          path,
          requestId,
          startTime,
          matchedRouteCapability,
          routeMatchSource: matchedRouteMatchSource,
        });
      } catch (error) {
        log.error({ err: error, requestId }, "failed to log local API key model list request");
      }

      return new Response(Buffer.from(createApiKeyModelListResponseBody(visibleModels)), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }
  }

  const primaryCandidatePool = resolveRouteCapabilityCandidatePool(
    activeUpstreams,
    allowedUpstreamIdSet,
    matchedRouteCapability,
    matchedRouteCapability
  );
  const fallbackCapability = getFallbackRouteCapability(matchedRouteCapability);
  const fallbackCandidatePool = fallbackCapability
    ? resolveRouteCapabilityCandidatePool(
        activeUpstreams,
        allowedUpstreamIdSet,
        matchedRouteCapability,
        fallbackCapability
      )
    : null;
  let activeCandidatePool = shouldPreferGenericFallbackPool(
    primaryCandidatePool,
    fallbackCandidatePool
  )
    ? fallbackCandidatePool!
    : primaryCandidatePool;

  if (
    activeCandidatePool.candidateCapability !== matchedRouteCapability &&
    fallbackCapability != null
  ) {
    log.warn(
      {
        requestId,
        path,
        matchedRouteCapability,
        fallbackCapability,
        routeMatchSource,
        fallbackReason:
          primaryCandidatePool.capabilityCandidates.length === 0
            ? "no_exact_capability_candidates"
            : "no_exact_authorized_candidates",
      },
      "cli request is using generic capability fallback before upstream selection"
    );
  }

  capabilityCandidates = activeCandidatePool.capabilityCandidates;
  finalCapabilityCandidates = activeCandidatePool.authorizedCapabilityCandidates;
  candidateUpstreamIds = activeCandidatePool.candidateUpstreamIds;

  if (capabilityCandidates.length === 0) {
    log.warn(
      {
        requestId,
        path,
        matchedRouteCapability,
        fallbackCapability,
        activeUpstreamCount: activeUpstreams.length,
        capabilityCandidatesCount: capabilityCandidates.length,
      },
      "no upstream supports matched route capability"
    );
    const noCapabilityResponse = createUnifiedErrorResponse("NO_UPSTREAMS_CONFIGURED", {
      reason: "NO_HEALTHY_CANDIDATES",
      did_send_upstream: false,
      request_id: requestId,
      user_hint:
        isCliRouteCapability(matchedRouteCapability) && fallbackCapability
          ? `未找到支持路径能力 ${matchedRouteCapability} 或回退能力 ${fallbackCapability} 的上游，请先检查上游能力配置`
          : `未找到支持路径能力 ${matchedRouteCapability} 的上游，请先检查上游能力配置`,
    });
    await logRejectedRequest({
      apiKeyId: validApiKey.id,
      ...apiKeySnapshot,
      request,
      path,
      model,
      reasoningEffort,
      requestedServiceTier,
      thinkingConfig,
      requestId,
      startTime,
      statusCode: noCapabilityResponse.status,
      errorMessage: "no upstream supports matched route capability",
      routingType,
      routingDurationMs: Date.now() - startTime,
      isStream: requestedStream,
      routingDecision: transformPathRoutingDecisionLog(
        {
          matchedRouteCapability,
          routeMatchSource,
          originalModel: model,
          resolvedModel: model,
          modelRedirectApplied: false,
          capabilityCandidates,
          finalCandidates: [],
          excludedCandidates: [],
          candidateCircuitStates: buildCandidateCircuitStateMap(
            capabilityCandidates,
            activeUpstreamSnapshot
          ),
        },
        null,
        { didSendUpstream: false, failureStage: "candidate_selection" }
      ),
    });
    return noCapabilityResponse;
  }

  if (finalCapabilityCandidates.length === 0) {
    log.warn(
      {
        requestId,
        path,
        matchedRouteCapability,
        capabilityCandidatesCount: capabilityCandidates.length,
        authorizedCapabilityCandidatesCount: finalCapabilityCandidates.length,
        allowedUpstreamCount: allowedUpstreamIds.length,
        fallbackCapability,
      },
      "no authorized upstream for matched route capability"
    );
    const noAuthorizedResponse = createUnifiedErrorResponse("NO_AUTHORIZED_UPSTREAMS", {
      reason: "NO_AUTHORIZED_UPSTREAMS",
      did_send_upstream: false,
      request_id: requestId,
      user_hint: "当前密钥没有可用的路径能力授权，请在密钥配置中绑定对应上游",
    });
    await logRejectedRequest({
      apiKeyId: validApiKey.id,
      ...apiKeySnapshot,
      request,
      path,
      model,
      reasoningEffort,
      requestedServiceTier,
      thinkingConfig,
      requestId,
      startTime,
      statusCode: noAuthorizedResponse.status,
      errorMessage: "no authorized upstream for matched route capability",
      routingType,
      routingDurationMs: Date.now() - startTime,
      isStream: requestedStream,
      routingDecision: transformPathRoutingDecisionLog(
        {
          matchedRouteCapability,
          routeMatchSource,
          originalModel: model,
          resolvedModel: model,
          modelRedirectApplied: false,
          capabilityCandidates,
          finalCandidates: [],
          excludedCandidates: [],
          candidateCircuitStates: buildCandidateCircuitStateMap(
            capabilityCandidates,
            activeUpstreamSnapshot
          ),
        },
        null,
        { didSendUpstream: false, failureStage: "candidate_selection" }
      ),
    });
    return noAuthorizedResponse;
  }
  excludedCapabilityCandidates = [];
  candidateCircuitStates = buildCandidateCircuitStateMap(
    capabilityCandidates,
    activeUpstreamSnapshot
  );
  const modelRuleFiltering = filterCandidatesByModelRules(model, finalCapabilityCandidates);
  finalCapabilityCandidates = modelRuleFiltering.allowed;
  candidateUpstreamIds = finalCapabilityCandidates.map((upstream) => upstream.id);
  excludedCapabilityCandidates = modelRuleFiltering.excluded;

  if (finalCapabilityCandidates.length === 0) {
    const rejectedDurationMs = Date.now() - startTime;
    const rejectedResponse = createUnifiedErrorResponse("NO_UPSTREAMS_CONFIGURED", {
      reason: "NO_HEALTHY_CANDIDATES",
      did_send_upstream: false,
      request_id: requestId,
      user_hint: model
        ? `当前路径能力下没有上游允许模型 ${model}，请检查上游模型规则或目录导入结果`
        : "当前路径能力下没有可用上游候选，请检查上游模型规则配置",
    });
    const rejectedRoutingDecision = transformPathRoutingDecisionLog(
      {
        matchedRouteCapability,
        routeMatchSource,
        originalModel: model,
        resolvedModel: model,
        modelRedirectApplied: false,
        capabilityCandidates,
        finalCandidates: [],
        excludedCandidates: excludedCapabilityCandidates,
        candidateCircuitStates,
      },
      null,
      {
        candidateUpstreamId: null,
        actualUpstreamId: null,
        didSendUpstream: false,
        failureStage: "candidate_selection",
      }
    );

    await logRejectedRequest({
      apiKeyId: validApiKey.id,
      ...apiKeySnapshot,
      request,
      path,
      model,
      reasoningEffort,
      requestedServiceTier,
      thinkingConfig,
      requestId,
      startTime,
      statusCode: rejectedResponse.status,
      errorMessage: "all authorized upstreams were excluded by model rules",
      routingType,
      routingDurationMs: rejectedDurationMs,
      isStream: requestedStream,
      routingDecision: rejectedRoutingDecision,
    });

    return rejectedResponse;
  }

  let selectedCandidate = finalCapabilityCandidates[0];
  ({ resolvedModel, redirectApplied: modelRedirectApplied } = resolvePathRoutingModelForUpstream(
    model,
    selectedCandidate
  ));

  const shouldRejectApiKeyQuotaBeforeProxy = await shouldRejectExceededApiKeyQuotaBeforeProxy({
    quotaStatus: apiKeyQuotaStatus,
    model: resolvedModel,
    requestedStream,
    requestId,
  });
  if (shouldRejectApiKeyQuotaBeforeProxy) {
    const errorCode: UnifiedErrorCode = "API_KEY_QUOTA_EXCEEDED";
    const errorReason: UnifiedErrorReason = "API_KEY_QUOTA_EXCEEDED";
    const exceededRules = apiKeyQuotaStatus!.rules.filter((rule) => rule.isExceeded);
    const errorMessage = buildApiKeyQuotaExceededErrorMessage(validApiKey.id, exceededRules);
    const errorDetails = {
      reason: errorReason,
      did_send_upstream: false,
      request_id: requestId,
      user_hint: getUserHint(errorCode, errorReason, matchedRouteCapability),
    } as const;

    try {
      await logApiKeyQuotaRejectedRequest({
        apiKeyId: validApiKey.id,
        apiKeyName: apiKeySnapshot.apiKeyName,
        apiKeyPrefix: apiKeySnapshot.apiKeyPrefix,
        userId: apiKeySnapshot.userId,
        request,
        path,
        model: resolvedModel,
        reasoningEffort,
        requestedServiceTier,
        thinkingConfig,
        requestId,
        startTime,
        sessionId: null,
        matchedRouteCapability,
        routeMatchSource: matchedRouteMatchSource,
        isStream: requestedStream,
        errorMessage,
      });
    } catch (error) {
      log.error(
        { err: error, requestId, apiKeyId: validApiKey.id },
        "failed to log API key quota rejection"
      );
    }

    return createUnifiedErrorResponse(errorCode, errorDetails);
  }

  log.debug(
    {
      requestId,
      path,
      matchedRouteCapability,
      candidatePoolCapability: activeCandidatePool.candidateCapability,
      routeMatchSource,
      candidateCount: capabilityCandidates.length,
      authorizedCount: finalCapabilityCandidates.length,
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
  let requestLogReady: Promise<string | null> = Promise.resolve(null);
  let requestLogRoutingUpdate: Promise<void> = Promise.resolve();
  let queueStatePersistence: Promise<void> = Promise.resolve();
  let isAffinityHit = false;
  let isAffinityMigrated = false;

  // Build initial routing decision log (will be updated with final upstream after selection)
  const initialRoutingDecisionLog = transformPathRoutingDecisionLog(
    {
      matchedRouteCapability,
      routeMatchSource,
      originalModel: model,
      resolvedModel,
      modelRedirectApplied,
      capabilityCandidates,
      finalCandidates: finalCapabilityCandidates,
      excludedCandidates: excludedCapabilityCandidates,
      candidateCircuitStates,
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
  // Do not wait for the database before dispatching to an upstream.
  requestLogReady = logRequestStart({
    apiKeyId: validApiKey.id,
    ...apiKeySnapshot,
    upstreamId: null,
    method: request.method,
    path,
    model: resolvedModel,
    reasoningEffort,
    requestedServiceTier,
    isStream: requestedStream,
    routingType,
    priorityTier: null,
    routingDecision: initialRoutingDecisionLog,
    thinkingConfig,
    sessionId,
  })
    .then((startLog) => {
      requestLogId ??= startLog.id;
      return startLog.id;
    })
    .catch((error) => {
      log.error({ err: error, requestId }, "failed to create in-progress request log");
      return null;
    });

  const awaitRequestLogReady = async (): Promise<string | null> => {
    if (!requestLogId) {
      requestLogId = await requestLogReady;
    }
    return requestLogId;
  };

  const persistQueueWaitingState = (queue: RoutingQueueLog) => {
    const persistence = queueStatePersistence
      .then(() => requestLogReady)
      .then(async (readyLogId) => {
        if (request.signal.aborted) {
          return;
        }
        const currentLogId = requestLogId ?? readyLogId;
        if (!currentLogId) {
          return;
        }
        requestLogId = currentLogId;

        const waitingRoutingDecisionLog = transformPathRoutingDecisionLog(
          {
            matchedRouteCapability,
            routeMatchSource,
            originalModel: model,
            resolvedModel,
            modelRedirectApplied,
            capabilityCandidates,
            finalCandidates: finalCapabilityCandidates,
            excludedCandidates: excludedCapabilityCandidates,
            candidateCircuitStates,
          },
          queue.upstream_id,
          {
            candidateUpstreamId: queue.upstream_id,
            actualUpstreamId: null,
            didSendUpstream: false,
            failureStage: null,
            queue: withQueueStreamFlag(queue, requestedStream),
          }
        );

        await updateRequestLog(currentLogId, {
          routingDecision: waitingRoutingDecisionLog,
          isStream: requestedStream,
          thinkingConfig,
        });
      })
      .catch((error) => {
        log.error({ err: error, requestId }, "failed to update request log queue state");
      });
    queueStatePersistence = persistence;
    return persistence;
  };

  // Forward request to upstream
  let compensationHeaders: CompensationHeader[] = [];
  const nonStreamLifecycleContext: NonStreamLifecycleContext = {
    request,
    path,
    requestId,
    startTime,
    apiKeyId: validApiKey.id,
    apiKeySnapshot,
    reasoningEffort,
    requestedServiceTier,
    thinkingConfig,
    sessionId,
    matchedRouteCapability,
    inboundBody,
    trafficRecordingSettings,
    shouldRecordSuccess,
    shouldRecordFailure,
    getCompensationHeaders: () => compensationHeaders,
    getQueueStatePersistence: () => queueStatePersistence,
    awaitRequestLogReady,
    awaitRequestLogUpdate: () => requestLogRoutingUpdate,
    getRequestLogId: () => requestLogId,
    setRequestLogId: (value) => {
      requestLogId = value;
    },
    persistBillingSnapshot: persistBillingSnapshotSafely,
    settlement: { response: null },
  };
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

    // Build outbound header compensations based on current capability and request
    const inboundHeaders = Object.fromEntries(request.headers.entries());
    compensationHeaders = await buildCompensations(
      matchedRouteCapability,
      inboundHeaders,
      bodyJson
    );

    let proxySelection: Awaited<ReturnType<typeof forwardWithFailover>>;
    try {
      proxySelection = await forwardWithFailover({
        request,
        routeCapability: matchedRouteCapability,
        path,
        requestId,
        candidateUpstreamIds,
        candidateSnapshot: activeUpstreamSnapshot,
        requestModel: model,
        affinityContext,
        compensationHeaders,
        onQueueStateChange: persistQueueWaitingState,
        onDispatchStart: () => {
          routingDurationMs ??= Date.now() - startTime;
        },
      });
    } catch (error) {
      if (
        activeCandidatePool.candidateCapability === matchedRouteCapability &&
        shouldRetryWithGenericFallback(error, fallbackCandidatePool)
      ) {
        // Preserve the primary pool's circuit-open details: errors thrown on the
        // fallback path below are fresh objects and would otherwise lose them.
        const primaryCircuitBlocked = getCircuitBlockedCandidates(error);
        const attachPrimaryCircuitBlocked = (retryError: unknown): unknown => {
          if (retryError instanceof NoHealthyUpstreamsError && primaryCircuitBlocked.length > 0) {
            const merged = [...(retryError.circuitBlockedCandidates ?? [])];
            mergeCircuitBlockedCandidates(merged, primaryCircuitBlocked);
            retryError.circuitBlockedCandidates = merged;
          }
          return retryError;
        };

        activeCandidatePool = fallbackCandidatePool!;
        capabilityCandidates = activeCandidatePool.capabilityCandidates;
        finalCapabilityCandidates = activeCandidatePool.authorizedCapabilityCandidates;
        candidateCircuitStates = buildCandidateCircuitStateMap(
          capabilityCandidates,
          activeUpstreamSnapshot
        );
        const fallbackModelRuleFiltering = filterCandidatesByModelRules(
          model,
          finalCapabilityCandidates
        );
        finalCapabilityCandidates = fallbackModelRuleFiltering.allowed;
        candidateUpstreamIds = finalCapabilityCandidates.map((upstream) => upstream.id);
        excludedCapabilityCandidates = mergeExcludedCandidates(
          excludedCapabilityCandidates,
          fallbackModelRuleFiltering.excluded
        );

        if (finalCapabilityCandidates.length === 0) {
          throw attachPrimaryCircuitBlocked(
            new NoHealthyUpstreamsError("All fallback candidates were excluded by model rules")
          );
        }

        const fallbackSelectedCandidate = finalCapabilityCandidates[0];
        selectedCandidate = fallbackSelectedCandidate;
        ({ resolvedModel, redirectApplied: modelRedirectApplied } =
          resolvePathRoutingModelForUpstream(model, fallbackSelectedCandidate));

        log.warn(
          {
            requestId,
            path,
            matchedRouteCapability,
            fallbackCapability: activeCandidatePool.candidateCapability,
            routeMatchSource,
            fallbackReason: "no_exact_selectable_candidates",
          },
          "cli-only capability pool unavailable, retrying with generic capability fallback"
        );

        try {
          proxySelection = await forwardWithFailover({
            request,
            routeCapability: matchedRouteCapability,
            path,
            requestId,
            candidateUpstreamIds,
            candidateSnapshot: activeUpstreamSnapshot,
            requestModel: model,
            affinityContext,
            compensationHeaders,
            onQueueStateChange: persistQueueWaitingState,
            onDispatchStart: () => {
              routingDurationMs ??= Date.now() - startTime;
            },
          });
        } catch (retryError) {
          throw attachPrimaryCircuitBlocked(retryError);
        }
      } else {
        throw error;
      }
    }

    const {
      result: proxyResult,
      selectedUpstream: selected,
      failoverHistory: history,
      concurrencyExcludedCandidates: concurrencyExcludedFromSelection,
      affinityHit: afHit,
      affinityMigrated: afMigrated,
      finalSelectionReason,
      queue: queueLifecycle,
    } = proxySelection;
    const result: ProxyResultWithStreamFailure = proxyResult;
    const upstreamForLogging: Upstream = selected;
    failoverHistory = history;
    excludedCapabilityCandidates = mergeExcludedCandidates(
      excludedCapabilityCandidates,
      concurrencyExcludedFromSelection
    );
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
    const sessionIdCompensated = headerDiff.compensated.some(
      (c) => c.header.toLowerCase() === "session_id"
    );

    ({ resolvedModel, redirectApplied: modelRedirectApplied } = resolvePathRoutingModelForUpstream(
      model,
      upstreamForLogging
    ));

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
        originalModel: model,
        resolvedModel,
        modelRedirectApplied,
        capabilityCandidates,
        finalCandidates: finalCapabilityCandidates,
        excludedCandidates: excludedCapabilityCandidates,
        candidateCircuitStates,
      },
      upstreamForLogging.id,
      {
        candidateUpstreamId: upstreamForLogging.id,
        actualUpstreamId: upstreamForLogging.id,
        didSendUpstream: true,
        failureStage: null,
        finalSelectionReason,
        queue: withQueueStreamFlag(queueLifecycle, result.isStream),
      }
    );
    // Complete the start log before terminal settlement can overwrite it.
    requestLogRoutingUpdate = Promise.all([requestLogReady, queueStatePersistence])
      .then(([readyLogId]) => {
        const currentLogId = requestLogId ?? readyLogId;
        if (!currentLogId) {
          return;
        }
        requestLogId = currentLogId;
        return updateRequestLog(currentLogId, {
          ...apiKeySnapshot,
          upstreamId: upstreamForLogging.id,
          isStream: result.isStream,
          routingDecision: finalRoutingDecisionLog,
          thinkingConfig,
        });
      })
      .then(() => undefined)
      .catch((error) => {
        log.error({ err: error, requestId }, "failed to update request log upstream");
      });

    // Create response headers
    const responseHeaders = new Headers(result.headers);

    if (result.isStream) {
      // Streaming response
      const originalStream = result.body as ReadableStream<Uint8Array>;
      let recordingStream: ReadableStream<Uint8Array> | null = null;
      let responseStream = originalStream;
      let streamTerminalStateSettled = false;

      if (shouldRecordSuccess && inboundBody) {
        const [clientStream, recordStream] = teeStreamForRecording(originalStream);
        recordingStream = recordStream;
        responseStream = clientStream;
      }
      const metricsPromise =
        result.streamMetricsPromise ??
        Promise.resolve({
          usage: result.usage ?? null,
          effectiveServiceTier: result.effectiveServiceTier ?? null,
          ttftMs: result.ttftMs,
        });

      // TPM accounting must follow the upstream metrics settlement, not the
      // downstream response lifecycle. proxy-client keeps draining its logging
      // tee after a client disconnects, so settled usage must still constrain
      // later requests even when stream log settlement is skipped.
      void metricsPromise
        .then(({ usage }) => {
          recordApiKeyTokenUsage(validApiKey.id, usage?.totalTokens ?? 0, validApiKey.tpmLimit);
        })
        .catch((error) =>
          log.error(
            { err: error, requestId },
            "failed to record settled stream API key token usage"
          )
        );

      const streamOutcomePromise = result.streamFailurePromise
        ? Promise.race([
            metricsPromise.then((metrics) => ({ type: "metrics" as const, metrics })),
            result.streamFailurePromise.then((failure) => ({
              type: "failure" as const,
              failure,
            })),
          ])
        : metricsPromise.then((metrics) => ({ type: "metrics" as const, metrics }));

      const settleStreamingDisconnect = async () => {
        if (streamTerminalStateSettled) {
          return;
        }
        streamTerminalStateSettled = true;

        const disconnectRoutingDecisionLog: RoutingDecisionLog = {
          ...finalRoutingDecisionLog,
          failure_stage: "downstream_streaming",
        };
        const disconnectStatusCode = getHttpStatusForError("CLIENT_DISCONNECTED");
        const disconnectErrorMessage = "Client disconnected during downstream streaming";
        const disconnectDurationMs = Date.now() - startTime;
        const disconnectUsageForBilling = {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        };

        await awaitRequestLogReady();
        if (requestLogId) {
          const updatedLog = await updateRequestLog(requestLogId, {
            ...apiKeySnapshot,
            upstreamId: upstreamForLogging.id,
            model: resolvedModel,
            requestedServiceTier,
            effectiveServiceTier: null,
            statusCode: disconnectStatusCode,
            durationMs: disconnectDurationMs,
            routingDurationMs,
            errorMessage: disconnectErrorMessage,
            routingType: routingDecision.routingType,
            priorityTier: routingDecision.priorityTier,
            failoverAttempts: routingDecision.failoverAttempts,
            failoverHistory:
              routingDecision.failoverHistory.length > 0 ? routingDecision.failoverHistory : null,
            routingDecision: disconnectRoutingDecisionLog,
            thinkingConfig,
            affinityHit: isAffinityHit,
            affinityMigrated: isAffinityMigrated,
            isStream: true,
            sessionIdCompensated,
            headerDiff,
          });

          await persistBillingSnapshotSafely({
            requestLogId: updatedLog?.id ?? requestLogId,
            apiKeyId: validApiKey.id,
            upstreamId: upstreamForLogging.id,
            model: resolvedModel,
            requestedServiceTier,
            effectiveServiceTier: null,
            usage: disconnectUsageForBilling,
            requestId,
          });
          return;
        }

        const createdLog = await logRequest({
          apiKeyId: validApiKey.id,
          ...apiKeySnapshot,
          upstreamId: upstreamForLogging.id,
          method: request.method,
          path,
          model: resolvedModel,
          requestedServiceTier,
          effectiveServiceTier: null,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          statusCode: disconnectStatusCode,
          durationMs: disconnectDurationMs,
          routingDurationMs,
          errorMessage: disconnectErrorMessage,
          routingType: routingDecision.routingType,
          priorityTier: routingDecision.priorityTier,
          failoverAttempts: routingDecision.failoverAttempts,
          failoverHistory:
            routingDecision.failoverHistory.length > 0 ? routingDecision.failoverHistory : null,
          routingDecision: disconnectRoutingDecisionLog,
          thinkingConfig,
          sessionId,
          affinityHit: isAffinityHit,
          affinityMigrated: isAffinityMigrated,
          isStream: true,
          sessionIdCompensated,
          headerDiff,
        });

        await persistBillingSnapshotSafely({
          requestLogId: createdLog.id,
          apiKeyId: validApiKey.id,
          upstreamId: upstreamForLogging.id,
          model: resolvedModel,
          requestedServiceTier,
          effectiveServiceTier: null,
          usage: disconnectUsageForBilling,
          requestId,
        });
      };

      const settleStreamingFailure = async (failure: StreamRuntimeFailureSettlement) => {
        if (streamTerminalStateSettled) {
          return;
        }
        streamTerminalStateSettled = true;

        const failureRoutingDecisionLog: RoutingDecisionLog = {
          ...finalRoutingDecisionLog,
          failure_stage: "downstream_streaming",
        };
        const failureDurationMs = Date.now() - startTime;
        const failureAttempt: FailoverAttempt = {
          upstream_id: upstreamForLogging.id,
          upstream_name: upstreamForLogging.name,
          upstream_provider_type: resolveUpstreamProvider(
            upstreamForLogging,
            matchedRouteCapability
          ),
          upstream_base_url: upstreamForLogging.baseUrl,
          attempted_at: failure.occurredAt,
          error_type: failure.errorType,
          error_message: failure.errorMessage,
          status_code: null,
          selection_reason: finalSelectionReason,
          header_diff: headerDiff,
          circuit_breaker_recorded: failure.circuitBreakerRecorded,
          matched_failure_rule: failure.matchedFailureRule,
        };
        const failureHistory = [...routingDecision.failoverHistory, failureAttempt];
        const failureUsageForBilling = {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        };

        await awaitRequestLogReady();
        if (requestLogId) {
          const updatedLog = await updateRequestLog(requestLogId, {
            ...apiKeySnapshot,
            upstreamId: upstreamForLogging.id,
            model: resolvedModel,
            requestedServiceTier,
            effectiveServiceTier: null,
            statusCode: failure.statusCode,
            durationMs: failureDurationMs,
            routingDurationMs,
            errorMessage: failure.errorMessage,
            routingType: routingDecision.routingType,
            priorityTier: routingDecision.priorityTier,
            failoverAttempts: failureHistory.length,
            failoverHistory: failureHistory,
            routingDecision: failureRoutingDecisionLog,
            thinkingConfig,
            affinityHit: isAffinityHit,
            affinityMigrated: isAffinityMigrated,
            isStream: true,
            sessionIdCompensated,
            headerDiff,
          });

          await persistBillingSnapshotSafely({
            requestLogId: updatedLog?.id ?? requestLogId,
            apiKeyId: validApiKey.id,
            upstreamId: upstreamForLogging.id,
            model: resolvedModel,
            requestedServiceTier,
            effectiveServiceTier: null,
            usage: failureUsageForBilling,
            requestId,
          });
          return;
        }

        const createdLog = await logRequest({
          apiKeyId: validApiKey.id,
          ...apiKeySnapshot,
          upstreamId: upstreamForLogging.id,
          method: request.method,
          path,
          model: resolvedModel,
          requestedServiceTier,
          effectiveServiceTier: null,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          statusCode: failure.statusCode,
          durationMs: failureDurationMs,
          routingDurationMs,
          errorMessage: failure.errorMessage,
          routingType: routingDecision.routingType,
          priorityTier: routingDecision.priorityTier,
          failoverAttempts: failureHistory.length,
          failoverHistory: failureHistory,
          routingDecision: failureRoutingDecisionLog,
          thinkingConfig,
          sessionId,
          affinityHit: isAffinityHit,
          affinityMigrated: isAffinityMigrated,
          isStream: true,
          sessionIdCompensated,
          headerDiff,
        });

        await persistBillingSnapshotSafely({
          requestLogId: createdLog.id,
          apiKeyId: validApiKey.id,
          upstreamId: upstreamForLogging.id,
          model: resolvedModel,
          requestedServiceTier,
          effectiveServiceTier: null,
          usage: failureUsageForBilling,
          requestId,
        });
      };

      void streamOutcomePromise
        .then(async (outcome) => {
          if (outcome.type === "failure") {
            await settleStreamingFailure(outcome.failure);
            return;
          }

          if (streamTerminalStateSettled || request.signal.aborted) {
            return;
          }
          const { usage, ttftMs } = outcome.metrics;
          const effectiveServiceTier = resolveEffectiveServiceTier(
            requestedServiceTier,
            outcome.metrics.effectiveServiceTier ?? result.effectiveServiceTier
          );

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

          const usageForBilling = {
            promptTokens: usage?.promptTokens || 0,
            completionTokens: usage?.completionTokens || 0,
            totalTokens: usage?.totalTokens || 0,
            cacheReadTokens: usage?.cacheReadTokens || 0,
            cacheWriteTokens: usage?.cacheCreationTokens || 0,
          };

          await awaitRequestLogReady();
          let persistedLogId: string | null = requestLogId;
          if (requestLogId) {
            const updatedLog = await updateRequestLog(requestLogId, {
              ...apiKeySnapshot,
              upstreamId: upstreamForLogging.id,
              model: resolvedModel,
              reasoningEffort,
              requestedServiceTier,
              effectiveServiceTier,
              promptTokens: usageForBilling.promptTokens,
              completionTokens: usageForBilling.completionTokens,
              totalTokens: usageForBilling.totalTokens,
              cachedTokens: usage?.cachedTokens || 0,
              reasoningTokens: usage?.reasoningTokens || 0,
              cacheCreationTokens: usage?.cacheCreationTokens || 0,
              cacheCreation5mTokens: usage?.cacheCreation5mTokens || 0,
              cacheCreation1hTokens: usage?.cacheCreation1hTokens || 0,
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
              thinkingConfig,
              affinityHit: isAffinityHit,
              affinityMigrated: isAffinityMigrated,
              ttftMs: ttftMs ?? null,
              isStream: true,
              sessionIdCompensated,
              headerDiff,
            });
            persistedLogId = updatedLog?.id ?? requestLogId;
          } else {
            const createdLog = await logRequest({
              apiKeyId: validApiKey.id,
              ...apiKeySnapshot,
              upstreamId: upstreamForLogging.id,
              method: request.method,
              path,
              model: resolvedModel,
              reasoningEffort,
              requestedServiceTier,
              effectiveServiceTier,
              promptTokens: usageForBilling.promptTokens,
              completionTokens: usageForBilling.completionTokens,
              totalTokens: usageForBilling.totalTokens,
              cachedTokens: usage?.cachedTokens || 0,
              reasoningTokens: usage?.reasoningTokens || 0,
              cacheCreationTokens: usage?.cacheCreationTokens || 0,
              cacheCreation5mTokens: usage?.cacheCreation5mTokens || 0,
              cacheCreation1hTokens: usage?.cacheCreation1hTokens || 0,
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
              thinkingConfig,
              sessionId,
              affinityHit: isAffinityHit,
              affinityMigrated: isAffinityMigrated,
              ttftMs: ttftMs ?? null,
              isStream: true,
              sessionIdCompensated,
              headerDiff,
            });
            persistedLogId = createdLog.id;
          }

          if (persistedLogId) {
            await persistBillingSnapshotSafely({
              requestLogId: persistedLogId,
              apiKeyId: validApiKey.id,
              upstreamId: upstreamForLogging.id,
              model: resolvedModel,
              requestedServiceTier,
              effectiveServiceTier,
              usage: usageForBilling,
              requestId,
            });
          }
        })
        .catch((e) => log.error({ err: e, requestId }, "failed to log request"));

      responseStream = wrapStreamWithDownstreamSettlement(responseStream, request.signal, () => {
        void settleStreamingDisconnect().catch((error) =>
          log.error({ err: error, requestId }, "failed to settle downstream streaming disconnect")
        );
      });

      // Set streaming headers
      responseHeaders.set("Content-Type", "text/event-stream");
      responseHeaders.set("Cache-Control", "no-cache");
      responseHeaders.set("Connection", "keep-alive");

      if (shouldRecordSuccess && inboundBody && recordingStream) {
        const upstreamForProxy = prepareUpstreamForProxy(upstreamForLogging);
        const outboundHeadersBase = filterHeaders(new Headers(request.headers)).filtered;
        applyCompensationHeaders(outboundHeadersBase, compensationHeaders);
        const outboundHeaders = injectAuthHeader(outboundHeadersBase, upstreamForProxy);
        void readStreamChunks(recordingStream)
          .then(async (chunks) => {
            const streamRequestLogId = await awaitRequestLogReady();
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
              redactSensitive: trafficRecordingSettings.redactSensitive,
            });
            return recordTrafficFixture(fixture, {
              requestLogId: streamRequestLogId,
              apiKeyId: validApiKey.id,
              upstreamId: upstreamForLogging.id,
              method: request.method,
              path,
              model: resolvedModel,
              statusCode: result.statusCode,
              outcome: "success",
            });
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
      const bodyBytes = result.body as Uint8Array;

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

      const effectiveServiceTier = resolveEffectiveServiceTier(
        requestedServiceTier,
        result.effectiveServiceTier
      );
      const usageForBilling = {
        promptTokens: usage?.promptTokens || 0,
        completionTokens: usage?.completionTokens || 0,
        totalTokens: usage?.totalTokens || 0,
        cacheReadTokens: usage?.cacheReadTokens || 0,
        cacheWriteTokens: usage?.cacheCreationTokens || 0,
      };

      // Usage is available only after the non-stream response completes, so
      // TPM likewise applies to the next request rather than this response.
      recordApiKeyTokenUsage(validApiKey.id, usageForBilling.totalTokens, validApiKey.tpmLimit);

      const nonStreamResult: NonStreamProxyResult = {
        ...result,
        body: bodyBytes,
        isStream: false,
      };
      return settleNonStreamRequest(nonStreamLifecycleContext, {
        outcome: "success",
        result: nonStreamResult,
        upstream: upstreamForLogging,
        resolvedModel,
        effectiveServiceTier,
        usage: usage ?? null,
        routingType: routingDecision.routingType,
        priorityTier: routingDecision.priorityTier,
        failoverHistory: routingDecision.failoverHistory,
        routingDecision: finalRoutingDecisionLog,
        affinityHit: isAffinityHit,
        affinityMigrated: isAffinityMigrated,
        sessionIdCompensated,
        headerDiff,
        routingDurationMs,
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
    if (
      error &&
      typeof error === "object" &&
      "concurrencyExcludedCandidates" in error &&
      Array.isArray((error as FailoverErrorWithHistory).concurrencyExcludedCandidates)
    ) {
      excludedCapabilityCandidates = mergeExcludedCandidates(
        excludedCapabilityCandidates,
        (error as FailoverErrorWithHistory).concurrencyExcludedCandidates ?? []
      );
    }
    const circuitBlockedCandidates = getCircuitBlockedCandidates(error);
    if (circuitBlockedCandidates.length > 0) {
      excludedCapabilityCandidates = mergeExcludedCandidates(
        excludedCapabilityCandidates,
        circuitBlockedCandidates.map((candidate) => ({
          id: candidate.upstreamId,
          name: candidate.upstreamName,
          reason: "circuit_open" as const,
        }))
      );
    }

    const durationMs = Date.now() - startTime;
    const lastFailoverAttempt = failoverHistory[failoverHistory.length - 1];
    const failoverError = error as FailoverErrorWithHistory | null;
    const lastDispatchedFailoverAttempt = failoverError?.lastDispatchedFailoverAttempt;
    const didSendUpstream = resolveDidSendUpstream(failoverError);
    if (!didSendUpstream) {
      routingDurationMs ??= durationMs;
    }
    const attributionFailoverAttempt = didSendUpstream
      ? (lastDispatchedFailoverAttempt ?? lastFailoverAttempt)
      : lastFailoverAttempt;
    const queueLifecycle = withQueueStreamFlag(
      (error as FailoverErrorWithHistory | null)?.queue ?? null,
      requestedStream
    );

    // Determine error code for unified response
    let errorCode: UnifiedErrorCode = "SERVICE_UNAVAILABLE";
    if (isNoAuthorizedUpstreamsError(error)) {
      errorCode = "NO_AUTHORIZED_UPSTREAMS";
    } else if (isQueueWaitTimeoutError(error)) {
      errorCode = "QUEUE_WAIT_TIMEOUT";
    } else if (
      error instanceof NoHealthyUpstreamsError ||
      error instanceof CircuitBreakerOpenError
    ) {
      errorCode = "ALL_UPSTREAMS_UNAVAILABLE";
    } else if (error instanceof ClientDisconnectedError || isQueueWaitAbortedError(error)) {
      errorCode = "CLIENT_DISCONNECTED";
    } else if (error instanceof Error && error.message.includes("timed out")) {
      errorCode = "REQUEST_TIMEOUT";
    }

    const failureStage = resolveFailureStage(error, didSendUpstream, attributionFailoverAttempt);
    const failureReason = resolveFailureReason(error, didSendUpstream, attributionFailoverAttempt);
    const actualUpstreamId =
      lastDispatchedFailoverAttempt?.upstream_id ??
      (didSendUpstream ? (selectedCandidate?.id ?? null) : null);
    const candidateUpstreamId = didSendUpstream
      ? (attributionFailoverAttempt?.upstream_id ?? selectedCandidate?.id ?? null)
      : null;

    const errorStatusCode = getHttpStatusForError(errorCode);
    const errorMessage =
      attributionFailoverAttempt?.error_message ??
      (error instanceof Error ? error.message : "Unknown error");
    const failureHeaderDiff =
      attributionFailoverAttempt?.header_diff ??
      (error as FailoverErrorWithHistory | null)?.headerDiff ??
      null;
    const sessionIdCompensated = Boolean(
      failureHeaderDiff?.compensated.some((item) => item.header.toLowerCase() === "session_id")
    );
    const errorDetails = {
      reason: failureReason,
      did_send_upstream: didSendUpstream,
      request_id: requestId,
      user_hint: getUserHint(
        errorCode,
        failureReason,
        matchedRouteCapability,
        circuitBlockedCandidates
      ),
    } as const;
    const downstreamErrorBody = createUnifiedErrorBody(errorCode, errorDetails);
    const upstreamForModelResolution =
      attributionFailoverAttempt?.upstream_id != null
        ? activeUpstreams.find(
            (candidate) => candidate.id === attributionFailoverAttempt.upstream_id
          )
        : selectedCandidate;
    ({ resolvedModel, redirectApplied: modelRedirectApplied } = resolvePathRoutingModelForUpstream(
      model,
      upstreamForModelResolution
    ));

    const failureRoutingDecisionLog = transformPathRoutingDecisionLog(
      {
        matchedRouteCapability,
        routeMatchSource,
        originalModel: model,
        resolvedModel,
        modelRedirectApplied,
        capabilityCandidates,
        finalCandidates: finalCapabilityCandidates,
        excludedCandidates: excludedCapabilityCandidates,
        candidateCircuitStates,
      },
      actualUpstreamId,
      {
        candidateUpstreamId,
        actualUpstreamId,
        didSendUpstream,
        failureStage,
        finalSelectionReason: attributionFailoverAttempt?.selection_reason ?? null,
        queue: queueLifecycle,
      }
    );

    // Shared field set for the failure-path request-log writes below; branch-specific
    // fields (upstreamId, model, statusCode, errorMessage) are overridden per call.
    const failureLogBaseFields = {
      ...apiKeySnapshot,
      reasoningEffort,
      requestedServiceTier,
      effectiveServiceTier: null,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      durationMs,
      routingDurationMs,
      routingType,
      priorityTier,
      failoverAttempts: failoverHistory.length,
      failoverHistory: failoverHistory.length > 0 ? failoverHistory : null,
      routingDecision: failureRoutingDecisionLog,
      thinkingConfig,
      sessionIdCompensated,
      headerDiff: failureHeaderDiff,
    };

    // Model listing is a read-only discovery endpoint: when every candidate was
    // blocked by circuit breakers, answer from the locally synced model catalog
    // instead of failing the request. Other outage classes (concurrency saturation,
    // plain unhealthy candidates, …) keep their 503 semantics.
    if (
      failureReason === "UPSTREAM_CIRCUIT_OPEN" &&
      isOpenAIModelListRequest(request.method, path)
    ) {
      const fallbackModels = collectLocalModelListFallbackModels(
        activeUpstreams.filter((upstream) => allowedUpstreamIdSet.has(upstream.id))
      );
      if (fallbackModels.length > 0) {
        log.warn(
          { requestId, path, failureReason, modelCount: fallbackModels.length },
          "no upstream candidate available for model list, serving local catalog fallback"
        );
        const modelListLogFields = {
          ...failureLogBaseFields,
          upstreamId: null,
          model: "(model-list)",
          statusCode: 200,
          errorMessage: null,
        };
        await queueStatePersistence;
        await awaitRequestLogReady();
        if (requestLogId) {
          await updateRequestLog(requestLogId, modelListLogFields);
        } else {
          await logRequest({
            apiKeyId: validApiKey.id,
            method: request.method,
            path,
            ...modelListLogFields,
          });
        }
        return new Response(Buffer.from(createApiKeyModelListResponseBody(fallbackModels)), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      }
    }

    if (!requestedStream) {
      const failureResponse = createUnifiedErrorResponse(errorCode, errorDetails);
      let failureFixture: NonStreamFailureTerminal["fixture"];
      if (shouldRecordFailure && inboundBody && didSendUpstream) {
        const fallbackOutboundHeaders = filterHeaders(new Headers(request.headers)).filtered;
        applyCompensationHeaders(fallbackOutboundHeaders, compensationHeaders);
        const fallbackProviderType =
          selectedCandidate != null
            ? resolveUpstreamProvider(selectedCandidate, matchedRouteCapability)
            : getProviderByRouteCapability(matchedRouteCapability);
        const fallbackUpstream = {
          id: selectedCandidate?.id ?? "unknown",
          name: selectedCandidate?.name ?? "unknown",
          providerType: fallbackProviderType,
          baseUrl: selectedCandidate?.baseUrl ?? "unknown",
        };
        let outboundHeaders: Headers | Record<string, string> = fallbackOutboundHeaders;
        let upstreamForFixture = fallbackUpstream;

        if (attributionFailoverAttempt?.upstream_id) {
          const attemptProvider =
            attributionFailoverAttempt.upstream_provider_type === "openai" ||
            attributionFailoverAttempt.upstream_provider_type === "anthropic" ||
            attributionFailoverAttempt.upstream_provider_type === "google"
              ? attributionFailoverAttempt.upstream_provider_type
              : fallbackProviderType;
          upstreamForFixture = {
            id: attributionFailoverAttempt.upstream_id,
            name: attributionFailoverAttempt.upstream_name,
            providerType: attemptProvider,
            baseUrl:
              attributionFailoverAttempt.upstream_base_url ??
              selectedCandidate?.baseUrl ??
              "unknown",
          };

          try {
            const attemptedUpstream = await db.query.upstreams.findFirst({
              where: eq(upstreams.id, attributionFailoverAttempt.upstream_id),
            });
            if (attemptedUpstream) {
              const attemptedUpstreamForProxy = prepareUpstreamForProxy(attemptedUpstream);
              outboundHeaders = injectAuthHeader(
                fallbackOutboundHeaders,
                attemptedUpstreamForProxy
              );
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
              "failed to resolve attempted upstream for non-stream failure fixture"
            );
          }
        } else if (selectedCandidate) {
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
              "failed to build upstream auth headers for non-stream failure fixture"
            );
          }
        }

        failureFixture = {
          providerType: fallbackProviderType,
          responseSource: attributionFailoverAttempt?.status_code != null ? "upstream" : "gateway",
          upstream: upstreamForFixture,
          outboundHeaders,
          response: {
            statusCode: attributionFailoverAttempt?.status_code ?? errorStatusCode,
            headers: attributionFailoverAttempt?.response_headers ?? {},
            bodyJson: attributionFailoverAttempt?.response_body_json ?? null,
            bodyText:
              attributionFailoverAttempt?.response_body_json == null
                ? (attributionFailoverAttempt?.response_body_text ?? null)
                : null,
          },
          downstreamBody: downstreamErrorBody,
        };
      }

      if (error instanceof ClientDisconnectedError) {
        log.warn({ requestId }, "client disconnected, no response sent");
      }
      if (errorCode === "SERVICE_UNAVAILABLE") {
        log.error({ err: error, requestId }, "proxy error");
      }

      return settleNonStreamRequest(nonStreamLifecycleContext, {
        outcome: "failure",
        response: failureResponse,
        errorStatusCode,
        errorMessage,
        actualUpstreamId,
        resolvedModel,
        didSendUpstream,
        failoverHistory,
        routingDecision: failureRoutingDecisionLog,
        routingType,
        priorityTier,
        routingDurationMs,
        sessionIdCompensated,
        headerDiff: failureHeaderDiff,
        ...(failureFixture ? { fixture: failureFixture } : {}),
      });
    }

    if (shouldRecordFailure && inboundBody && didSendUpstream) {
      const fallbackOutboundHeaders = filterHeaders(new Headers(request.headers)).filtered;
      applyCompensationHeaders(fallbackOutboundHeaders, compensationHeaders);
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

      if (didSendUpstream && attributionFailoverAttempt?.upstream_id) {
        const attemptProvider =
          attributionFailoverAttempt.upstream_provider_type === "openai" ||
          attributionFailoverAttempt.upstream_provider_type === "anthropic" ||
          attributionFailoverAttempt.upstream_provider_type === "google"
            ? attributionFailoverAttempt.upstream_provider_type
            : fallbackProviderType;
        upstreamForFixture = {
          id: attributionFailoverAttempt.upstream_id,
          name: attributionFailoverAttempt.upstream_name,
          providerType: attemptProvider,
          baseUrl:
            attributionFailoverAttempt.upstream_base_url ?? selectedCandidate?.baseUrl ?? "unknown",
        };

        try {
          const attemptedUpstream = await db.query.upstreams.findFirst({
            where: eq(upstreams.id, attributionFailoverAttempt.upstream_id),
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
          statusCode: attributionFailoverAttempt?.status_code ?? errorStatusCode,
          headers: attributionFailoverAttempt?.response_headers ?? {},
          bodyJson: attributionFailoverAttempt?.response_body_json ?? null,
          bodyText:
            attributionFailoverAttempt?.response_body_json == null
              ? (attributionFailoverAttempt?.response_body_text ?? null)
              : null,
        },
        outboundRequestSent: didSendUpstream,
        outboundResponseSource:
          didSendUpstream && attributionFailoverAttempt?.status_code != null
            ? "upstream"
            : "gateway",
        downstreamResponse: {
          statusCode: errorStatusCode,
          headers: { "content-type": "application/json" },
          bodyJson: downstreamErrorBody,
        },
        failoverHistory: failoverHistory.length > 0 ? failoverHistory : null,
        redactSensitive: trafficRecordingSettings.redactSensitive,
      });

      void recordTrafficFixture(failureFixture, {
        requestLogId,
        apiKeyId: validApiKey.id,
        upstreamId: actualUpstreamId,
        method: request.method,
        path,
        model: resolvedModel,
        statusCode: errorStatusCode,
        outcome: "failure",
      }).catch((recordError) =>
        log.error({ err: recordError, requestId }, "failed to record error fixture")
      );
    }

    // Log failed request (internal logging with full details)
    await queueStatePersistence;
    const failureLogFields = {
      ...failureLogBaseFields,
      upstreamId: actualUpstreamId,
      model: resolvedModel,
      statusCode: errorStatusCode,
      errorMessage,
    };
    await awaitRequestLogReady();
    let persistedLogId: string | null = requestLogId;
    if (requestLogId) {
      const updatedLog = await updateRequestLog(requestLogId, failureLogFields);
      persistedLogId = updatedLog?.id ?? requestLogId;
    } else {
      const createdLog = await logRequest({
        apiKeyId: validApiKey.id,
        method: request.method,
        path,
        ...failureLogFields,
      });
      persistedLogId = createdLog.id;
    }

    if (persistedLogId && didSendUpstream) {
      await persistBillingSnapshotSafely({
        requestLogId: persistedLogId,
        apiKeyId: validApiKey.id,
        upstreamId: actualUpstreamId,
        model: resolvedModel,
        requestedServiceTier,
        effectiveServiceTier: null,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        requestId,
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
