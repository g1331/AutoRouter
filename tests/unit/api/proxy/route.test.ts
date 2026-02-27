import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/auth", () => ({
  extractApiKey: vi.fn(() => "sk-test"),
  getKeyPrefix: vi.fn(() => "sk-test"),
  verifyApiKey: vi.fn(() => true),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      apiKeys: {
        findMany: vi.fn(),
      },
      apiKeyUpstreams: {
        findMany: vi.fn(),
      },
      upstreams: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      upstreamHealth: {
        findMany: vi.fn(),
      },
    },
  },
  apiKeys: {},
  apiKeyUpstreams: {},
  upstreams: {},
  upstreamHealth: {},
}));

vi.mock("@/lib/services/route-capability-migration", () => ({
  ensureRouteCapabilityMigration: vi.fn(async () => {}),
}));

vi.mock("@/lib/services/proxy-client", () => ({
  forwardRequest: vi.fn(),
  prepareUpstreamForProxy: vi.fn((upstream) => ({
    id: upstream.id,
    name: upstream.name,
    providerType: upstream.providerType,
    baseUrl: upstream.baseUrl,
    apiKey: "decrypted-key",
    timeout: upstream.timeout ?? 60,
  })),
  filterHeaders: vi.fn((headers: Headers) => ({
    filtered: Object.fromEntries(headers.entries()),
    dropped: [],
  })),
  injectAuthHeader: vi.fn((headers: Record<string, string>) => headers),
}));

vi.mock("@/lib/services/compensation-service", () => ({
  buildCompensations: vi.fn(async () => []),
  invalidateCache: vi.fn(),
}));

vi.mock("@/lib/services/request-logger", () => ({
  logRequest: vi.fn(),
  logRequestStart: vi.fn(async () => ({ id: "log-id" })),
  updateRequestLog: vi.fn(async () => ({})),
  extractTokenUsage: vi.fn(),
  extractModelName: vi.fn(),
}));

// Mock load-balancer module
vi.mock("@/lib/services/load-balancer", () => {
  const selectFromUpstreamCandidates = vi.fn();

  class NoHealthyUpstreamsError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "NoHealthyUpstreamsError";
    }
  }

  class NoAuthorizedUpstreamsError extends NoHealthyUpstreamsError {
    constructor(providerType: string) {
      super(`No authorized upstreams found for provider type: ${providerType}`);
      this.name = "NoAuthorizedUpstreamsError";
    }
  }

  return {
    selectFromProviderType: selectFromUpstreamCandidates,
    selectFromUpstreamCandidates,
    recordConnection: vi.fn(),
    releaseConnection: vi.fn(),
    NoHealthyUpstreamsError,
    NoAuthorizedUpstreamsError,
  };
});

// Mock health-checker module
vi.mock("@/lib/services/health-checker", () => ({
  markHealthy: vi.fn(),
  markUnhealthy: vi.fn(),
}));

// Mock circuit-breaker module
vi.mock("@/lib/services/circuit-breaker", () => {
  class CircuitBreakerOpenError extends Error {
    public readonly upstreamId: string;
    public readonly remainingSeconds: number;
    constructor(upstreamId: string, remainingSeconds: number) {
      super(`Circuit breaker is OPEN for upstream ${upstreamId}. Retry after ${remainingSeconds}s`);
      this.name = "CircuitBreakerOpenError";
      this.upstreamId = upstreamId;
      this.remainingSeconds = remainingSeconds;
    }
  }

  return {
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    CircuitBreakerOpenError,
  };
});

// Mock model-router module
vi.mock("@/lib/services/model-router", () => ({
  routeByModel: vi.fn(),
  NoUpstreamGroupError: class NoUpstreamGroupError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "NoUpstreamGroupError";
    }
  },
  NoHealthyUpstreamError: class NoHealthyUpstreamError extends Error {
    providerType: string;
    constructor(message: string, providerType: string = "openai") {
      super(message);
      this.name = "NoHealthyUpstreamError";
      this.providerType = providerType;
    }
  },
}));

vi.mock("@/lib/services/traffic-recorder", () => ({
  isRecorderEnabled: vi.fn(
    () => process.env.RECORDER_ENABLED === "true" || process.env.RECORDER_ENABLED === "1"
  ),
  shouldRecordFixture: vi.fn((outcome: "success" | "failure") => {
    const enabled = process.env.RECORDER_ENABLED === "true" || process.env.RECORDER_ENABLED === "1";
    if (!enabled) return false;
    const mode = (process.env.RECORDER_MODE ?? "all").trim().toLowerCase();
    return mode === "all" || mode === outcome;
  }),
  readRequestBody: vi.fn(async (request: Request) => {
    const text = await request.clone().text();
    if (!text) return { text: null, json: null, buffer: null };
    try {
      return { text, json: JSON.parse(text), buffer: null };
    } catch {
      return { text, json: null, buffer: null };
    }
  }),
  readStreamChunks: vi.fn(),
  teeStreamForRecording: vi.fn((stream: ReadableStream<Uint8Array>) => [stream, stream]),
  buildFixture: vi.fn((params) => params),
  recordTrafficFixture: vi.fn(async () => "/tmp/mock-fixture.json"),
}));

vi.mock("@/lib/utils/logger", () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  mockLogger.child.mockReturnValue(mockLogger);

  return {
    logger: mockLogger,
    createLogger: vi.fn(() => mockLogger),
    __mockLogger: mockLogger,
  };
});

