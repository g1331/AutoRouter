import { describe, expect, it, vi, beforeEach } from "vitest";

import type { RoutingDecisionLog } from "@/types/api";
import type { StreamMetrics } from "@/lib/services/proxy-client";

const mocks = vi.hoisted(() => ({
  logRequest: vi.fn(async () => ({ id: "log-1" })),
  updateRequestLog: vi.fn(async () => ({ id: "log-1" })),
  readStreamChunks: vi.fn(async (stream?: ReadableStream<Uint8Array>) => {
    if (stream) {
      const reader = stream.getReader();
      await reader.read();
      await reader.cancel("recording test complete");
    }
    return ["data: captured\n\n"];
  }),
  buildFixture: vi.fn((params: unknown) => params),
  recordTrafficFixture: vi.fn(async () => "/tmp/fixture.json"),
  persistBillingSnapshot: vi.fn(async () => undefined),
  recordApiKeyTokenUsage: vi.fn(),
  updateCumulativeTokens: vi.fn(),
}));

vi.mock("@/lib/services/proxy-client", () => ({
  applyCompensationHeaders: vi.fn(() => []),
  filterHeaders: vi.fn(() => ({ filtered: {}, dropped: [] })),
  injectAuthHeader: vi.fn((headers: Record<string, string>) => headers),
  prepareUpstreamForProxy: vi.fn(
    (upstream: { id: string; name: string; providerType: string; baseUrl: string }) => ({
      id: upstream.id,
      name: upstream.name,
      providerType: upstream.providerType,
      baseUrl: upstream.baseUrl,
      apiKey: "decrypted-key",
      timeout: 60,
    })
  ),
}));

vi.mock("@/lib/services/request-logger", () => ({
  logRequest: mocks.logRequest,
  updateRequestLog: mocks.updateRequestLog,
}));

vi.mock("@/lib/services/traffic-recorder", () => ({
  buildFixture: mocks.buildFixture,
  readStreamChunks: mocks.readStreamChunks,
  recordTrafficFixture: mocks.recordTrafficFixture,
  teeStreamForRecording: (stream: ReadableStream<Uint8Array>) => stream.tee(),
}));

vi.mock("@/lib/services/session-affinity", () => ({
  affinityStore: {
    updateCumulativeTokens: mocks.updateCumulativeTokens,
  },
}));

vi.mock("@/lib/services/unified-error", () => ({
  getHttpStatusForError: vi.fn(() => 499),
}));

vi.mock("@/lib/services/api-key-rate-limiter", () => ({
  recordApiKeyTokenUsage: mocks.recordApiKeyTokenUsage,
}));

vi.mock("@/lib/utils/logger", () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return {
    createLogger: vi.fn(() => logger),
  };
});

vi.mock("@/app/api/proxy/v1/[...path]/proxy-execution", () => ({
  resolveUpstreamProvider: vi.fn(() => "openai"),
}));

const { createStreamResponse } =
  await import("@/app/api/proxy/v1/[...path]/proxy-stream-lifecycle");

type StreamLifecycleContext = Parameters<typeof createStreamResponse>[0];
type StreamLifecycleTerminal = Parameters<typeof createStreamResponse>[1];

const ROUTING_DECISION: RoutingDecisionLog = {
  original_model: "gpt-4.1",
  resolved_model: "gpt-4.1",
  model_redirect_applied: false,
  provider_type: "openai",
  routing_type: "tiered",
  candidates: [],
  excluded: [],
  candidate_count: 1,
  final_candidate_count: 1,
  selected_upstream_id: "upstream-1",
  selection_strategy: "weighted",
};

const UPSTREAM = {
  id: "upstream-1",
  name: "openai-main",
  providerType: "openai",
  baseUrl: "https://upstream.example/v1",
} as StreamLifecycleTerminal["upstream"];

function makeContext(signal: AbortSignal): StreamLifecycleContext {
  let requestLogId: string | null = "log-1";
  const request = new Request("http://localhost/api/proxy/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: "Bearer sk-test",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: "gpt-4.1", stream: true }),
    signal,
  });

  return {
    request,
    path: "chat/completions",
    requestId: "request-1",
    startTime: Date.now(),
    apiKeyId: "key-1",
    apiKeyTpmLimit: 10_000,
    apiKeySnapshot: {
      apiKeyName: "test-key",
      apiKeyPrefix: "sk-test",
      userId: null,
    },
    reasoningEffort: null,
    requestedServiceTier: "fast",
    thinkingConfig: null,
    sessionId: null,
    matchedRouteCapability: "openai_chat_compatible",
    inboundBody: {
      text: JSON.stringify({ model: "gpt-4.1", stream: true }),
      json: { model: "gpt-4.1", stream: true },
      buffer: null,
    },
    trafficRecordingSettings: { redactSensitive: true },
    shouldRecordSuccess: true,
    getCompensationHeaders: () => [],
    getQueueStatePersistence: vi.fn(async () => undefined),
    awaitRequestLogReady: vi.fn(async () => requestLogId),
    awaitRequestLogUpdate: vi.fn(async () => undefined),
    getRequestLogId: () => requestLogId,
    setRequestLogId: (value) => {
      requestLogId = value;
    },
    persistBillingSnapshot: mocks.persistBillingSnapshot,
  };
}

