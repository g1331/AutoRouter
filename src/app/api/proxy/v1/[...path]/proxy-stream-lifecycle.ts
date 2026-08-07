import type { Upstream } from "@/lib/db";
import {
  applyCompensationHeaders,
  filterHeaders,
  injectAuthHeader,
  prepareUpstreamForProxy,
  type CompensationHeader,
  type HeaderDiff,
  type StreamMetrics,
  type TokenUsage,
} from "@/lib/services/proxy-client";
import {
  logRequest,
  updateRequestLog,
  type FailoverAttempt,
  type LogRequestInput,
} from "@/lib/services/request-logger";
import {
  buildFixture,
  readStreamChunks,
  recordTrafficFixture,
  teeStreamForRecording,
  type InboundBody,
} from "@/lib/services/traffic-recorder";
import type { TrafficRecordingSettingsValue } from "@/lib/services/traffic-recording-service";
import { affinityStore, type AffinityUsage } from "@/lib/services/session-affinity";
import { getHttpStatusForError } from "@/lib/services/unified-error";
import type { RouteCapability } from "@/lib/route-capabilities";
import { createLogger } from "@/lib/utils/logger";
import {
  resolveUpstreamProvider,
  type ProxyResultWithStreamFailure,
  type StreamRuntimeFailureSettlement,
} from "./proxy-execution";
import type {
  EffectiveServiceTier,
  ReasoningEffort,
  RequestedServiceTier,
  RequestThinkingConfig,
  RoutingDecisionLog,
  RoutingSelectionReason,
} from "@/types/api";
import { recordApiKeyTokenUsage } from "@/lib/services/api-key-rate-limiter";

const log = createLogger("proxy-stream-lifecycle");

interface StreamApiKeySnapshot {
  apiKeyName: string | null;
  apiKeyPrefix: string | null;
  userId: string | null;
}

interface StreamBillingUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface StreamLifecycleContext {
  request: Request;
  path: string;
  requestId: string;
  startTime: number;
  apiKeyId: string;
  apiKeyTpmLimit: number | null | undefined;
  apiKeySnapshot: StreamApiKeySnapshot;
  reasoningEffort: ReasoningEffort | null;
  requestedServiceTier: RequestedServiceTier | null;
  thinkingConfig: RequestThinkingConfig | null;
  sessionId: string | null;
  matchedRouteCapability: RouteCapability;
  inboundBody: InboundBody | null;
  trafficRecordingSettings: Pick<TrafficRecordingSettingsValue, "redactSensitive">;
  shouldRecordSuccess: boolean;
  getCompensationHeaders: () => CompensationHeader[];
  getQueueStatePersistence: () => Promise<void>;
  awaitRequestLogReady: () => Promise<string | null>;
  awaitRequestLogUpdate: () => Promise<void>;
  getRequestLogId: () => string | null;
  setRequestLogId: (requestLogId: string | null) => void;
  persistBillingSnapshot: (input: {
    requestLogId: string;
    apiKeyId: string | null;
    upstreamId: string | null;
    model: string | null;
    requestedServiceTier: RequestedServiceTier | null;
    effectiveServiceTier: EffectiveServiceTier | null;
    usage: StreamBillingUsage;
    requestId: string;
  }) => Promise<void>;
}

export interface StreamLifecycleTerminal {
  result: ProxyResultWithStreamFailure;
  upstream: Upstream;
  resolvedModel: string | null;
  routingType: "tiered" | "direct" | "provider_type" | null;
  priorityTier: number | null;
  failoverHistory: FailoverAttempt[];
  routingDecision: RoutingDecisionLog;
  finalSelectionReason: RoutingSelectionReason | null;
  affinityHit: boolean;
  affinityMigrated: boolean;
  sessionIdCompensated: boolean;
  headerDiff: HeaderDiff | null;
  routingDurationMs: number | null;
}

type StreamLogFields = Omit<LogRequestInput, "apiKeyId">;
type StreamTerminalOutcome = "success" | "failure" | "disconnect";
type StreamOutcome =
  | { type: "metrics"; metrics: StreamMetrics }
  | { type: "failure"; failure: StreamRuntimeFailureSettlement };

function toBillingUsage(usage: TokenUsage | null): StreamBillingUsage {
  return {
    promptTokens: usage?.promptTokens || 0,
    completionTokens: usage?.completionTokens || 0,
    totalTokens: usage?.totalTokens || 0,
    cacheReadTokens: usage?.cacheReadTokens || 0,
    cacheWriteTokens: usage?.cacheCreationTokens || 0,
  };
}

