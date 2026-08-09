import type { Upstream } from "@/lib/db";
import {
  applyCompensationHeaders,
  filterHeaders,
  injectAuthHeader,
  prepareUpstreamForProxy,
  type CompensationHeader,
  type HeaderDiff,
  type ProxyResult,
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
  recordTrafficFixture,
  type BuildFixtureParams,
  type InboundBody,
} from "@/lib/services/traffic-recorder";
import type { TrafficRecordingSettingsValue } from "@/lib/services/traffic-recording-service";
import {
  affinityStore,
  commitAffinityBindingAfterSuccess,
  computeAffinityTokens,
  resolveAffinityFailureBindingState,
  type AffinityBindingExpectation,
} from "@/lib/services/session-affinity";
import { resolveUpstreamProvider } from "./proxy-execution";
import type {
  AffinityBindingState,
  EffectiveServiceTier,
  ReasoningEffort,
  RequestedServiceTier,
  RequestThinkingConfig,
  RoutingDecisionLog,
} from "@/types/api";
import type { RouteCapability } from "@/lib/route-capabilities";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("proxy-non-stream-lifecycle");

interface NonStreamApiKeySnapshot {
  apiKeyName: string | null;
  apiKeyPrefix: string | null;
  userId: string | null;
}

interface NonStreamBillingUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface NonStreamLifecycleContext {
  request: Request;
  path: string;
  requestId: string;
  startTime: number;
  apiKeyId: string;
  apiKeySnapshot: NonStreamApiKeySnapshot;
  reasoningEffort: ReasoningEffort | null;
  requestedServiceTier: RequestedServiceTier | null;
  thinkingConfig: RequestThinkingConfig | null;
  sessionId: string | null;
  matchedRouteCapability: RouteCapability;
  contentLength: number;
  affinityBindingExpectation: AffinityBindingExpectation | null;
  inboundBody: InboundBody | null;
  trafficRecordingSettings: Pick<TrafficRecordingSettingsValue, "redactSensitive">;
  shouldRecordSuccess: boolean;
  shouldRecordFailure: boolean;
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
    usage: NonStreamBillingUsage;
    requestId: string;
  }) => Promise<void>;
  settlement: {
    response: Response | null;
  };
}

export type NonStreamProxyResult = Omit<ProxyResult, "body" | "isStream"> & {
  body: Uint8Array;
  isStream: false;
};

interface NonStreamSuccessTerminal {
  outcome: "success";
  result: NonStreamProxyResult;
  upstream: Upstream;
  resolvedModel: string | null;
  effectiveServiceTier: EffectiveServiceTier | null;
  usage: TokenUsage | null;
  routingType: "tiered" | "direct" | "provider_type" | null;
  priorityTier: number | null;
  failoverHistory: FailoverAttempt[];
  routingDecision: RoutingDecisionLog;
  affinityHit: boolean;
  affinityMigrated: boolean;
  sessionIdCompensated: boolean;
  headerDiff: HeaderDiff | null;
  routingDurationMs: number | null;
}

interface NonStreamFailureFixtureUpstream {
  id: string;
  name: string;
  providerType: string;
  baseUrl: string;
}

export interface NonStreamFailureTerminal {
  outcome: "failure";
  response: Response;
  errorStatusCode: number;
  errorMessage: string;
  actualUpstreamId: string | null;
  resolvedModel: string | null;
  didSendUpstream: boolean;
  failoverHistory: FailoverAttempt[];
  routingDecision: RoutingDecisionLog;
  routingType: "tiered" | "direct" | "provider_type" | null;
  priorityTier: number | null;
  routingDurationMs: number | null;
  sessionIdCompensated: boolean;
  headerDiff: HeaderDiff | null;
  fixture?: {
    providerType: string;
    responseSource: "upstream" | "gateway";
    upstream: NonStreamFailureFixtureUpstream;
    outboundHeaders: Headers | Record<string, string>;
    response: {
      statusCode: number;
      headers: Headers | Record<string, string>;
      bodyText?: string | null;
      bodyJson?: unknown | null;
    };
    downstreamBody: unknown;
  };
}