function makeTerminal(stream: ReadableStream<Uint8Array>): StreamLifecycleTerminal {
  return {
    result: {
      statusCode: 200,
      headers: new Headers({ "content-type": "text/event-stream" }),
      body: stream,
      isStream: true,
      cancelStream: vi.fn(),
      streamMetricsPromise: Promise.resolve({
        usage: {
          promptTokens: 7,
          completionTokens: 5,
          totalTokens: 12,
          cachedTokens: 0,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        },
        effectiveServiceTier: "standard",
        ttftMs: 42,
      }),
    },
    upstream: UPSTREAM,
    resolvedModel: "gpt-4.1",
    routingType: "tiered",
    priorityTier: 0,
    failoverHistory: [],
    routingDecision: ROUTING_DECISION,
    finalSelectionReason: null,
    affinityHit: false,
    affinityMigrated: false,
    sessionIdCompensated: false,
    headerDiff: null,
    routingDurationMs: 3,
  };
}

function makeFiniteStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.logRequest.mockResolvedValue({ id: "log-1" });
  mocks.updateRequestLog.mockResolvedValue({ id: "log-1" });
  mocks.readStreamChunks.mockImplementation(async (stream?: ReadableStream<Uint8Array>) => {
    if (stream) {
      const reader = stream.getReader();
      await reader.read();
      await reader.cancel("recording test complete");
    }
    return ["data: captured\n\n"];
  });
  mocks.recordTrafficFixture.mockResolvedValue("/tmp/fixture.json");
  mocks.persistBillingSnapshot.mockResolvedValue(undefined);
});

describe("createStreamResponse", () => {
  it("preserves SSE chunks and settles usage, log, billing, and recording once", async () => {
    const controller = new AbortController();
    const context = makeContext(controller.signal);
    const response = createStreamResponse(
      context,
      makeTerminal(makeFiniteStream(["data: first\n\n", "data: [DONE]\n\n"]))
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let body = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();

    expect(body).toBe("data: first\n\ndata: [DONE]\n\n");
    await expect.poll(() => mocks.persistBillingSnapshot.mock.calls.length).toBe(1);
    await expect.poll(() => mocks.recordTrafficFixture.mock.calls.length).toBe(1);

    expect(mocks.updateRequestLog).toHaveBeenCalledTimes(1);
    expect(mocks.updateRequestLog).toHaveBeenCalledWith(
      "log-1",
      expect.objectContaining({
        statusCode: 200,
        promptTokens: 7,
        completionTokens: 5,
        totalTokens: 12,
        effectiveServiceTier: "standard",
        isStream: true,
      })
    );
    expect(mocks.persistBillingSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        requestLogId: "log-1",
        requestedServiceTier: "fast",
        effectiveServiceTier: "standard",
        usage: expect.objectContaining({ totalTokens: 12 }),
      })
    );
    expect(mocks.recordApiKeyTokenUsage).toHaveBeenCalledWith("key-1", 12, 10_000);
    expect(mocks.recordApiKeyTokenUsage).toHaveBeenCalledTimes(1);
  });
  it("waits for downstream completion before settling stream success", async () => {
    const metrics = Promise.withResolvers<StreamMetrics>();
    const releaseStream = Promise.withResolvers<void>();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: first\n\n"));
      },
      pull(controller) {
        return releaseStream.promise.then(() => {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        });
      },
    });
    const terminal = makeTerminal(stream);
    terminal.result.streamMetricsPromise = metrics.promise;
    const response = createStreamResponse(makeContext(new AbortController().signal), terminal);
    const reader = response.body!.getReader();

    await expect(reader.read()).resolves.toEqual(expect.objectContaining({ done: false }));
    metrics.resolve({
      usage: {
        promptTokens: 7,
        completionTokens: 5,
        totalTokens: 12,
        cachedTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
      effectiveServiceTier: "standard",
      ttftMs: 42,
    });
    await Promise.resolve();
    expect(mocks.persistBillingSnapshot).not.toHaveBeenCalled();

    releaseStream.resolve();
    await expect(reader.read()).resolves.toEqual(expect.objectContaining({ done: false }));
    await expect(reader.read()).resolves.toEqual(expect.objectContaining({ done: true }));
    await expect.poll(() => mocks.persistBillingSnapshot.mock.calls.length).toBe(1);
  });

  it("settles downstream cancellation as non-success and skips success recording", async () => {
    const controller = new AbortController();
    const context = makeContext(controller.signal);
    let upstreamCancelled = false;
    const pendingStream = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(new TextEncoder().encode("data: partial\n\n"));
      },
      cancel() {
        upstreamCancelled = true;
      },
    });
    const terminal = makeTerminal(pendingStream);
    terminal.result.streamMetricsPromise = Promise.withResolvers<StreamMetrics>().promise;

    const response = createStreamResponse(context, terminal);
    const reader = response.body!.getReader();
    await expect(reader.read()).resolves.toEqual(expect.objectContaining({ done: false }));

    await reader.cancel("Client disconnected");

    await expect.poll(() => mocks.persistBillingSnapshot.mock.calls.length).toBe(1);
    expect(mocks.updateRequestLog).toHaveBeenCalledTimes(1);
    expect(mocks.updateRequestLog).toHaveBeenCalledWith(
      "log-1",
      expect.objectContaining({
        statusCode: 499,
        errorMessage: "Client disconnected during downstream streaming",
        effectiveServiceTier: null,
        isStream: true,
      })
    );
    expect(mocks.persistBillingSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      })
    );
    expect(mocks.buildFixture).not.toHaveBeenCalled();
    expect(mocks.recordTrafficFixture).not.toHaveBeenCalled();
    expect(terminal.result.cancelStream).toHaveBeenCalledWith("Client disconnected");
    expect(upstreamCancelled).toBe(true);
  });
});