/** Resolve the effective service tier used for stream settlement. */
export function resolveEffectiveServiceTier(
  requestedServiceTier: RequestedServiceTier | null,
  confirmedServiceTier: RequestedServiceTier | null | undefined
): EffectiveServiceTier | null {
  if (confirmedServiceTier) {
    return confirmedServiceTier;
  }
  return requestedServiceTier === "fast" ? "unknown" : null;
}

/** Calculate the token count used to update session affinity. */
export function computeAffinityTokens(
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

  if (rawInput > 0) {
    return rawInput + cacheRead + cacheCreation;
  }

  return prompt;
}

function buildSuccessLogFields(
  context: StreamLifecycleContext,
  terminal: StreamLifecycleTerminal,
  metrics: StreamMetrics,
  usageForBilling: StreamBillingUsage,
  durationMs: number
): StreamLogFields {
  const usage = metrics.usage;
  return {
    ...context.apiKeySnapshot,
    upstreamId: terminal.upstream.id,
    method: context.request.method,
    path: context.path,
    model: terminal.resolvedModel,
    reasoningEffort: context.reasoningEffort,
    requestedServiceTier: context.requestedServiceTier,
    effectiveServiceTier: resolveEffectiveServiceTier(
      context.requestedServiceTier,
      metrics.effectiveServiceTier ?? terminal.result.effectiveServiceTier
    ),
    promptTokens: usageForBilling.promptTokens,
    completionTokens: usageForBilling.completionTokens,
    totalTokens: usageForBilling.totalTokens,
    cachedTokens: usage?.cachedTokens || 0,
    reasoningTokens: usage?.reasoningTokens || 0,
    cacheCreationTokens: usage?.cacheCreationTokens || 0,
    cacheCreation5mTokens: usage?.cacheCreation5mTokens || 0,
    cacheCreation1hTokens: usage?.cacheCreation1hTokens || 0,
    cacheReadTokens: usage?.cacheReadTokens || 0,
    statusCode: terminal.result.statusCode,
    durationMs,
    errorMessage: null,
    routingType: terminal.routingType,
    priorityTier: terminal.priorityTier,
    failoverAttempts: terminal.failoverHistory.length,
    failoverHistory: terminal.failoverHistory.length > 0 ? terminal.failoverHistory : null,
    routingDecision: terminal.routingDecision,
    thinkingConfig: context.thinkingConfig,
    sessionId: context.sessionId,
    affinityHit: terminal.affinityHit,
    affinityMigrated: terminal.affinityMigrated,
    ttftMs: metrics.ttftMs ?? null,
    isStream: true,
    routingDurationMs: terminal.routingDurationMs,
    sessionIdCompensated: terminal.sessionIdCompensated,
    headerDiff: terminal.headerDiff,
  };
}

function buildDisconnectLogFields(
  context: StreamLifecycleContext,
  terminal: StreamLifecycleTerminal,
  durationMs: number
): StreamLogFields {
  return {
    ...context.apiKeySnapshot,
    upstreamId: terminal.upstream.id,
    method: context.request.method,
    path: context.path,
    model: terminal.resolvedModel,
    reasoningEffort: context.reasoningEffort,
    requestedServiceTier: context.requestedServiceTier,
    effectiveServiceTier: null,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    statusCode: getHttpStatusForError("CLIENT_DISCONNECTED"),
    durationMs,
    routingDurationMs: terminal.routingDurationMs,
    errorMessage: "Client disconnected during downstream streaming",
    routingType: terminal.routingType,
    priorityTier: terminal.priorityTier,
    failoverAttempts: terminal.failoverHistory.length,
    failoverHistory: terminal.failoverHistory.length > 0 ? terminal.failoverHistory : null,
    routingDecision: {
      ...terminal.routingDecision,
      failure_stage: "downstream_streaming",
    },
    thinkingConfig: context.thinkingConfig,
    sessionId: context.sessionId,
    affinityHit: terminal.affinityHit,
    affinityMigrated: terminal.affinityMigrated,
    isStream: true,
    sessionIdCompensated: terminal.sessionIdCompensated,
    headerDiff: terminal.headerDiff,
  };
}