type NonStreamTerminal = NonStreamSuccessTerminal | NonStreamFailureTerminal;
type NonStreamLogFields = Omit<LogRequestInput, "apiKeyId">;

function toBillingUsage(usage: TokenUsage | null): NonStreamBillingUsage {
  return {
    promptTokens: usage?.promptTokens || 0,
    completionTokens: usage?.completionTokens || 0,
    totalTokens: usage?.totalTokens || 0,
    cacheReadTokens: usage?.cacheReadTokens || 0,
    cacheWriteTokens: usage?.cacheCreationTokens || 0,
  };
}

function buildSuccessLogFields(
  context: NonStreamLifecycleContext,
  terminal: NonStreamSuccessTerminal,
  usageForBilling: NonStreamBillingUsage,
  durationMs: number,
  affinityBindingState: AffinityBindingState | null
): NonStreamLogFields {
  const { result } = terminal;
  return {
    ...context.apiKeySnapshot,
    upstreamId: terminal.upstream.id,
    method: context.request.method,
    path: context.path,
    model: terminal.resolvedModel,
    reasoningEffort: context.reasoningEffort,
    requestedServiceTier: context.requestedServiceTier,
    effectiveServiceTier: terminal.effectiveServiceTier,
    promptTokens: usageForBilling.promptTokens,
    completionTokens: usageForBilling.completionTokens,
    totalTokens: usageForBilling.totalTokens,
    cachedTokens: terminal.usage?.cachedTokens || 0,
    reasoningTokens: terminal.usage?.reasoningTokens || 0,
    cacheCreationTokens: terminal.usage?.cacheCreationTokens || 0,
    cacheCreation5mTokens: terminal.usage?.cacheCreation5mTokens || 0,
    cacheCreation1hTokens: terminal.usage?.cacheCreation1hTokens || 0,
    cacheReadTokens: terminal.usage?.cacheReadTokens || 0,
    statusCode: result.statusCode,
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
    affinityBindingState,
    isStream: false,
    routingDurationMs: terminal.routingDurationMs,
    sessionIdCompensated: terminal.sessionIdCompensated,
    headerDiff: terminal.headerDiff,
  };
}

function buildFailureLogFields(
  context: NonStreamLifecycleContext,
  terminal: NonStreamFailureTerminal,
  durationMs: number
): NonStreamLogFields {
  return {
    ...context.apiKeySnapshot,
    upstreamId: terminal.actualUpstreamId,
    method: context.request.method,
    path: context.path,
    model: terminal.resolvedModel,
    reasoningEffort: context.reasoningEffort,
    requestedServiceTier: context.requestedServiceTier,
    effectiveServiceTier: null,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    durationMs,
    routingDurationMs: terminal.routingDurationMs,
    errorMessage: terminal.errorMessage,
    routingType: terminal.routingType,
    priorityTier: terminal.priorityTier,
    failoverAttempts: terminal.failoverHistory.length,
    failoverHistory: terminal.failoverHistory.length > 0 ? terminal.failoverHistory : null,
    routingDecision: terminal.routingDecision,
    thinkingConfig: context.thinkingConfig,
    sessionId: context.sessionId,
    affinityHit: false,
    affinityBindingState: resolveAffinityFailureBindingState(context.affinityBindingExpectation),
    affinityMigrated: false,
    isStream: false,
    statusCode: terminal.errorStatusCode,
    sessionIdCompensated: terminal.sessionIdCompensated,
    headerDiff: terminal.headerDiff,
  };
}