describe("proxy route upstream selection", () => {
  const DEFAULT_ACTIVE_UPSTREAMS = [
    "up-codex",
    "up-openai",
    "up-anthropic",
    "up-anthropic-1",
    "up-anthropic-2",
    "up-anthropic-3",
    "up-route",
    "up-attempt",
    "up-1",
    "up-authorized-other",
    "up-first",
    "up-second",
    "up-stream-fail",
    "up-fallback-ok",
    "up-tier0",
    "up-tier1",
    "up-duck",
    "up-privnode",
    "up-rightcode",
    "up-other",
  ].map((id) => ({
    id,
    name: id,
    providerType: "openai",
    routeCapabilities: ["anthropic_messages", "openai_chat_compatible", "codex_responses"],
    baseUrl: `https://${id}.example.com`,
    isDefault: false,
    isActive: true,
    timeout: 60,
    priority: 0,
    weight: 1,
  }));

  let POST: (
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();
    delete process.env.RECORDER_ENABLED;
    delete process.env.RECORDER_MODE;
    const routeModule = await import("@/app/api/proxy/v1/[...path]/route");
    const { db } = await import("@/lib/db");
    POST = routeModule.POST;
    vi.mocked(db.query.upstreams.findMany).mockResolvedValue(DEFAULT_ACTIVE_UPSTREAMS);
    vi.mocked(db.query.upstreamHealth.findMany).mockResolvedValue([]);
  }, 30_000);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should route path capability request without model when route is matched", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest, prepareUpstreamForProxy } = await import("@/lib/services/proxy-client");
    const { routeByModel } = await import("@/lib/services/model-router");
    const { selectFromProviderType } = await import("@/lib/services/load-balancer");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-codex" },
    ]);
    vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
      {
        id: "up-codex",
        name: "codex-upstream",
        providerType: "openai",
        baseUrl: "https://api.openai.com",
        isDefault: false,
        isActive: true,
        timeout: 60,
        priority: 0,
        weight: 1,
        routeCapabilities: ["codex_responses"],
      },
    ]);
    vi.mocked(db.query.upstreamHealth.findMany).mockResolvedValueOnce([]);

    const codexUpstream = {
      id: "up-codex",
      name: "codex-upstream",
      providerType: "openai",
      baseUrl: "https://api.openai.com",
      isDefault: false,
      isActive: true,
      timeout: 60,
      priority: 0,
      weight: 1,
    };

    vi.mocked(selectFromProviderType).mockResolvedValueOnce({
      upstream: codexUpstream,
      providerType: "openai",
      selectedTier: 0,
      circuitBreakerFiltered: 0,
      totalCandidates: 1,
    });

    vi.mocked(forwardRequest).mockResolvedValueOnce({
      statusCode: 200,
      headers: new Headers(),
      body: new Uint8Array(),
      isStream: false,
      usage: null,
    });

    const request = new NextRequest("http://localhost/api/proxy/v1/responses", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input: "hello",
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ path: ["responses"] }),
    });

    expect(response.status).toBe(200);
    expect(routeByModel).not.toHaveBeenCalled();
    expect(selectFromProviderType).toHaveBeenCalledWith(["up-codex"], undefined, undefined);
    expect(prepareUpstreamForProxy).toHaveBeenCalledWith(codexUpstream);
  });

  it("should return no-upstream-configured error when matched path has no capability candidates", async () => {
    const { db } = await import("@/lib/db");
    const { routeByModel } = await import("@/lib/services/model-router");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const __mockLogger = (
      (await import("@/lib/utils/logger")) as unknown as {
        __mockLogger: { warn: ReturnType<typeof vi.fn> };
      }
    ).__mockLogger;

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-other" },
    ]);
    vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
      {
        id: "up-other",
        name: "other-upstream",
        providerType: "openai",
        baseUrl: "https://api.openai.com",
        isDefault: false,
        isActive: true,
        timeout: 60,
        priority: 0,
        weight: 1,
        routeCapabilities: ["openai_chat_compatible"],
      },
    ]);
    vi.mocked(db.query.upstreamHealth.findMany).mockResolvedValueOnce([]);

    const request = new NextRequest("http://localhost/api/proxy/v1/responses", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input: "hello",
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ path: ["responses"] }),
    });
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data).toEqual({
      error: expect.objectContaining({
        code: "NO_UPSTREAMS_CONFIGURED",
        reason: "NO_HEALTHY_CANDIDATES",
        did_send_upstream: false,
      }),
    });
    expect(routeByModel).not.toHaveBeenCalled();
    expect(forwardRequest).not.toHaveBeenCalled();
    expect(__mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "responses",
        matchedRouteCapability: "codex_responses",
        capabilityCandidatesCount: 0,
      }),
      "no upstream supports matched route capability"
    );
  });

  it("should return no-upstream-configured error when path is not matched", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { routeByModel } = await import("@/lib/services/model-router");
    const __mockLogger = (
      (await import("@/lib/utils/logger")) as unknown as {
        __mockLogger: { warn: ReturnType<typeof vi.fn> };
      }
    ).__mockLogger;
    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);

    const request = new NextRequest("http://localhost/api/proxy/v1/custom/not-matched", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        input: "hello",
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ path: ["custom", "not-matched"] }),
    });
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data).toEqual({
      error: expect.objectContaining({
        code: "NO_UPSTREAMS_CONFIGURED",
        reason: "NO_HEALTHY_CANDIDATES",
        did_send_upstream: false,
      }),
    });
    expect(routeByModel).not.toHaveBeenCalled();
    expect(forwardRequest).not.toHaveBeenCalled();
    expect(__mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "custom/not-matched",
        matchedRouteCapability: null,
      }),
      "path capability not matched, skipping upstream routing"
    );
  });

  it("should route messages requests to anthropic upstream when available", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest, prepareUpstreamForProxy } = await import("@/lib/services/proxy-client");
    const { routeByModel } = await import("@/lib/services/model-router");
    const { selectFromProviderType } = await import("@/lib/services/load-balancer");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-openai" },
      { upstreamId: "up-anthropic" },
    ]);

    const anthropicUpstream = {
      id: "up-anthropic",
      name: "anthropic-one",
      providerType: "anthropic",
      baseUrl: "https://api.anthropic.com",
      isDefault: false,
      isActive: true,
      timeout: 60,
    };

    vi.mocked(routeByModel).mockResolvedValueOnce({
      upstream: anthropicUpstream,
      providerType: "anthropic",
      resolvedModel: "claude-test",
      candidateUpstreams: [],
      excludedUpstreams: [],
      routingDecision: {
        originalModel: "claude-test",
        resolvedModel: "claude-test",
        providerType: "anthropic",
        upstreamName: "anthropic-one",
        allowedModelsFilter: false,
        modelRedirectApplied: false,
        circuitBreakerFilter: false,
        routingType: "provider_type",
        candidateCount: 1,
        finalCandidateCount: 1,
      },
    });

    // forwardWithFailover calls selectFromProviderType internally
    vi.mocked(selectFromProviderType).mockResolvedValueOnce({
      upstream: anthropicUpstream,
      providerType: "anthropic",
      selectedTier: 0,
      circuitBreakerFiltered: 0,

      totalCandidates: 1,
    });

    vi.mocked(forwardRequest).mockResolvedValue({
      statusCode: 200,
      headers: new Headers(),
      body: new Uint8Array(),
      isStream: false,
      usage: null,
    });

    const request = new NextRequest("http://localhost/api/proxy/v1/messages", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-test",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["v1", "messages"] }) });

    expect(response.status).toBe(200);
    expect(prepareUpstreamForProxy).toHaveBeenCalledWith(anthropicUpstream);
    expect(forwardRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ providerType: "anthropic" }),
      "v1/messages",
      expect.any(String),
      expect.any(Array)
    );
  });

  it("should perform failover with circuit breaker when first upstream fails", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest, prepareUpstreamForProxy } = await import("@/lib/services/proxy-client");
    const { routeByModel } = await import("@/lib/services/model-router");
    const { selectFromProviderType } = await import("@/lib/services/load-balancer");
    const { markHealthy, markUnhealthy } = await import("@/lib/services/health-checker");
    const { recordSuccess, recordFailure } = await import("@/lib/services/circuit-breaker");
    const { updateRequestLog } = await import("@/lib/services/request-logger");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-anthropic-1" },
      { upstreamId: "up-anthropic-2" },
    ]);

    const failingUpstream = {
      id: "up-anthropic-1",
      name: "anthropic-1",
      providerType: "anthropic",
      baseUrl: "https://api.anthropic.com",
      isDefault: false,
      isActive: true,
      timeout: 60,
    };

    const healthyUpstream = {
      id: "up-anthropic-2",
      name: "anthropic-2",
      providerType: "anthropic",
      baseUrl: "https://api.anthropic.com",
      isDefault: false,
      isActive: true,
      timeout: 60,
    };

    vi.mocked(routeByModel).mockResolvedValueOnce({
      upstream: failingUpstream,
      providerType: "anthropic",
      resolvedModel: "claude-test",
      candidateUpstreams: [],
      excludedUpstreams: [],
      routingDecision: {
        originalModel: "claude-test",
        resolvedModel: "claude-test",
        providerType: "anthropic",
        upstreamName: "anthropic-1",
        allowedModelsFilter: false,
        modelRedirectApplied: false,
        circuitBreakerFilter: false,
        routingType: "provider_type",
        candidateCount: 2,
        finalCandidateCount: 2,
      },
    });

    // First call selects failing upstream, second call selects healthy upstream
    vi.mocked(selectFromProviderType)
      .mockResolvedValueOnce({
        upstream: failingUpstream,
        providerType: "anthropic",
        selectedTier: 0,
        circuitBreakerFiltered: 0,

        totalCandidates: 2,
      })
      .mockResolvedValueOnce({
        upstream: healthyUpstream,
        providerType: "anthropic",
        selectedTier: 0,
        circuitBreakerFiltered: 0,

        totalCandidates: 2,
      });

    // First request returns 500, second succeeds
    vi.mocked(forwardRequest)
      .mockResolvedValueOnce({
        statusCode: 500,
        headers: new Headers(),
        body: new Uint8Array(),
        isStream: false,
        usage: null,
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: new Headers(),
        body: new Uint8Array(),
        isStream: false,
        usage: null,
      });

    const request = new NextRequest("http://localhost/api/proxy/v1/messages", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-test",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["v1", "messages"] }) });

    expect(response.status).toBe(200);

    // First upstream was tried, failed, and marked unhealthy
    expect(markUnhealthy).toHaveBeenCalledWith("up-anthropic-1", "HTTP 500 error");
    expect(recordFailure).toHaveBeenCalledWith("up-anthropic-1", "http_500");

    // Second upstream was tried and succeeded
    expect(markHealthy).toHaveBeenCalledWith("up-anthropic-2", 100);
    expect(recordSuccess).toHaveBeenCalledWith("up-anthropic-2");

    // selectFromProviderType was called twice - first without exclusions, second with failed upstream excluded
    // Both calls include allowedUpstreamIds from API key authorization
    expect(selectFromProviderType).toHaveBeenCalledTimes(2);
    expect(selectFromProviderType).toHaveBeenNthCalledWith(
      1,
      ["up-anthropic-1", "up-anthropic-2"],
      undefined,
      undefined
    );
    expect(selectFromProviderType).toHaveBeenNthCalledWith(
      2,
      ["up-anthropic-1", "up-anthropic-2"],
      ["up-anthropic-1"],
      undefined
    );

    expect(forwardRequest).toHaveBeenCalledTimes(2);
    expect(prepareUpstreamForProxy).toHaveBeenCalledWith(healthyUpstream);
    expect(updateRequestLog).toHaveBeenCalled();
    const updateLogPayload = vi.mocked(updateRequestLog).mock.calls.at(-1)?.[1];
    expect(updateLogPayload?.routingDecision).toEqual(
      expect.objectContaining({
        candidate_upstream_id: "up-anthropic-2",
        actual_upstream_id: "up-anthropic-2",
      })
    );
  });

  it("should return 503 when circuit breaker is open for all upstreams", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { routeByModel } = await import("@/lib/services/model-router");
    const { selectFromProviderType, NoHealthyUpstreamsError } =
      await import("@/lib/services/load-balancer");
    const { updateRequestLog } = await import("@/lib/services/request-logger");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-anthropic-1" },
      { upstreamId: "up-anthropic-2" },
    ]);

    const upstream1 = {
      id: "up-anthropic-1",
      name: "anthropic-1",
      providerType: "anthropic",
      baseUrl: "https://api.anthropic.com",
      isDefault: false,
      isActive: true,
      timeout: 60,
    };

    vi.mocked(routeByModel).mockResolvedValueOnce({
      upstream: upstream1,
      providerType: "anthropic",
      resolvedModel: "claude-test",
      candidateUpstreams: [],
      excludedUpstreams: [],
      routingDecision: {
        originalModel: "claude-test",
        resolvedModel: "claude-test",
        providerType: "anthropic",
        upstreamName: "anthropic-1",
        allowedModelsFilter: false,
        modelRedirectApplied: false,
        circuitBreakerFilter: false,
        routingType: "provider_type",
        candidateCount: 2,
        finalCandidateCount: 2,
      },
    });

    // Simulate no healthy upstreams (all circuit breakers open)
    vi.mocked(selectFromProviderType).mockRejectedValueOnce(
      new NoHealthyUpstreamsError("No healthy upstreams available for provider type: anthropic")
    );

    const request = new NextRequest("http://localhost/api/proxy/v1/messages", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-test",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["v1", "messages"] }) });
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data).toEqual({
      error: expect.objectContaining({
        message: "\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5",
        type: "service_unavailable",
        code: "ALL_UPSTREAMS_UNAVAILABLE",
        reason: "NO_HEALTHY_CANDIDATES",
        did_send_upstream: false,
      }),
    });
    expect(data.error.request_id).toEqual(expect.any(String));
    expect(forwardRequest).not.toHaveBeenCalled();
    expect(updateRequestLog).toHaveBeenCalled();
    const updateLogPayload = vi.mocked(updateRequestLog).mock.calls.at(-1)?.[1];
    expect(updateLogPayload?.routingDecision).toEqual(
      expect.objectContaining({
        failure_stage: "candidate_selection",
      })
    );
  });

  it("should record failure fixture when upstreams are unavailable and recorder is enabled", async () => {
    process.env.RECORDER_ENABLED = "true";

    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { routeByModel } = await import("@/lib/services/model-router");
    const { selectFromProviderType, NoHealthyUpstreamsError } =
      await import("@/lib/services/load-balancer");
    const { buildFixture, recordTrafficFixture } = await import("@/lib/services/traffic-recorder");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([{ upstreamId: "up-1" }]);

    const routeByModelUpstream = {
      id: "up-route",
      name: "anthropic-route",
      providerType: "anthropic",
      baseUrl: "https://api.route-anthropic.com",
      isDefault: false,
      isActive: true,
      timeout: 60,
    };

    const attemptedUpstream = {
      id: "up-attempt",
      name: "anthropic-attempt",
      providerType: "anthropic",
      baseUrl: "https://api.attempt-anthropic.com",
      isDefault: false,
      isActive: true,
      timeout: 60,
    };

    vi.mocked(routeByModel).mockResolvedValueOnce({
      upstream: routeByModelUpstream,
      providerType: "anthropic",
      resolvedModel: "claude-test",
      candidateUpstreams: [],
      excludedUpstreams: [],
      routingDecision: {
        originalModel: "claude-test",
        resolvedModel: "claude-test",
        providerType: "anthropic",
        upstreamName: "anthropic-1",
        allowedModelsFilter: false,
        modelRedirectApplied: false,
        circuitBreakerFilter: false,
        routingType: "provider_type",
        candidateCount: 1,
        finalCandidateCount: 1,
      },
    });

    vi.mocked(selectFromProviderType)
      .mockResolvedValueOnce({
        upstream: attemptedUpstream,
        providerType: "anthropic",
        selectedTier: 0,
        circuitBreakerFiltered: 0,
        totalCandidates: 1,
      })
      .mockRejectedValueOnce(new NoHealthyUpstreamsError("No healthy upstreams available"));

    vi.mocked(forwardRequest).mockResolvedValueOnce({
      statusCode: 500,
      headers: new Headers({ "content-type": "application/json", "x-upstream-trace": "trace-1" }),
      body: new TextEncoder().encode(
        JSON.stringify({ error: { type: "server_error", message: "upstream failed once" } })
      ),
      isStream: false,
      usage: null,
    });

    const request = new NextRequest("http://localhost/api/proxy/v1/messages", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-test",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["v1", "messages"] }) });
    expect(response.status).toBe(503);

    expect(buildFixture).toHaveBeenCalledTimes(1);
    const fixtureParams = vi.mocked(buildFixture).mock.calls[0][0];
    expect(fixtureParams.upstream.id).toBe("up-attempt");
    expect(fixtureParams.upstream.name).toBe("anthropic-attempt");
    expect(fixtureParams.upstream.baseUrl).toBe("https://api.attempt-anthropic.com");
    expect(fixtureParams.response.bodyJson).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ message: "upstream failed once" }),
      })
    );
    expect(fixtureParams.downstreamResponse).toEqual(
      expect.objectContaining({
        statusCode: 503,
        headers: { "content-type": "application/json" },
        bodyJson: {
          error: expect.objectContaining({
            message: "服务暂时不可用，请稍后重试",
            type: "service_unavailable",
            code: "ALL_UPSTREAMS_UNAVAILABLE",
            reason: "UPSTREAM_HTTP_ERROR",
            did_send_upstream: true,
          }),
        },
      })
    );
    expect(fixtureParams.downstreamResponse.bodyJson.error.request_id).toEqual(expect.any(String));
    expect(fixtureParams.response.statusCode).toBe(500);
    const failoverHistory = fixtureParams.failoverHistory as
      | Array<{
          status_code?: number | null;
          response_headers?: Record<string, string>;
          response_body_json?: unknown;
        }>
      | undefined;
    expect(Array.isArray(failoverHistory)).toBe(true);
    expect(failoverHistory).toHaveLength(1);
    expect(failoverHistory?.[0]?.status_code).toBe(500);
    expect(failoverHistory?.[0]).not.toHaveProperty("outbound_request_headers");
    expect(failoverHistory?.[0]?.response_headers).toEqual(
      expect.objectContaining({ "content-type": "application/json", "x-upstream-trace": "trace-1" })
    );
    expect(failoverHistory?.[0]?.response_body_json).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ message: "upstream failed once" }),
      })
    );

    expect(recordTrafficFixture).toHaveBeenCalledTimes(1);
  });

  it("should not inject upstream auth headers when request was never sent upstream", async () => {
    process.env.RECORDER_ENABLED = "true";

    const { db } = await import("@/lib/db");
    const { forwardRequest, injectAuthHeader } = await import("@/lib/services/proxy-client");
    const { routeByModel } = await import("@/lib/services/model-router");
    const { selectFromProviderType, NoAuthorizedUpstreamsError } =
      await import("@/lib/services/load-balancer");
    const { buildFixture, recordTrafficFixture } = await import("@/lib/services/traffic-recorder");

    const routedUpstream = {
      id: "up-route",
      name: "route-only",
      providerType: "openai",
      baseUrl: "https://route-only.example/v1",
      isDefault: false,
      isActive: true,
      timeout: 60,
    };

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-authorized-other" },
    ]);
    vi.mocked(routeByModel).mockResolvedValueOnce({
      upstream: routedUpstream,
      providerType: "openai",
      resolvedModel: "gpt-5.2",
      candidateUpstreams: [routedUpstream],
      excludedUpstreams: [],
      routingDecision: {
        originalModel: "gpt-5.2",
        resolvedModel: "gpt-5.2",
        providerType: "openai",
        upstreamName: routedUpstream.name,
        allowedModelsFilter: false,
        modelRedirectApplied: false,
        circuitBreakerFilter: false,
        routingType: "provider_type",
        candidateCount: 1,
        finalCandidateCount: 1,
      },
    });
    vi.mocked(selectFromProviderType).mockRejectedValueOnce(
      new NoAuthorizedUpstreamsError("openai")
    );

    const request = new NextRequest("http://localhost/api/proxy/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ path: ["v1", "chat", "completions"] }),
    });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data).toEqual({
      error: expect.objectContaining({
        code: "NO_AUTHORIZED_UPSTREAMS",
        reason: "NO_AUTHORIZED_UPSTREAMS",
        did_send_upstream: false,
      }),
    });
    expect(forwardRequest).not.toHaveBeenCalled();
    expect(injectAuthHeader).not.toHaveBeenCalled();
    expect(db.query.upstreams.findFirst).not.toHaveBeenCalled();

    expect(buildFixture).toHaveBeenCalledTimes(1);
    const fixtureParams = vi.mocked(buildFixture).mock.calls[0][0];
    expect(fixtureParams.upstream).toEqual(
      expect.objectContaining({
        id: "unknown",
        name: "not-sent",
      })
    );
    expect(fixtureParams.outboundHeaders).toEqual({});
    expect(fixtureParams.outboundRequestSent).toBe(false);
    expect(recordTrafficFixture).toHaveBeenCalledTimes(1);
  });

  it("should classify downstream disconnect as CLIENT_DISCONNECTED reason", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { routeByModel } = await import("@/lib/services/model-router");
    const { selectFromProviderType } = await import("@/lib/services/load-balancer");

    const upstream = {
      id: "up-openai",
      name: "openai-main",
      providerType: "openai",
      baseUrl: "https://api.openai.com/v1",
      isDefault: false,
      isActive: true,
      timeout: 60,
    };

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: upstream.id },
    ]);
    vi.mocked(routeByModel).mockResolvedValueOnce({
      upstream,
      providerType: "openai",
      resolvedModel: "gpt-5.2",
      candidateUpstreams: [upstream],
      excludedUpstreams: [],
      routingDecision: {
        originalModel: "gpt-5.2",
        resolvedModel: "gpt-5.2",
        providerType: "openai",
        upstreamName: upstream.name,
        allowedModelsFilter: false,
        modelRedirectApplied: false,
        circuitBreakerFilter: false,
        routingType: "provider_type",
        candidateCount: 1,
        finalCandidateCount: 1,
      },
    });
    vi.mocked(selectFromProviderType).mockResolvedValueOnce({
      upstream,
      providerType: "openai",
      selectedTier: 0,
      circuitBreakerFiltered: 0,
      totalCandidates: 1,
    });

    const abortController = new AbortController();
    vi.mocked(forwardRequest).mockImplementationOnce(async () => {
      abortController.abort();
      throw new Error("simulated downstream disconnect");
    });

    const request = new NextRequest("http://localhost/api/proxy/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: abortController.signal,
    });

    const response = await POST(request, {
      params: Promise.resolve({ path: ["v1", "chat", "completions"] }),
    });
    const data = await response.json();

    expect(response.status).toBe(499);
    expect(data).toEqual({
      error: expect.objectContaining({
        code: "CLIENT_DISCONNECTED",
        reason: "CLIENT_DISCONNECTED",
        did_send_upstream: true,
      }),
    });
    expect(data.error.user_hint).toContain("调用方连接已中断");
    expect(data.error.request_id).toEqual(expect.any(String));
  });

  it("should preserve did_send_upstream when disconnect happens between retries", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { routeByModel } = await import("@/lib/services/model-router");
    const { selectFromProviderType } = await import("@/lib/services/load-balancer");
    const { updateRequestLog } = await import("@/lib/services/request-logger");

    const firstUpstream = {
      id: "up-first",
      name: "primary",
      providerType: "openai",
      baseUrl: "https://primary.example/v1",
      isDefault: false,
      isActive: true,
      timeout: 60,
    };

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: firstUpstream.id },
      { upstreamId: "up-second" },
    ]);
    vi.mocked(routeByModel).mockResolvedValueOnce({
      upstream: firstUpstream,
      providerType: "openai",
      resolvedModel: "gpt-5.2",
      candidateUpstreams: [firstUpstream],
      excludedUpstreams: [],
      routingDecision: {
        originalModel: "gpt-5.2",
        resolvedModel: "gpt-5.2",
        providerType: "openai",
        upstreamName: firstUpstream.name,
        allowedModelsFilter: false,
        modelRedirectApplied: false,
        circuitBreakerFilter: false,
        routingType: "provider_type",
        candidateCount: 2,
        finalCandidateCount: 2,
      },
    });
    vi.mocked(selectFromProviderType).mockResolvedValueOnce({
      upstream: firstUpstream,
      providerType: "openai",
      selectedTier: 0,
      circuitBreakerFiltered: 0,
      totalCandidates: 2,
    });

    const abortController = new AbortController();
    vi.mocked(forwardRequest).mockImplementationOnce(async () => {
      abortController.abort();
      return {
        statusCode: 500,
        headers: new Headers({ "content-type": "application/json" }),
        body: new TextEncoder().encode(JSON.stringify({ error: { message: "temporary failure" } })),
        isStream: false,
        usage: null,
      };
    });

    const request = new NextRequest("http://localhost/api/proxy/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: abortController.signal,
    });

    const response = await POST(request, {
      params: Promise.resolve({ path: ["v1", "chat", "completions"] }),
    });
    const data = await response.json();

    expect(response.status).toBe(499);
    expect(data).toEqual({
      error: expect.objectContaining({
        code: "CLIENT_DISCONNECTED",
        reason: "CLIENT_DISCONNECTED",
        did_send_upstream: true,
      }),
    });
    expect(forwardRequest).toHaveBeenCalledTimes(1);
    expect(selectFromProviderType).toHaveBeenCalledTimes(1);
    expect(updateRequestLog).toHaveBeenCalled();
    const updateLogPayload = vi.mocked(updateRequestLog).mock.calls.at(-1)?.[1];
    expect(updateLogPayload?.upstreamId).toBe("up-first");
    expect(updateLogPayload?.routingDecision).toEqual(
      expect.objectContaining({
        actual_upstream_id: "up-first",
        did_send_upstream: true,
      })
    );
  });

  it("should skip failure fixture when RECORDER_MODE is success", async () => {
    process.env.RECORDER_ENABLED = "true";
    process.env.RECORDER_MODE = "success";

    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { routeByModel } = await import("@/lib/services/model-router");
    const { selectFromProviderType, NoHealthyUpstreamsError } =
      await import("@/lib/services/load-balancer");
    const { buildFixture, recordTrafficFixture } = await import("@/lib/services/traffic-recorder");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([{ upstreamId: "up-1" }]);

    const routeByModelUpstream = {
      id: "up-route",
      name: "anthropic-route",
      providerType: "anthropic",
      baseUrl: "https://api.route-anthropic.com",
      isDefault: false,
      isActive: true,
      timeout: 60,
    };

    const attemptedUpstream = {
      id: "up-attempt",
      name: "anthropic-attempt",
      providerType: "anthropic",
      baseUrl: "https://api.attempt-anthropic.com",
      isDefault: false,
      isActive: true,
      timeout: 60,
    };

    vi.mocked(routeByModel).mockResolvedValueOnce({
      upstream: routeByModelUpstream,
      providerType: "anthropic",
      resolvedModel: "claude-test",
      candidateUpstreams: [],
      excludedUpstreams: [],
      routingDecision: {
        originalModel: "claude-test",
        resolvedModel: "claude-test",
        providerType: "anthropic",
        upstreamName: "anthropic-1",
        allowedModelsFilter: false,
        modelRedirectApplied: false,
        circuitBreakerFilter: false,
        routingType: "provider_type",
        candidateCount: 1,
        finalCandidateCount: 1,
      },
    });

    vi.mocked(selectFromProviderType)
      .mockResolvedValueOnce({
        upstream: attemptedUpstream,
        providerType: "anthropic",
        selectedTier: 0,
        circuitBreakerFiltered: 0,
        totalCandidates: 1,
      })
      .mockRejectedValueOnce(new NoHealthyUpstreamsError("No healthy upstreams available"));

    vi.mocked(forwardRequest).mockResolvedValueOnce({
      statusCode: 500,
      headers: new Headers({ "content-type": "application/json" }),
      body: new TextEncoder().encode(
        JSON.stringify({ error: { type: "server_error", message: "upstream failed once" } })
      ),
      isStream: false,
      usage: null,
    });

    const request = new NextRequest("http://localhost/api/proxy/v1/messages", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-test",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["v1", "messages"] }) });
    expect(response.status).toBe(503);
    expect(buildFixture).not.toHaveBeenCalled();
    expect(recordTrafficFixture).not.toHaveBeenCalled();
  });

  it("should record success fixture when RECORDER_MODE is success", async () => {
    process.env.RECORDER_ENABLED = "true";
    process.env.RECORDER_MODE = "success";

    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { routeByModel } = await import("@/lib/services/model-router");
    const { selectFromProviderType } = await import("@/lib/services/load-balancer");
    const { buildFixture, recordTrafficFixture } = await import("@/lib/services/traffic-recorder");

    const upstream = {
      id: "up-openai",
      name: "openai-main",
      providerType: "openai",
      baseUrl: "https://api.openai.com/v1",
      isDefault: false,
      isActive: true,
      timeout: 60,
    };

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: upstream.id },
    ]);
    vi.mocked(routeByModel).mockResolvedValueOnce({
      upstream,
      providerType: "openai",
      resolvedModel: "gpt-4o-mini",
      candidateUpstreams: [upstream],
      excludedUpstreams: [],
      routingDecision: {
        originalModel: "gpt-4o-mini",
        resolvedModel: "gpt-4o-mini",
        providerType: "openai",
        upstreamName: upstream.name,
        allowedModelsFilter: false,
        modelRedirectApplied: false,
        circuitBreakerFilter: false,
        routingType: "provider_type",
        candidateCount: 1,
        finalCandidateCount: 1,
      },
    });
    vi.mocked(selectFromProviderType).mockResolvedValueOnce({
      upstream,
      providerType: "openai",
      selectedTier: 0,
      circuitBreakerFiltered: 0,
      totalCandidates: 1,
    });
    vi.mocked(forwardRequest).mockResolvedValueOnce({
      statusCode: 200,
      headers: new Headers({ "content-type": "application/json" }),
      body: new TextEncoder().encode(JSON.stringify({ id: "ok-1", object: "chat.completion" })),
      isStream: false,
      usage: null,
    });

    const request = new NextRequest("http://localhost/api/proxy/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ path: ["v1", "chat", "completions"] }),
    });
    expect(response.status).toBe(200);
    expect(buildFixture).toHaveBeenCalledTimes(1);
    expect(recordTrafficFixture).toHaveBeenCalledTimes(1);
  });

  it("should skip success fixture when RECORDER_MODE is failure", async () => {
    process.env.RECORDER_ENABLED = "true";
    process.env.RECORDER_MODE = "failure";

    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { routeByModel } = await import("@/lib/services/model-router");
    const { selectFromProviderType } = await import("@/lib/services/load-balancer");
    const { buildFixture, recordTrafficFixture } = await import("@/lib/services/traffic-recorder");

    const upstream = {
      id: "up-openai",
      name: "openai-main",
      providerType: "openai",
      baseUrl: "https://api.openai.com/v1",
      isDefault: false,
      isActive: true,
      timeout: 60,
    };

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: upstream.id },
    ]);
    vi.mocked(routeByModel).mockResolvedValueOnce({
      upstream,
      providerType: "openai",
      resolvedModel: "gpt-4o-mini",
      candidateUpstreams: [upstream],
      excludedUpstreams: [],
      routingDecision: {
        originalModel: "gpt-4o-mini",
        resolvedModel: "gpt-4o-mini",
        providerType: "openai",
        upstreamName: upstream.name,
        allowedModelsFilter: false,
        modelRedirectApplied: false,
        circuitBreakerFilter: false,
        routingType: "provider_type",
        candidateCount: 1,
        finalCandidateCount: 1,
      },
    });
    vi.mocked(selectFromProviderType).mockResolvedValueOnce({
      upstream,
      providerType: "openai",
      selectedTier: 0,
      circuitBreakerFiltered: 0,
      totalCandidates: 1,
    });
    vi.mocked(forwardRequest).mockResolvedValueOnce({
      statusCode: 200,
      headers: new Headers({ "content-type": "application/json" }),
      body: new TextEncoder().encode(JSON.stringify({ id: "ok-1", object: "chat.completion" })),
      isStream: false,
      usage: null,
    });

    const request = new NextRequest("http://localhost/api/proxy/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ path: ["v1", "chat", "completions"] }),
    });
    expect(response.status).toBe(200);
    expect(buildFixture).not.toHaveBeenCalled();
    expect(recordTrafficFixture).not.toHaveBeenCalled();
  });

  it("should exhaust all failover attempts and return 502", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { routeByModel } = await import("@/lib/services/model-router");
    const { selectFromProviderType, NoHealthyUpstreamsError } =
      await import("@/lib/services/load-balancer");
    const { markUnhealthy } = await import("@/lib/services/health-checker");
    const { recordFailure } = await import("@/lib/services/circuit-breaker");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-anthropic-1" },
      { upstreamId: "up-anthropic-2" },
      { upstreamId: "up-anthropic-3" },
    ]);

    const upstreams = [
      {
        id: "up-anthropic-1",
        name: "anthropic-1",
        providerType: "anthropic",
        baseUrl: "https://api.anthropic.com",
        isDefault: false,
        isActive: true,
        timeout: 60,
      },
      {
        id: "up-anthropic-2",
        name: "anthropic-2",
        providerType: "anthropic",
        baseUrl: "https://api.anthropic.com",
        isDefault: false,
        isActive: true,
        timeout: 60,
      },
      {
        id: "up-anthropic-3",
        name: "anthropic-3",
        providerType: "anthropic",
        baseUrl: "https://api.anthropic.com",
        isDefault: false,
        isActive: true,
        timeout: 60,
      },
    ];

    vi.mocked(routeByModel).mockResolvedValueOnce({
      upstream: upstreams[0],
      providerType: "anthropic",
      resolvedModel: "claude-test",
      candidateUpstreams: [],
      excludedUpstreams: [],
      routingDecision: {
        originalModel: "claude-test",
        resolvedModel: "claude-test",
        providerType: "anthropic",
        upstreamName: "anthropic-1",
        allowedModelsFilter: false,
        modelRedirectApplied: false,
        circuitBreakerFilter: false,
        routingType: "provider_type",
        candidateCount: 3,
        finalCandidateCount: 3,
      },
    });

    // All upstreams return 500 errors
    vi.mocked(selectFromProviderType)
      .mockResolvedValueOnce({
        upstream: upstreams[0],
        providerType: "anthropic",
        selectedTier: 0,
        circuitBreakerFiltered: 0,

        totalCandidates: 3,
      })
      .mockResolvedValueOnce({
        upstream: upstreams[1],
        providerType: "anthropic",
        selectedTier: 0,
        circuitBreakerFiltered: 0,

        totalCandidates: 3,
      })
      .mockResolvedValueOnce({
        upstream: upstreams[2],
        providerType: "anthropic",
        selectedTier: 0,
        circuitBreakerFiltered: 0,

        totalCandidates: 3,
      })
      .mockRejectedValueOnce(new NoHealthyUpstreamsError("No healthy upstreams available"));

    vi.mocked(forwardRequest)
      .mockResolvedValueOnce({
        statusCode: 500,
        headers: new Headers(),
        body: new Uint8Array(),
        isStream: false,
        usage: null,
      })
      .mockResolvedValueOnce({
        statusCode: 500,
        headers: new Headers(),
        body: new Uint8Array(),
        isStream: false,
        usage: null,
      })
      .mockResolvedValueOnce({
        statusCode: 500,
        headers: new Headers(),
        body: new Uint8Array(),
        isStream: false,
        usage: null,
      });

    const request = new NextRequest("http://localhost/api/proxy/v1/messages", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-test",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["v1", "messages"] }) });
    const data = await response.json();

    // After exhausting all attempts, should return 503 with unified error format
    expect(response.status).toBe(503);
    expect(data).toEqual({
      error: expect.objectContaining({
        message: "\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5",
        type: "service_unavailable",
        code: "ALL_UPSTREAMS_UNAVAILABLE",
        reason: "UPSTREAM_HTTP_ERROR",
        did_send_upstream: true,
      }),
    });
    expect(data.error.request_id).toEqual(expect.any(String));

    // All 3 upstreams should be marked unhealthy and have circuit breaker failures recorded
    expect(markUnhealthy).toHaveBeenCalledTimes(3);
    expect(recordFailure).toHaveBeenCalledTimes(3);
    expect(forwardRequest).toHaveBeenCalledTimes(3);
  });

  it("should continue failover when failed stream response capture would hang", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { routeByModel } = await import("@/lib/services/model-router");
    const { selectFromProviderType } = await import("@/lib/services/load-balancer");
    const { readStreamChunks } = await import("@/lib/services/traffic-recorder");

    vi.mocked(readStreamChunks).mockImplementation(() => new Promise(() => {}));

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-stream-fail" },
      { upstreamId: "up-fallback-ok" },
    ]);

    const streamFailUpstream = {
      id: "up-stream-fail",
      name: "stream-fail",
      providerType: "openai",
      baseUrl: "https://stream-fail.example/v1",
      isDefault: false,
      isActive: true,
      timeout: 60,
    };
    const fallbackUpstream = {
      id: "up-fallback-ok",
      name: "fallback-ok",
      providerType: "openai",
      baseUrl: "https://fallback.example/v1",
      isDefault: false,
      isActive: true,
      timeout: 60,
    };

    vi.mocked(routeByModel).mockResolvedValueOnce({
      upstream: streamFailUpstream,
      providerType: "openai",
      resolvedModel: "gpt-5.2",
      candidateUpstreams: [streamFailUpstream, fallbackUpstream],
      excludedUpstreams: [],
      routingDecision: {
        originalModel: "gpt-5.2",
        resolvedModel: "gpt-5.2",
        providerType: "openai",
        upstreamName: "stream-fail",
        allowedModelsFilter: false,
        modelRedirectApplied: false,
        circuitBreakerFilter: false,
        routingType: "provider_type",
        candidateCount: 2,
        finalCandidateCount: 2,
      },
    });

    vi.mocked(selectFromProviderType)
      .mockResolvedValueOnce({
        upstream: streamFailUpstream,
        providerType: "openai",
        selectedTier: 0,
        circuitBreakerFiltered: 0,
        totalCandidates: 2,
      })
      .mockResolvedValueOnce({
        upstream: fallbackUpstream,
        providerType: "openai",
        selectedTier: 0,
        circuitBreakerFiltered: 0,
        totalCandidates: 2,
      });

    const hangingErrorStream = new ReadableStream<Uint8Array>({
      start() {},
      cancel() {},
    });

    vi.mocked(forwardRequest)
      .mockResolvedValueOnce({
        statusCode: 503,
        headers: new Headers({ "content-type": "text/event-stream" }),
        body: hangingErrorStream,
        isStream: true,
        usage: null,
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: new Headers({ "content-type": "application/json" }),
        body: new TextEncoder().encode(JSON.stringify({ ok: true })),
        isStream: false,
        usage: null,
      });

    const request = new NextRequest("http://localhost/api/proxy/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await Promise.race([
      POST(request, { params: Promise.resolve({ path: ["v1", "chat", "completions"] }) }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("failover retry blocked by stream capture")), 2_000)
      ),
    ]);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(forwardRequest).toHaveBeenCalledTimes(2);
    expect(selectFromProviderType).toHaveBeenCalledTimes(2);
    expect(readStreamChunks).not.toHaveBeenCalled();
  });

  it("should degrade from tier 0 to tier 1 when tier 0 upstream fails", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest, prepareUpstreamForProxy } = await import("@/lib/services/proxy-client");
    const { routeByModel } = await import("@/lib/services/model-router");
    const { selectFromProviderType } = await import("@/lib/services/load-balancer");
    const { markHealthy, markUnhealthy } = await import("@/lib/services/health-checker");
    const { recordSuccess, recordFailure } = await import("@/lib/services/circuit-breaker");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-tier0" },
      { upstreamId: "up-tier1" },
    ]);

    const tier0Upstream = {
      id: "up-tier0",
      name: "primary",
      providerType: "anthropic",
      baseUrl: "https://api.anthropic.com",
      isDefault: false,
      isActive: true,
      timeout: 60,
      priority: 0,
    };

    const tier1Upstream = {
      id: "up-tier1",
      name: "fallback",
      providerType: "anthropic",
      baseUrl: "https://api.fallback.com",
      isDefault: false,
      isActive: true,
      timeout: 60,
      priority: 1,
    };

    vi.mocked(routeByModel).mockResolvedValueOnce({
      upstream: tier0Upstream,
      providerType: "anthropic",
      resolvedModel: "claude-test",
      candidateUpstreams: [],
      excludedUpstreams: [],
      routingDecision: {
        originalModel: "claude-test",
        resolvedModel: "claude-test",
        providerType: "anthropic",
        upstreamName: "primary",
        allowedModelsFilter: false,
        modelRedirectApplied: false,
        circuitBreakerFilter: false,
        routingType: "provider_type",
        candidateCount: 2,
        finalCandidateCount: 2,
      },
    });

    // First call returns tier 0 upstream, second call degrades to tier 1
    vi.mocked(selectFromProviderType)
      .mockResolvedValueOnce({
        upstream: tier0Upstream,
        providerType: "anthropic",
        selectedTier: 0,
        circuitBreakerFiltered: 0,

        totalCandidates: 2,
      })
      .mockResolvedValueOnce({
        upstream: tier1Upstream,
        providerType: "anthropic",
        selectedTier: 1,
        circuitBreakerFiltered: 0,

        totalCandidates: 2,
      });

    // Tier 0 returns 500, tier 1 succeeds
    vi.mocked(forwardRequest)
      .mockResolvedValueOnce({
        statusCode: 500,
        headers: new Headers(),
        body: new Uint8Array(),
        isStream: false,
        usage: null,
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: new Headers(),
        body: new Uint8Array(),
        isStream: false,
        usage: null,
      });

    const request = new NextRequest("http://localhost/api/proxy/v1/messages", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-test",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["v1", "messages"] }) });

    expect(response.status).toBe(200);

    // Tier 0 upstream failed and was marked unhealthy
    expect(markUnhealthy).toHaveBeenCalledWith("up-tier0", "HTTP 500 error");
    expect(recordFailure).toHaveBeenCalledWith("up-tier0", "http_500");

    // Tier 1 upstream succeeded
    expect(markHealthy).toHaveBeenCalledWith("up-tier1", 100);
    expect(recordSuccess).toHaveBeenCalledWith("up-tier1");

    // selectFromProviderType called twice: first returns tier 0, second returns tier 1
    expect(selectFromProviderType).toHaveBeenCalledTimes(2);

    // Final response served by tier 1 fallback upstream
    expect(forwardRequest).toHaveBeenCalledTimes(2);
    expect(prepareUpstreamForProxy).toHaveBeenCalledWith(tier1Upstream);
  });

  it("should return 403 when no authorized upstream matches path capability", async () => {
    const { db } = await import("@/lib/db");
    const __mockLogger = (
      (await import("@/lib/utils/logger")) as unknown as {
        __mockLogger: { warn: ReturnType<typeof vi.fn> };
      }
    ).__mockLogger;

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([]);
    vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
      {
        id: "up-anthropic",
        name: "anthropic-one",
        providerType: "anthropic",
        routeCapabilities: ["anthropic_messages"],
        baseUrl: "https://api.anthropic.com",
        isDefault: false,
        isActive: true,
        timeout: 60,
        priority: 0,
        weight: 1,
      },
    ]);
    vi.mocked(db.query.upstreamHealth.findMany).mockResolvedValueOnce([]);

    const request = new NextRequest("http://localhost/api/proxy/v1/messages", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["v1", "messages"] }) });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data).toEqual({
      error: expect.objectContaining({
        code: "NO_AUTHORIZED_UPSTREAMS",
        reason: "NO_AUTHORIZED_UPSTREAMS",
        did_send_upstream: false,
      }),
    });
    expect(__mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "v1/messages",
        matchedRouteCapability: "anthropic_messages",
        authorizedCapabilityCandidatesCount: 0,
      }),
      "no authorized upstream for matched route capability"
    );
  });

  it("should continue routing even when health status is unhealthy", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest, prepareUpstreamForProxy } = await import("@/lib/services/proxy-client");
    const { selectFromProviderType } = await import("@/lib/services/load-balancer");
    const __mockLogger = (
      (await import("@/lib/utils/logger")) as unknown as {
        __mockLogger: { warn: ReturnType<typeof vi.fn> };
      }
    ).__mockLogger;

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-anthropic" },
    ]);
    vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
      {
        id: "up-anthropic",
        name: "anthropic-one",
        providerType: "anthropic",
        routeCapabilities: ["anthropic_messages"],
        baseUrl: "https://api.anthropic.com",
        isDefault: false,
        isActive: true,
        timeout: 60,
        priority: 0,
        weight: 1,
      },
    ]);
    vi.mocked(db.query.upstreamHealth.findMany).mockResolvedValueOnce([
      {
        upstreamId: "up-anthropic",
        isHealthy: false,
      },
    ]);
    vi.mocked(selectFromProviderType).mockResolvedValueOnce({
      upstream: {
        id: "up-anthropic",
        name: "anthropic-one",
        providerType: "anthropic",
        baseUrl: "https://api.anthropic.com",
        isDefault: false,
        isActive: true,
        timeout: 60,
      },
      selectedTier: 0,
      circuitBreakerFiltered: 0,
      totalCandidates: 1,
    });
    vi.mocked(forwardRequest).mockResolvedValueOnce({
      statusCode: 200,
      headers: new Headers(),
      body: new Uint8Array(),
      isStream: false,
      usage: null,
    });

    const request = new NextRequest("http://localhost/api/proxy/v1/messages", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["v1", "messages"] }) });

    expect(response.status).toBe(200);
    expect(selectFromProviderType).toHaveBeenCalledWith(["up-anthropic"], undefined, undefined);
    expect(forwardRequest).toHaveBeenCalledTimes(1);
    expect(prepareUpstreamForProxy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "up-anthropic",
      })
    );
    expect(__mockLogger.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({
        matchedRouteCapability: "anthropic_messages",
      }),
      "all authorized upstreams are unhealthy for matched route capability"
    );
  });

  it("should return service unavailable when no healthy candidate remains", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { routeByModel } = await import("@/lib/services/model-router");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-openai" },
    ]);
    vi.mocked(routeByModel).mockResolvedValueOnce({
      upstream: null,
      providerType: null,
      resolvedModel: "unknown-model",
      candidateUpstreams: [],
      excludedUpstreams: [],
      routingDecision: {
        originalModel: "unknown-model",
        resolvedModel: "unknown-model",
        providerType: null,
        upstreamName: null,
        allowedModelsFilter: false,
        modelRedirectApplied: false,
        circuitBreakerFilter: false,
        routingType: "none",
        candidateCount: 0,
        finalCandidateCount: 0,
      },
    });

    const request = new NextRequest("http://localhost/api/proxy/v1/messages", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "unknown-model",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["v1", "messages"] }) });
    const data = await response.json();

    // Should return unified error format without exposing model name
    expect(response.status).toBe(503);
    expect(data).toEqual({
      error: expect.objectContaining({
        message: "\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5",
        type: "service_unavailable",
        code: "SERVICE_UNAVAILABLE",
        reason: "NO_HEALTHY_CANDIDATES",
        did_send_upstream: false,
      }),
    });
    expect(data.error.request_id).toEqual(expect.any(String));
    expect(forwardRequest).not.toHaveBeenCalled();
  });

  it("should reject when API key not authorized for selected upstream", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { routeByModel } = await import("@/lib/services/model-router");
    const { selectFromProviderType, NoAuthorizedUpstreamsError } =
      await import("@/lib/services/load-balancer");
    const { updateRequestLog } = await import("@/lib/services/request-logger");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    // API key only has access to up-openai, but model routes to anthropic
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-openai" },
    ]);

    const anthropicUpstream = {
      id: "up-anthropic",
      name: "anthropic-one",
      providerType: "anthropic",
      baseUrl: "https://api.anthropic.com",
      isDefault: false,
      isActive: true,
      timeout: 60,
    };

    vi.mocked(routeByModel).mockResolvedValueOnce({
      upstream: anthropicUpstream,
      providerType: "anthropic",
      resolvedModel: "claude-test",
      candidateUpstreams: [],
      excludedUpstreams: [],
      routingDecision: {
        originalModel: "claude-test",
        resolvedModel: "claude-test",
        providerType: "anthropic",
        upstreamName: "anthropic-one",
        allowedModelsFilter: false,
        modelRedirectApplied: false,
        circuitBreakerFilter: false,
        routingType: "provider_type",
        candidateCount: 1,
        finalCandidateCount: 1,
      },
    });
    vi.mocked(selectFromProviderType).mockRejectedValueOnce(
      new NoAuthorizedUpstreamsError("anthropic")
    );

    const request = new NextRequest("http://localhost/api/proxy/v1/messages", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-test",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["v1", "messages"] }) });
    const data = await response.json();

    // Should return unified error format without exposing upstream name
    expect(response.status).toBe(403);
    expect(data).toEqual({
      error: expect.objectContaining({
        message: "当前密钥未绑定可用上游，请先完成授权配置",
        type: "client_error",
        code: "NO_AUTHORIZED_UPSTREAMS",
        reason: "NO_AUTHORIZED_UPSTREAMS",
        did_send_upstream: false,
      }),
    });
    expect(data.error.request_id).toEqual(expect.any(String));
    expect(forwardRequest).not.toHaveBeenCalled();
    expect(updateRequestLog).toHaveBeenCalled();
    const updateLogPayload = vi.mocked(updateRequestLog).mock.calls.at(-1)?.[1];
    expect(updateLogPayload?.routingDecision).toEqual(
      expect.objectContaining({
        candidate_upstream_id: null,
        actual_upstream_id: null,
        did_send_upstream: false,
      })
    );
  });

  it("should persist streaming ttft from streamMetricsPromise", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { routeByModel } = await import("@/lib/services/model-router");
    const { selectFromProviderType } = await import("@/lib/services/load-balancer");
    const { updateRequestLog } = await import("@/lib/services/request-logger");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-openai" },
    ]);

    const openaiUpstream = {
      id: "up-openai",
      name: "openai",
      providerType: "openai",
      baseUrl: "https://api.openai.com/v1",
      isDefault: false,
      isActive: true,
      timeout: 60,
    };

    vi.mocked(routeByModel).mockResolvedValueOnce({
      upstream: openaiUpstream,
      providerType: "openai",
      resolvedModel: "gpt-4o-mini",
      candidateUpstreams: [openaiUpstream],
      excludedUpstreams: [],
      routingDecision: {
        originalModel: "gpt-4o-mini",
        resolvedModel: "gpt-4o-mini",
        providerType: "openai",
        upstreamName: "openai",
        allowedModelsFilter: false,
        modelRedirectApplied: false,
        circuitBreakerFilter: false,
        routingType: "provider_type",
        candidateCount: 1,
        finalCandidateCount: 1,
      },
    });

    vi.mocked(selectFromProviderType).mockResolvedValueOnce({
      upstream: openaiUpstream,
      providerType: "openai",
      selectedTier: 0,
      circuitBreakerFiltered: 0,
      totalCandidates: 1,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"id":"evt-1"}\n\n'));
        controller.close();
      },
    });

    vi.mocked(forwardRequest).mockResolvedValueOnce({
      statusCode: 200,
      headers: new Headers({ "content-type": "text/event-stream" }),
      body: stream,
      isStream: true,
      streamMetricsPromise: Promise.resolve({
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          cachedTokens: 0,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        },
        ttftMs: 321,
      }),
    });

    const request = new NextRequest("http://localhost/api/proxy/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ path: ["v1", "chat", "completions"] }),
    });

    expect(response.status).toBe(200);

    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(updateRequestLog).toHaveBeenCalled();
    const updateLogPayload = vi.mocked(updateRequestLog).mock.calls.at(-1)?.[1];
    expect(updateLogPayload?.isStream).toBe(true);
    expect(updateLogPayload?.ttftMs).toBe(321);
    expect(updateLogPayload?.promptTokens).toBe(10);
    expect(updateLogPayload?.completionTokens).toBe(20);
  });

  it.skip("should handle streaming response failover with circuit breaker", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest, prepareUpstreamForProxy } = await import("@/lib/services/proxy-client");
    const { routeByModel } = await import("@/lib/services/model-router");
    const { selectFromProviderType } = await import("@/lib/services/load-balancer");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-anthropic-1" },
      { upstreamId: "up-anthropic-2" },
    ]);

    const failingUpstream = {
      id: "up-anthropic-1",
      name: "anthropic-1",
      providerType: "anthropic",
      baseUrl: "https://api.anthropic.com",
      isDefault: false,
      isActive: true,
      timeout: 60,
    };

    const healthyUpstream = {
      id: "up-anthropic-2",
      name: "anthropic-2",
      providerType: "anthropic",
      baseUrl: "https://api.anthropic.com",
      isDefault: false,
      isActive: true,
      timeout: 60,
    };

    vi.mocked(routeByModel).mockResolvedValueOnce({
      upstream: failingUpstream,
      providerType: "anthropic",
      resolvedModel: "claude-test",
      candidateUpstreams: [],
      excludedUpstreams: [],
      routingDecision: {
        originalModel: "claude-test",
        resolvedModel: "claude-test",
        providerType: "anthropic",
        upstreamName: "anthropic-1",
        allowedModelsFilter: false,
        modelRedirectApplied: false,
        circuitBreakerFilter: false,
        routingType: "provider_type",
        candidateCount: 2,
        finalCandidateCount: 2,
      },
    });

    // First upstream fails with 503 (circuit breaker open), second succeeds with streaming
    vi.mocked(selectFromProviderType)
      .mockResolvedValueOnce({
        upstream: failingUpstream,
        providerType: "anthropic",
        selectedTier: 0,
        circuitBreakerFiltered: 0,

        totalCandidates: 2,
      })
      .mockResolvedValueOnce({
        upstream: healthyUpstream,
        providerType: "anthropic",
        selectedTier: 0,
        circuitBreakerFiltered: 0,

        totalCandidates: 2,
      });

    // Create a readable stream that emits data then closes
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"chunk": 1}\n\n'));
        controller.close();
      },
    });

    // First request returns 503 (circuit breaker open), second succeeds with streaming
    vi.mocked(forwardRequest)
      .mockResolvedValueOnce({
        statusCode: 503,
        headers: new Headers(),
        body: new Uint8Array(),
        isStream: false,
        usage: null,
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: new Headers({ "content-type": "text/event-stream" }),
        body: stream,
        isStream: true,
        usage: null,
        streamMetricsPromise: Promise.resolve({
          usage: {
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30,
            cachedTokens: 0,
            reasoningTokens: 0,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
          },
          ttftMs: undefined,
        }),
      });

    const request = new NextRequest("http://localhost/api/proxy/v1/messages", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-test",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["v1", "messages"] }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    // Read the stream to completion
    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }

    // Wait for async logging
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(prepareUpstreamForProxy).toHaveBeenCalledWith(healthyUpstream);
    expect(forwardRequest).toHaveBeenCalledTimes(2);
  });

  describe("API key upstream authorization filtering", () => {
    it("should only select from authorized upstreams when multiple upstreams match provider type", async () => {
      const { db } = await import("@/lib/db");
      const { forwardRequest, prepareUpstreamForProxy } =
        await import("@/lib/services/proxy-client");
      const { routeByModel } = await import("@/lib/services/model-router");
      const { selectFromProviderType } = await import("@/lib/services/load-balancer");
      const { markHealthy } = await import("@/lib/services/health-checker");

      vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
        { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
      ]);

      // API key only authorized for privnode-cx, NOT for duck
      vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
        { upstreamId: "up-privnode" },
      ]);

      const duckUpstream = {
        id: "up-duck",
        name: "duck",
        providerType: "openai",
        baseUrl: "https://jp.duckcoding.com/v1",
        isDefault: false,
        isActive: true,
        timeout: 60,
      };

      const privnodeUpstream = {
        id: "up-privnode",
        name: "privnode-cx",
        providerType: "openai",
        baseUrl: "https://privnode.com/v1",
        isDefault: false,
        isActive: true,
        timeout: 60,
      };

      // routeByModel returns duck (first match), but API key only authorizes privnode
      vi.mocked(routeByModel).mockResolvedValueOnce({
        upstream: duckUpstream,
        providerType: "openai",
        resolvedModel: "gpt-5.2",
        candidateUpstreams: [duckUpstream, privnodeUpstream],
        excludedUpstreams: [],
        routingDecision: {
          originalModel: "gpt-5.2",
          resolvedModel: "gpt-5.2",
          providerType: "openai",
          upstreamName: "duck",
          allowedModelsFilter: false,
          modelRedirectApplied: false,
          circuitBreakerFilter: false,
          routingType: "provider_type",
          candidateCount: 2,
          finalCandidateCount: 2,
        },
      });

      // selectFromProviderType should be called with allowedUpstreamIds filter
      // and should return privnode (the only authorized upstream)
      vi.mocked(selectFromProviderType).mockResolvedValueOnce({
        upstream: privnodeUpstream,
        providerType: "openai",
        selectedTier: 0,
        circuitBreakerFiltered: 0,

        totalCandidates: 1,
      });

      vi.mocked(forwardRequest).mockResolvedValueOnce({
        statusCode: 200,
        headers: new Headers(),
        body: new Uint8Array(),
        isStream: false,
        usage: null,
      });

      const request = new NextRequest("http://localhost/api/proxy/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: "Bearer sk-test",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5.2",
          messages: [{ role: "user", content: "hi" }],
        }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ path: ["v1", "chat", "completions"] }),
      });

      expect(response.status).toBe(200);
      // Verify selectFromProviderType was called with allowedUpstreamIds
      expect(selectFromProviderType).toHaveBeenCalledWith(["up-privnode"], undefined, undefined);
      // Verify the request was forwarded to privnode, not duck
      expect(prepareUpstreamForProxy).toHaveBeenCalledWith(privnodeUpstream);
      expect(markHealthy).toHaveBeenCalledWith("up-privnode", 100);
    });

    it("should return error when no authorized upstreams match provider type", async () => {
      const { db } = await import("@/lib/db");
      const { forwardRequest } = await import("@/lib/services/proxy-client");
      const { routeByModel } = await import("@/lib/services/model-router");
      const { selectFromProviderType, NoHealthyUpstreamsError } =
        await import("@/lib/services/load-balancer");
      const { updateRequestLog } = await import("@/lib/services/request-logger");

      vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
        { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
      ]);

      // API key only authorized for anthropic upstream, but model routes to openai
      vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
        { upstreamId: "up-anthropic" },
      ]);

      const duckUpstream = {
        id: "up-duck",
        name: "duck",
        providerType: "openai",
        baseUrl: "https://jp.duckcoding.com/v1",
        isDefault: false,
        isActive: true,
        timeout: 60,
      };

      vi.mocked(routeByModel).mockResolvedValueOnce({
        upstream: duckUpstream,
        providerType: "openai",
        resolvedModel: "gpt-5.2",
        candidateUpstreams: [duckUpstream],
        excludedUpstreams: [],
        routingDecision: {
          originalModel: "gpt-5.2",
          resolvedModel: "gpt-5.2",
          providerType: "openai",
          upstreamName: "duck",
          allowedModelsFilter: false,
          modelRedirectApplied: false,
          circuitBreakerFilter: false,
          routingType: "provider_type",
          candidateCount: 1,
          finalCandidateCount: 1,
        },
      });

      // selectFromProviderType throws because no authorized upstreams available
      vi.mocked(selectFromProviderType).mockRejectedValueOnce(
        new NoHealthyUpstreamsError("No authorized upstreams available for provider type: openai")
      );

      const request = new NextRequest("http://localhost/api/proxy/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: "Bearer sk-test",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5.2",
          messages: [{ role: "user", content: "hi" }],
        }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ path: ["v1", "chat", "completions"] }),
      });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data).toEqual({
        error: expect.objectContaining({
          message: "当前密钥未绑定可用上游，请先完成授权配置",
          type: "client_error",
          code: "NO_AUTHORIZED_UPSTREAMS",
          reason: "NO_AUTHORIZED_UPSTREAMS",
          did_send_upstream: false,
        }),
      });
      expect(data.error.request_id).toEqual(expect.any(String));
      expect(forwardRequest).not.toHaveBeenCalled();
      expect(updateRequestLog).toHaveBeenCalled();
      const updateLogPayload = vi.mocked(updateRequestLog).mock.calls.at(-1)?.[1];
      expect(updateLogPayload?.routingDecision).toEqual(
        expect.objectContaining({
          candidate_upstream_id: null,
          actual_upstream_id: null,
          did_send_upstream: false,
        })
      );
    });

    it("should filter unauthorized upstreams during failover", async () => {
      const { db } = await import("@/lib/db");
      const { forwardRequest } = await import("@/lib/services/proxy-client");
      const { routeByModel } = await import("@/lib/services/model-router");
      const { selectFromProviderType } = await import("@/lib/services/load-balancer");
      const { markHealthy, markUnhealthy } = await import("@/lib/services/health-checker");

      vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
        { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
      ]);

      // API key authorized for both privnode and rightcode, but NOT duck
      vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
        { upstreamId: "up-privnode" },
        { upstreamId: "up-rightcode" },
      ]);

      const privnodeUpstream = {
        id: "up-privnode",
        name: "privnode-cx",
        providerType: "openai",
        baseUrl: "https://privnode.com/v1",
        isDefault: false,
        isActive: true,
        timeout: 60,
      };

      const rightcodeUpstream = {
        id: "up-rightcode",
        name: "rightcode",
        providerType: "openai",
        baseUrl: "https://rightcode.com/v1",
        isDefault: false,
        isActive: true,
        timeout: 60,
      };

      vi.mocked(routeByModel).mockResolvedValueOnce({
        upstream: privnodeUpstream,
        providerType: "openai",
        resolvedModel: "gpt-5.2",
        candidateUpstreams: [privnodeUpstream, rightcodeUpstream],
        excludedUpstreams: [],
        routingDecision: {
          originalModel: "gpt-5.2",
          resolvedModel: "gpt-5.2",
          providerType: "openai",
          upstreamName: "privnode-cx",
          allowedModelsFilter: false,
          modelRedirectApplied: false,
          circuitBreakerFilter: false,
          routingType: "provider_type",
          candidateCount: 2,
          finalCandidateCount: 2,
        },
      });

      // First attempt: privnode fails with 500
      vi.mocked(selectFromProviderType)
        .mockResolvedValueOnce({
          upstream: privnodeUpstream,
          providerType: "openai",
          selectedTier: 0,
          circuitBreakerFiltered: 0,

          totalCandidates: 2,
        })
        // Second attempt: rightcode succeeds
        .mockResolvedValueOnce({
          upstream: rightcodeUpstream,
          providerType: "openai",
          selectedTier: 0,
          circuitBreakerFiltered: 0,
          totalCandidates: 2,
        });

      vi.mocked(forwardRequest)
        .mockResolvedValueOnce({
          statusCode: 500,
          headers: new Headers(),
          body: new Uint8Array(),
          isStream: false,
          usage: null,
        })
        .mockResolvedValueOnce({
          statusCode: 200,
          headers: new Headers(),
          body: new Uint8Array(),
          isStream: false,
          usage: null,
        });

      const request = new NextRequest("http://localhost/api/proxy/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: "Bearer sk-test",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5.2",
          messages: [{ role: "user", content: "hi" }],
        }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ path: ["v1", "chat", "completions"] }),
      });

      expect(response.status).toBe(200);
      // Verify both calls to selectFromProviderType included allowedUpstreamIds
      expect(selectFromProviderType).toHaveBeenCalledTimes(2);
      expect(selectFromProviderType).toHaveBeenNthCalledWith(
        1,
        ["up-privnode", "up-rightcode"],
        undefined,
        undefined
      );
      expect(selectFromProviderType).toHaveBeenNthCalledWith(
        2,
        ["up-privnode", "up-rightcode"],
        ["up-privnode"], // excludeIds - failed upstream
        undefined // affinityContext
      );
      expect(markUnhealthy).toHaveBeenCalledWith("up-privnode", "HTTP 500 error");
      expect(markHealthy).toHaveBeenCalledWith("up-rightcode", 100);
    });
  });
});
