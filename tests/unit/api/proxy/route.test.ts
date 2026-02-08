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
    },
  },
  apiKeys: {},
  apiKeyUpstreams: {},
  upstreams: {},
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
  class NoHealthyUpstreamsError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "NoHealthyUpstreamsError";
    }
  }

  return {
    selectFromProviderType: vi.fn(),
    recordConnection: vi.fn(),
    releaseConnection: vi.fn(),
    NoHealthyUpstreamsError,
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
}));

describe("proxy route upstream selection", () => {
  let POST: (
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();
    const routeModule = await import("@/app/api/proxy/v1/[...path]/route");
    POST = routeModule.POST;
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    const response = await POST(request, { params: Promise.resolve({ path: ["messages"] }) });

    expect(response.status).toBe(200);
    expect(prepareUpstreamForProxy).toHaveBeenCalledWith(anthropicUpstream);
    expect(forwardRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ providerType: "anthropic" }),
      "messages",
      expect.any(String)
    );
  });

  it("should perform failover with circuit breaker when first upstream fails", async () => {
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

    const response = await POST(request, { params: Promise.resolve({ path: ["messages"] }) });

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
    expect(selectFromProviderType).toHaveBeenNthCalledWith(1, "anthropic", undefined, [
      "up-anthropic-1",
      "up-anthropic-2",
    ]);
    expect(selectFromProviderType).toHaveBeenNthCalledWith(
      2,
      "anthropic",
      ["up-anthropic-1"],
      ["up-anthropic-1", "up-anthropic-2"]
    );

    expect(forwardRequest).toHaveBeenCalledTimes(2);
    expect(prepareUpstreamForProxy).toHaveBeenCalledWith(healthyUpstream);
  });

  it("should return 503 when circuit breaker is open for all upstreams", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { routeByModel } = await import("@/lib/services/model-router");
    const { selectFromProviderType, NoHealthyUpstreamsError } =
      await import("@/lib/services/load-balancer");

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

    const response = await POST(request, { params: Promise.resolve({ path: ["messages"] }) });
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data).toEqual({
      error: {
        message: "\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5",
        type: "service_unavailable",
        code: "ALL_UPSTREAMS_UNAVAILABLE",
      },
    });
    expect(forwardRequest).not.toHaveBeenCalled();
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

    const response = await POST(request, { params: Promise.resolve({ path: ["messages"] }) });
    const data = await response.json();

    // After exhausting all attempts, should return 503 with unified error format
    expect(response.status).toBe(503);
    expect(data).toEqual({
      error: {
        message: "\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5",
        type: "service_unavailable",
        code: "ALL_UPSTREAMS_UNAVAILABLE",
      },
    });

    // All 3 upstreams should be marked unhealthy and have circuit breaker failures recorded
    expect(markUnhealthy).toHaveBeenCalledTimes(3);
    expect(recordFailure).toHaveBeenCalledTimes(3);
    expect(forwardRequest).toHaveBeenCalledTimes(3);
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

    const response = await POST(request, { params: Promise.resolve({ path: ["messages"] }) });

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

  it("should return 400 when no upstream group configured for model", async () => {
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

    const response = await POST(request, { params: Promise.resolve({ path: ["messages"] }) });
    const data = await response.json();

    // Should return unified error format without exposing model name
    expect(response.status).toBe(503);
    expect(data).toEqual({
      error: {
        message: "\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5",
        type: "service_unavailable",
        code: "NO_UPSTREAMS_CONFIGURED",
      },
    });
    expect(forwardRequest).not.toHaveBeenCalled();
  });

  it("should reject when API key not authorized for selected upstream", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { routeByModel } = await import("@/lib/services/model-router");

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

    const response = await POST(request, { params: Promise.resolve({ path: ["messages"] }) });
    const data = await response.json();

    // Should return unified error format without exposing upstream name
    expect(response.status).toBe(503);
    expect(data).toEqual({
      error: {
        message: "\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5",
        type: "service_unavailable",
        code: "SERVICE_UNAVAILABLE",
      },
    });
    expect(forwardRequest).not.toHaveBeenCalled();
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
        usagePromise: Promise.resolve({
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          cachedTokens: 0,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
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

    const response = await POST(request, { params: Promise.resolve({ path: ["messages"] }) });

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
        params: Promise.resolve({ path: ["chat", "completions"] }),
      });

      expect(response.status).toBe(200);
      // Verify selectFromProviderType was called with allowedUpstreamIds
      expect(selectFromProviderType).toHaveBeenCalledWith(
        "openai",
        undefined, // excludeIds
        ["up-privnode"] // allowedUpstreamIds - only authorized upstreams
      );
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
        params: Promise.resolve({ path: ["chat", "completions"] }),
      });
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({
        error: {
          message: "\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5",
          type: "service_unavailable",
          code: "ALL_UPSTREAMS_UNAVAILABLE",
        },
      });
      expect(forwardRequest).not.toHaveBeenCalled();
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
        params: Promise.resolve({ path: ["chat", "completions"] }),
      });

      expect(response.status).toBe(200);
      // Verify both calls to selectFromProviderType included allowedUpstreamIds
      expect(selectFromProviderType).toHaveBeenCalledTimes(2);
      expect(selectFromProviderType).toHaveBeenNthCalledWith(1, "openai", undefined, [
        "up-privnode",
        "up-rightcode",
      ]);
      expect(selectFromProviderType).toHaveBeenNthCalledWith(
        2,
        "openai",
        ["up-privnode"], // excludeIds - failed upstream
        ["up-privnode", "up-rightcode"] // allowedUpstreamIds
      );
      expect(markUnhealthy).toHaveBeenCalledWith("up-privnode", "HTTP 500 error");
      expect(markHealthy).toHaveBeenCalledWith("up-rightcode", 100);
    });
  });
});