async function persistTerminalRequestLog(
  context: NonStreamLifecycleContext,
  logFields: NonStreamLogFields
): Promise<string | null> {
  try {
    await context.getQueueStatePersistence();
    await context.awaitRequestLogReady();
    await context.awaitRequestLogUpdate();
  } catch (error) {
    log.error(
      { err: error, requestId: context.requestId },
      "failed to await non-stream request log"
    );
  }

  let requestLogId = context.getRequestLogId();
  try {
    if (requestLogId) {
      const updatedLog = await updateRequestLog(requestLogId, logFields);
      requestLogId = updatedLog?.id ?? requestLogId;
    } else {
      const createdLog = await logRequest({
        apiKeyId: context.apiKeyId,
        ...logFields,
      });
      requestLogId = createdLog.id;
    }
  } catch (error) {
    log.error(
      { err: error, requestId: context.requestId },
      "failed to settle non-stream request log"
    );
  }

  context.setRequestLogId(requestLogId);
  return requestLogId;
}
type NonStreamFixtureBuildInput = Omit<
  BuildFixtureParams,
  "requestId" | "startTime" | "route" | "inboundRequest" | "redactSensitive"
>;

interface NonStreamFixtureMetadata {
  upstreamId: string | null;
  statusCode: number;
  outcome: "success" | "failure";
}

function buildAndRecordNonStreamFixture(
  context: NonStreamLifecycleContext,
  inboundBody: InboundBody,
  requestLogId: string | null,
  input: NonStreamFixtureBuildInput,
  metadata: NonStreamFixtureMetadata
): void {
  const fixture = buildFixture({
    ...input,
    requestId: context.requestId,
    startTime: context.startTime,
    route: context.path,
    inboundRequest: {
      method: context.request.method,
      path: context.path,
      headers: context.request.headers,
      bodyText: inboundBody.text,
      bodyJson: inboundBody.json,
    },
    redactSensitive: context.trafficRecordingSettings.redactSensitive,
  });

  void recordTrafficFixture(fixture, {
    requestLogId,
    apiKeyId: context.apiKeyId,
    upstreamId: metadata.upstreamId,
    method: context.request.method,
    path: context.path,
    model: input.model,
    statusCode: metadata.statusCode,
    outcome: metadata.outcome,
  }).catch((error) =>
    log.error({ err: error, requestId: context.requestId }, "failed to record non-stream fixture")
  );
}

async function settleNonStreamSuccess(
  context: NonStreamLifecycleContext,
  terminal: NonStreamSuccessTerminal
): Promise<Response> {
  const bodyBytes = terminal.result.body;
  const durationMs = Date.now() - context.startTime;
  const usageForBilling = toBillingUsage(terminal.usage);
  const affinityBindingResult = commitAffinityBindingAfterSuccess({
    apiKeyId: context.apiKeyId,
    affinityScope: context.matchedRouteCapability,
    sessionId: context.sessionId,
    contentLength: context.contentLength,
    expectation: context.affinityBindingExpectation,
    selectedUpstreamId: terminal.upstream.id,
    affinityMigrated: terminal.affinityMigrated,
  });
  const affinityBindingState = affinityBindingResult.state;

  if (context.sessionId && affinityBindingResult.bindingMatchesSelection && terminal.usage) {
    affinityStore.updateCumulativeTokens(
      context.apiKeyId,
      context.matchedRouteCapability,
      context.sessionId,
      { totalInputTokens: computeAffinityTokens(context.matchedRouteCapability, terminal.usage) }
    );
  }

  const logFields = buildSuccessLogFields(
    context,
    terminal,
    usageForBilling,
    durationMs,
    affinityBindingState
  );
  const persistedLogId = await persistTerminalRequestLog(context, logFields);

  if (persistedLogId) {
    await context.persistBillingSnapshot({
      requestLogId: persistedLogId,
      apiKeyId: context.apiKeyId,
      upstreamId: terminal.upstream.id,
      model: terminal.resolvedModel,
      requestedServiceTier: context.requestedServiceTier,
      effectiveServiceTier: terminal.effectiveServiceTier,
      usage: usageForBilling,
      requestId: context.requestId,
    });
  }

  const inboundBody = context.inboundBody;
  if (context.shouldRecordSuccess && inboundBody) {
    try {
      const upstreamForProxy = prepareUpstreamForProxy(terminal.upstream);
      const outboundHeadersBase = filterHeaders(new Headers(context.request.headers)).filtered;
      applyCompensationHeaders(outboundHeadersBase, context.getCompensationHeaders());
      const outboundHeaders = injectAuthHeader(outboundHeadersBase, upstreamForProxy);
      const responseText = bodyBytes.length > 0 ? new TextDecoder().decode(bodyBytes) : null;
      let responseJson: unknown | null = null;
      if (responseText) {
        try {
          responseJson = JSON.parse(responseText);
        } catch {
          responseJson = null;
        }
      }

      buildAndRecordNonStreamFixture(
        context,
        inboundBody,
        persistedLogId,
        {
          providerType: resolveUpstreamProvider(terminal.upstream, context.matchedRouteCapability),
          model: terminal.resolvedModel,
          upstream: {
            id: terminal.upstream.id,
            name: terminal.upstream.name,
            providerType: resolveUpstreamProvider(
              terminal.upstream,
              context.matchedRouteCapability
            ),
            baseUrl: upstreamForProxy.baseUrl,
          },
          outboundHeaders,
          response: {
            statusCode: terminal.result.statusCode,
            headers: terminal.result.headers,
            bodyText: responseText,
            bodyJson: responseJson,
          },
          outboundRequestSent: true,
          outboundResponseSource: "upstream",
        },
        {
          upstreamId: terminal.upstream.id,
          statusCode: terminal.result.statusCode,
          outcome: "success",
        }
      );
    } catch (error) {
      log.error({ err: error, requestId: context.requestId }, "failed to build non-stream fixture");
    }
  }

  const response = new Response(Buffer.from(bodyBytes), {
    status: terminal.result.statusCode,
    headers: new Headers(terminal.result.headers),
  });
  context.settlement.response = response;
  return response;
}