function buildFailureLogFields(
  context: StreamLifecycleContext,
  terminal: StreamLifecycleTerminal,
  failure: StreamRuntimeFailureSettlement,
  durationMs: number
): { fields: StreamLogFields; failoverHistory: FailoverAttempt[] } {
  const failureAttempt: FailoverAttempt = {
    upstream_id: terminal.upstream.id,
    upstream_name: terminal.upstream.name,
    upstream_provider_type: resolveUpstreamProvider(
      terminal.upstream,
      context.matchedRouteCapability
    ),
    upstream_base_url: terminal.upstream.baseUrl,
    attempted_at: failure.occurredAt,
    error_type: failure.errorType,
    error_message: failure.errorMessage,
    status_code: null,
    selection_reason: terminal.finalSelectionReason,
    header_diff: terminal.headerDiff,
    circuit_breaker_recorded: failure.circuitBreakerRecorded,
    matched_failure_rule: failure.matchedFailureRule,
  };
  const failoverHistory = [...terminal.failoverHistory, failureAttempt];

  return {
    failoverHistory,
    fields: {
      ...context.apiKeySnapshot,
      upstreamId: terminal.upstream.id,
      method: context.request.method,
      path: context.path,
      model: terminal.resolvedModel,
      reasoningEffort: context.reasoningEffort,
      requestedServiceTier: context.requestedServiceTier,
      effectiveServiceTier: null,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      statusCode: failure.statusCode,
      durationMs,
      routingDurationMs: terminal.routingDurationMs,
      errorMessage: failure.errorMessage,
      routingType: terminal.routingType,
      priorityTier: terminal.priorityTier,
      failoverAttempts: failoverHistory.length,
      failoverHistory,
      routingDecision: {
        ...terminal.routingDecision,
        failure_stage: "downstream_streaming",
      },
      thinkingConfig: context.thinkingConfig,
      sessionId: context.sessionId,
      affinityHit: terminal.affinityHit,
      affinityMigrated: terminal.affinityMigrated,
      isStream: true,
      sessionIdCompensated: terminal.sessionIdCompensated,
      headerDiff: terminal.headerDiff,
    },
  };
}

async function persistTerminalRequestLog(
  context: StreamLifecycleContext,
  fields: StreamLogFields
): Promise<string | null> {
  try {
    await context.getQueueStatePersistence();
    await context.awaitRequestLogReady();
    await context.awaitRequestLogUpdate();
  } catch (error) {
    log.error(
      { err: error, requestId: context.requestId },
      "failed to await streaming request log"
    );
  }

  let requestLogId = context.getRequestLogId();
  try {
    if (requestLogId) {
      const updatedLog = await updateRequestLog(requestLogId, fields);
      requestLogId = updatedLog?.id ?? requestLogId;
    } else {
      const createdLog = await logRequest({
        apiKeyId: context.apiKeyId,
        ...fields,
      });
      requestLogId = createdLog.id;
    }
  } catch (error) {
    log.error(
      { err: error, requestId: context.requestId },
      "failed to settle streaming request log"
    );
  }

  context.setRequestLogId(requestLogId);
  return requestLogId;
}

async function persistZeroUsageBilling(
  context: StreamLifecycleContext,
  terminal: StreamLifecycleTerminal,
  requestLogId: string
): Promise<void> {
  await context.persistBillingSnapshot({
    requestLogId,
    apiKeyId: context.apiKeyId,
    upstreamId: terminal.upstream.id,
    model: terminal.resolvedModel,
    requestedServiceTier: context.requestedServiceTier,
    effectiveServiceTier: null,
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    requestId: context.requestId,
  });
}

function buildAndRecordSuccessFixture(
  context: StreamLifecycleContext,
  terminal: StreamLifecycleTerminal,
  inboundBody: InboundBody,
  requestLogId: string | null,
  chunks: string[]
): void {
  try {
    const upstreamForProxy = prepareUpstreamForProxy(terminal.upstream);
    const outboundHeadersBase = filterHeaders(new Headers(context.request.headers)).filtered;
    applyCompensationHeaders(outboundHeadersBase, context.getCompensationHeaders());
    const outboundHeaders = injectAuthHeader(outboundHeadersBase, upstreamForProxy);
    const providerType = resolveUpstreamProvider(terminal.upstream, context.matchedRouteCapability);
    const fixture = buildFixture({
      requestId: context.requestId,
      startTime: context.startTime,
      providerType,
      route: context.path,
      model: terminal.resolvedModel,
      inboundRequest: {
        method: context.request.method,
        path: context.path,
        headers: context.request.headers,
        bodyText: inboundBody.text,
        bodyJson: inboundBody.json,
      },
      upstream: {
        id: terminal.upstream.id,
        name: terminal.upstream.name,
        providerType,
        baseUrl: upstreamForProxy.baseUrl,
      },
      outboundHeaders,
      response: {
        statusCode: terminal.result.statusCode,
        headers: terminal.result.headers,
        streamChunks: chunks,
      },
      outboundRequestSent: true,
      outboundResponseSource: "upstream",
      redactSensitive: context.trafficRecordingSettings.redactSensitive,
    });

    void recordTrafficFixture(fixture, {
      requestLogId,
      apiKeyId: context.apiKeyId,
      upstreamId: terminal.upstream.id,
      method: context.request.method,
      path: context.path,
      model: terminal.resolvedModel,
      statusCode: terminal.result.statusCode,
      outcome: "success",
    }).catch((error) =>
      log.error({ err: error, requestId: context.requestId }, "failed to record stream fixture")
    );
  } catch (error) {
    log.error({ err: error, requestId: context.requestId }, "failed to build stream fixture");
  }
}