async function settleNonStreamFailure(
  context: NonStreamLifecycleContext,
  terminal: NonStreamFailureTerminal
): Promise<Response> {
  const durationMs = Date.now() - context.startTime;
  const logFields = buildFailureLogFields(context, terminal, durationMs);
  const persistedLogId = await persistTerminalRequestLog(context, logFields);

  if (persistedLogId && terminal.didSendUpstream) {
    await context.persistBillingSnapshot({
      requestLogId: persistedLogId,
      apiKeyId: context.apiKeyId,
      upstreamId: terminal.actualUpstreamId,
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

  const inboundBody = context.inboundBody;
  const fixture = terminal.fixture;
  if (fixture && context.shouldRecordFailure && inboundBody && terminal.didSendUpstream) {
    try {
      buildAndRecordNonStreamFixture(
        context,
        inboundBody,
        persistedLogId,
        {
          providerType: fixture.providerType,
          model: terminal.resolvedModel,
          upstream: fixture.upstream,
          outboundHeaders: fixture.outboundHeaders,
          response: fixture.response,
          outboundRequestSent: true,
          outboundResponseSource: fixture.responseSource,
          downstreamResponse: {
            statusCode: terminal.errorStatusCode,
            headers: { "content-type": "application/json" },
            bodyJson: fixture.downstreamBody,
          },
          failoverHistory: terminal.failoverHistory.length > 0 ? terminal.failoverHistory : null,
        },
        {
          upstreamId: terminal.actualUpstreamId,
          statusCode: terminal.errorStatusCode,
          outcome: "failure",
        }
      );
    } catch (error) {
      log.error({ err: error, requestId: context.requestId }, "failed to build non-stream fixture");
    }
  }

  context.settlement.response = terminal.response;
  return terminal.response;
}

/**
 * Settle exactly one non-stream terminal state. The route owns authentication,
 * routing and upstream execution; this seam owns the response plus terminal log,
 * billing and recording side effects.
 */
export async function settleNonStreamRequest(
  context: NonStreamLifecycleContext,
  terminal: NonStreamTerminal
): Promise<Response> {
  if (context.settlement.response) {
    return context.settlement.response;
  }

  if (terminal.outcome === "success") {
    return settleNonStreamSuccess(context, terminal);
  }
  return settleNonStreamFailure(context, terminal);
}