function wrapStreamWithDownstreamSettlement(
  stream: ReadableStream<Uint8Array>,
  abortSignal: AbortSignal | undefined,
  onAbort: () => void,
  onComplete: () => void
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
            onComplete();
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
 * Adapt a successful upstream stream into the downstream SSE response and own
 * every post-dispatch terminal side effect exactly once.
 */
export function createStreamResponse(
  context: StreamLifecycleContext,
  terminal: StreamLifecycleTerminal
): Response {
  const originalStream = terminal.result.body as ReadableStream<Uint8Array>;
  let recordingStream: ReadableStream<Uint8Array> | null = null;
  let responseStream = originalStream;

  if (context.shouldRecordSuccess && context.inboundBody) {
    const [clientStream, recordStream] = teeStreamForRecording(originalStream);
    responseStream = clientStream;
    recordingStream = recordStream;
  }

  const metricsPromise =
    terminal.result.streamMetricsPromise ??
    Promise.resolve({
      usage: terminal.result.usage ?? null,
      effectiveServiceTier: terminal.result.effectiveServiceTier ?? null,
      ttftMs: terminal.result.ttftMs,
    });

  void metricsPromise
    .then(({ usage }) => {
      recordApiKeyTokenUsage(
        context.apiKeyId,
        usage?.totalTokens ?? 0,
        context.apiKeyTpmLimit ?? null
      );
    })
    .catch((error) =>
      log.error(
        { err: error, requestId: context.requestId },
        "failed to record settled stream API key token usage"
      )
    );

  const streamOutcomePromise: Promise<StreamOutcome> = terminal.result.streamFailurePromise
    ? Promise.race([
        metricsPromise.then((metrics) => ({ type: "metrics" as const, metrics })),
        terminal.result.streamFailurePromise.then((failure) => ({
          type: "failure" as const,
          failure,
        })),
      ])
    : metricsPromise.then((metrics) => ({ type: "metrics" as const, metrics }));
  let streamOutcome: StreamOutcome | null = null;
  let downstreamCompleted = false;

  const { promise: terminalOutcomePromise, resolve: resolveTerminalOutcome } =
    Promise.withResolvers<StreamTerminalOutcome>();
  const { promise: terminalSettlementPromise, resolve: resolveTerminalSettlement } =
    Promise.withResolvers<{
      outcome: StreamTerminalOutcome;
      requestLogId: string | null;
    }>();
  let terminalSettlement: Promise<void> | null = null;
  const recordingAbortController = new AbortController();
  const cancelRecording = () => {
    if (!recordingAbortController.signal.aborted) {
      recordingAbortController.abort();
    }
  };
  const cancelActiveStreams = (reason: string) => {
    terminal.result.cancelStream?.(reason);
    cancelRecording();
  };

  const settleOnce = (
    outcome: StreamTerminalOutcome,
    settle: () => Promise<void>
  ): Promise<void> => {
    if (terminalSettlement) {
      return terminalSettlement;
    }

    resolveTerminalOutcome(outcome);
    terminalSettlement = Promise.resolve()
      .then(settle)
      .catch((error) => {
        log.error(
          { err: error, requestId: context.requestId, outcome },
          "failed to settle streaming request"
        );
      })
      .then(() => {
        resolveTerminalSettlement({
          outcome,
          requestLogId: context.getRequestLogId(),
        });
      });
    return terminalSettlement;
  };

  const settleDisconnect = () => {
    if (!terminalSettlement) {
      cancelActiveStreams("Client disconnected");
    }
    return settleOnce("disconnect", async () => {
      const requestLogId = await persistTerminalRequestLog(
        context,
        buildDisconnectLogFields(context, terminal, Date.now() - context.startTime)
      );
      if (requestLogId) {
        await persistZeroUsageBilling(context, terminal, requestLogId);
      }
    });
  };

  const settleFailure = (failure: StreamRuntimeFailureSettlement) => {
    if (!terminalSettlement) {
      cancelActiveStreams("Stream failed");
    }
    return settleOnce("failure", async () => {
      const failureFields = buildFailureLogFields(
        context,
        terminal,
        failure,
        Date.now() - context.startTime
      );
      const requestLogId = await persistTerminalRequestLog(context, failureFields.fields);
      if (requestLogId) {
        await persistZeroUsageBilling(context, terminal, requestLogId);
      }
    });
  };

  const settleSuccess = (metrics: StreamMetrics) =>
    settleOnce("success", async () => {
      const usageForBilling = toBillingUsage(metrics.usage);
      const effectiveServiceTier = resolveEffectiveServiceTier(
        context.requestedServiceTier,
        metrics.effectiveServiceTier ?? terminal.result.effectiveServiceTier
      );

      if (context.sessionId && metrics.usage) {
        const affinityUsage: AffinityUsage = {
          totalInputTokens: computeAffinityTokens(context.matchedRouteCapability, metrics.usage),
        };
        affinityStore.updateCumulativeTokens(
          context.apiKeyId,
          context.matchedRouteCapability,
          context.sessionId,
          affinityUsage
        );
        log.debug(
          {
            requestId: context.requestId,
            sessionId: context.sessionId,
            upstreamId: terminal.upstream.id,
            tokens: affinityUsage,
          },
          "session affinity: updated cumulative tokens"
        );
      }

      const logFields = buildSuccessLogFields(
        context,
        terminal,
        metrics,
        usageForBilling,
        Date.now() - context.startTime
      );
      const requestLogId = await persistTerminalRequestLog(context, logFields);
      if (requestLogId) {
        await context.persistBillingSnapshot({
          requestLogId,
          apiKeyId: context.apiKeyId,
          upstreamId: terminal.upstream.id,
          model: terminal.resolvedModel,
          requestedServiceTier: context.requestedServiceTier,
          effectiveServiceTier,
          usage: usageForBilling,
          requestId: context.requestId,
        });
      }
    });

  const settleDownstreamCompletion = async (): Promise<void> => {
    if (terminalSettlement) {
      return;
    }
    downstreamCompleted = true;
    if (context.request.signal.aborted) {
      await settleDisconnect();
      return;
    }
    if (!streamOutcome) {
      return;
    }
    if (streamOutcome.type === "failure") {
      await settleFailure(streamOutcome.failure);
      return;
    }
    await settleSuccess(streamOutcome.metrics);
  };

  const settleStreamOutcome = (outcome: StreamOutcome) => {
    streamOutcome = outcome;
    if (outcome.type === "failure") {
      return settleFailure(outcome.failure);
    }
    if (context.request.signal.aborted) {
      return settleDisconnect();
    }
    if (downstreamCompleted) {
      return settleSuccess(outcome.metrics);
    }
    return undefined;
  };

  void streamOutcomePromise
    .then(settleStreamOutcome)
    .catch((error) =>
      log.error({ err: error, requestId: context.requestId }, "failed to settle stream outcome")
    );

  responseStream = wrapStreamWithDownstreamSettlement(
    responseStream,
    context.request.signal,
    () => {
      void settleDisconnect().catch((error) =>
        log.error(
          { err: error, requestId: context.requestId },
          "failed to settle downstream streaming disconnect"
        )
      );
    },
    () => {
      void settleDownstreamCompletion().catch((error) =>
        log.error(
          { err: error, requestId: context.requestId },
          "failed to settle downstream stream completion"
        )
      );
    }
  );

  if (recordingStream && context.inboundBody) {
    void readStreamChunks(recordingStream, recordingAbortController.signal)
      .then(async (chunks) => {
        const outcome = await terminalOutcomePromise;
        if (outcome !== "success") {
          return;
        }
        const requestLogId =
          context.getRequestLogId() ??
          (await terminalSettlementPromise).requestLogId ??
          (await context.awaitRequestLogReady());
        buildAndRecordSuccessFixture(context, terminal, context.inboundBody!, requestLogId, chunks);
      })
      .catch(async (error) => {
        const outcome = await terminalOutcomePromise;
        if (outcome !== "success") {
          return;
        }
        log.error({ err: error, requestId: context.requestId }, "failed to record stream fixture");
      });
  }

  const responseHeaders = new Headers(terminal.result.headers);
  responseHeaders.set("Content-Type", "text/event-stream");
  responseHeaders.set("Cache-Control", "no-cache");
  responseHeaders.set("Connection", "keep-alive");

  return new Response(responseStream, {
    status: terminal.result.statusCode,
    headers: responseHeaders,
  });
}
