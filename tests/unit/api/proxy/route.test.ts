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
    provider: upstream.provider,
    baseUrl: upstream.baseUrl,
    apiKey: "decrypted-key",
    timeout: upstream.timeout ?? 60,
  })),
}));

vi.mock("@/lib/services/request-logger", () => ({
  logRequest: vi.fn(),
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

  class UpstreamGroupNotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "UpstreamGroupNotFoundError";
    }
  }

  return {
    selectUpstream: vi.fn(),
    recordConnection: vi.fn(),
    releaseConnection: vi.fn(),
    getUpstreamGroupByName: vi.fn(),
    NoHealthyUpstreamsError,
    UpstreamGroupNotFoundError,
  };
});

// Mock health-checker module
vi.mock("@/lib/services/health-checker", () => ({
  markHealthy: vi.fn(),
  markUnhealthy: vi.fn(),
}));

describe("proxy route upstream selection", () => {
  let POST: (
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
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
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      isDefault: false,
      isActive: true,
      timeout: 60,
    };

    vi.mocked(db.query.upstreams.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(anthropicUpstream);

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
      expect.objectContaining({ provider: "anthropic" }),
      "messages",
      expect.any(String)
    );
  });

  it("should return 400 when no upstream matches required provider", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-openai" },
    ]);
    vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce(null).mockResolvedValueOnce(null);

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

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: "No upstreams configured for 'anthropic' requests" });
    expect(forwardRequest).not.toHaveBeenCalled();
  });

  it("should reject upstreamName when provider does not match path", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-openai" },
    ]);

    const openaiUpstream = {
      id: "up-openai",
      name: "openai-one",
      provider: "openai",
      baseUrl: "https://api.openai.com",
      isDefault: true,
      isActive: true,
      timeout: 60,
    };

    vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce(openaiUpstream);

    const request = new NextRequest("http://localhost/api/proxy/v1/messages", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "x-upstream-name": "openai-one",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-test",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["messages"] }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: "Upstream 'openai-one' does not support 'anthropic' requests",
    });
    expect(forwardRequest).not.toHaveBeenCalled();
  });
});

describe("proxy route load balancing with X-Upstream-Group header", () => {
  let POST: (
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const routeModule = await import("@/app/api/proxy/v1/[...path]/route");
    POST = routeModule.POST;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should use load balancer when X-Upstream-Group header is provided", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest, prepareUpstreamForProxy } = await import("@/lib/services/proxy-client");
    const { getUpstreamGroupByName, selectUpstream, recordConnection, releaseConnection } =
      await import("@/lib/services/load-balancer");
    const { markHealthy } = await import("@/lib/services/health-checker");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-anthropic-1" },
    ]);
    vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([{ id: "up-anthropic-1" }]);

    const anthropicGroup = {
      id: "group-1",
      name: "anthropic-group",
      provider: "anthropic",
      strategy: "round_robin",
      isActive: true,
    };

    const selectedUpstream = {
      id: "up-anthropic-1",
      name: "anthropic-1",
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      isActive: true,
      timeout: 60,
      weight: 1,
      groupId: "group-1",
    };

    vi.mocked(getUpstreamGroupByName).mockResolvedValueOnce(anthropicGroup);
    vi.mocked(selectUpstream).mockResolvedValueOnce({
      upstream: selectedUpstream,
      strategy: "round_robin",
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
        "x-upstream-group": "anthropic-group",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-opus",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["messages"] }) });

    expect(response.status).toBe(200);
    expect(getUpstreamGroupByName).toHaveBeenCalledWith("anthropic-group");
    expect(selectUpstream).toHaveBeenCalledWith("group-1", undefined, undefined);
    expect(recordConnection).toHaveBeenCalledWith("up-anthropic-1");
    expect(releaseConnection).toHaveBeenCalledWith("up-anthropic-1");
    expect(markHealthy).toHaveBeenCalledWith("up-anthropic-1", 100);
    expect(prepareUpstreamForProxy).toHaveBeenCalledWith(selectedUpstream);
    expect(forwardRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ provider: "anthropic" }),
      "messages",
      expect.any(String)
    );
  });

  it("should return 404 when upstream group is not found", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { getUpstreamGroupByName } = await import("@/lib/services/load-balancer");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);

    vi.mocked(getUpstreamGroupByName).mockResolvedValueOnce(null);

    const request = new NextRequest("http://localhost/api/proxy/v1/messages", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "x-upstream-group": "non-existent-group",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-opus",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["messages"] }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: "Upstream group 'non-existent-group' not found" });
    expect(forwardRequest).not.toHaveBeenCalled();
  });

  it("should return 400 when upstream group is not active", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { getUpstreamGroupByName } = await import("@/lib/services/load-balancer");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);

    const inactiveGroup = {
      id: "group-1",
      name: "inactive-group",
      provider: "anthropic",
      strategy: "round_robin",
      isActive: false,
    };

    vi.mocked(getUpstreamGroupByName).mockResolvedValueOnce(inactiveGroup);

    const request = new NextRequest("http://localhost/api/proxy/v1/messages", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "x-upstream-group": "inactive-group",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-opus",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["messages"] }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: "Upstream group 'inactive-group' is not active" });
    expect(forwardRequest).not.toHaveBeenCalled();
  });

  it("should return 400 when group provider does not match required provider", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { getUpstreamGroupByName } = await import("@/lib/services/load-balancer");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);

    // OpenAI group cannot handle /messages path (requires anthropic)
    const openaiGroup = {
      id: "group-1",
      name: "openai-group",
      provider: "openai",
      strategy: "round_robin",
      isActive: true,
    };

    vi.mocked(getUpstreamGroupByName).mockResolvedValueOnce(openaiGroup);

    const request = new NextRequest("http://localhost/api/proxy/v1/messages", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "x-upstream-group": "openai-group",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-opus",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["messages"] }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: "Upstream group 'openai-group' does not support 'anthropic' requests",
    });
    expect(forwardRequest).not.toHaveBeenCalled();
  });

  it("should return 503 when no healthy upstreams are available in group", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { getUpstreamGroupByName, selectUpstream, NoHealthyUpstreamsError } =
      await import("@/lib/services/load-balancer");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-anthropic-1" },
    ]);
    vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([{ id: "up-anthropic-1" }]);

    const anthropicGroup = {
      id: "group-1",
      name: "anthropic-group",
      provider: "anthropic",
      strategy: "round_robin",
      isActive: true,
    };

    vi.mocked(getUpstreamGroupByName).mockResolvedValueOnce(anthropicGroup);
    vi.mocked(selectUpstream).mockRejectedValueOnce(
      new NoHealthyUpstreamsError("No healthy upstreams available in group: group-1")
    );

    const request = new NextRequest("http://localhost/api/proxy/v1/messages", {
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "x-upstream-group": "anthropic-group",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-opus",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["messages"] }) });
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data).toEqual({ error: "No healthy upstreams available in the group" });
    expect(forwardRequest).not.toHaveBeenCalled();
  });

  it("should perform failover to next upstream on 5xx error", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest, prepareUpstreamForProxy } = await import("@/lib/services/proxy-client");
    const { getUpstreamGroupByName, selectUpstream, recordConnection, releaseConnection } =
      await import("@/lib/services/load-balancer");
    const { markHealthy, markUnhealthy } = await import("@/lib/services/health-checker");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-anthropic-1" },
      { upstreamId: "up-anthropic-2" },
    ]);
    vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
      { id: "up-anthropic-1" },
      { id: "up-anthropic-2" },
    ]);

    const anthropicGroup = {
      id: "group-1",
      name: "anthropic-group",
      provider: "anthropic",
      strategy: "round_robin",
      isActive: true,
    };

    const failingUpstream = {
      id: "up-anthropic-1",
      name: "anthropic-1",
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      isActive: true,
      timeout: 60,
      weight: 1,
      groupId: "group-1",
    };

    const healthyUpstream = {
      id: "up-anthropic-2",
      name: "anthropic-2",
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      isActive: true,
      timeout: 60,
      weight: 1,
      groupId: "group-1",
    };

    vi.mocked(getUpstreamGroupByName).mockResolvedValueOnce(anthropicGroup);

    // First call selects failing upstream, second call selects healthy upstream
    vi.mocked(selectUpstream)
      .mockResolvedValueOnce({
        upstream: failingUpstream,
        strategy: "round_robin",
      })
      .mockResolvedValueOnce({
        upstream: healthyUpstream,
        strategy: "round_robin",
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
        "x-upstream-group": "anthropic-group",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-opus",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["messages"] }) });

    expect(response.status).toBe(200);

    // First upstream was tried, failed, and marked unhealthy
    expect(recordConnection).toHaveBeenCalledWith("up-anthropic-1");
    expect(releaseConnection).toHaveBeenCalledWith("up-anthropic-1");
    expect(markUnhealthy).toHaveBeenCalledWith("up-anthropic-1", "HTTP 500 error");

    // Second upstream was tried and succeeded
    expect(recordConnection).toHaveBeenCalledWith("up-anthropic-2");
    expect(releaseConnection).toHaveBeenCalledWith("up-anthropic-2");
    expect(markHealthy).toHaveBeenCalledWith("up-anthropic-2", 100);

    // selectUpstream was called twice - first without exclusions, second with failed upstream excluded
    expect(selectUpstream).toHaveBeenCalledTimes(2);
    expect(selectUpstream).toHaveBeenNthCalledWith(1, "group-1", undefined, undefined);
    expect(selectUpstream).toHaveBeenNthCalledWith(2, "group-1", undefined, ["up-anthropic-1"]);

    expect(forwardRequest).toHaveBeenCalledTimes(2);
    expect(prepareUpstreamForProxy).toHaveBeenCalledWith(healthyUpstream);
  });

  it("should perform failover on 429 rate limit error", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { getUpstreamGroupByName, selectUpstream } = await import("@/lib/services/load-balancer");
    const { markHealthy, markUnhealthy } = await import("@/lib/services/health-checker");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-anthropic-1" },
      { upstreamId: "up-anthropic-2" },
    ]);
    vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
      { id: "up-anthropic-1" },
      { id: "up-anthropic-2" },
    ]);

    const anthropicGroup = {
      id: "group-1",
      name: "anthropic-group",
      provider: "anthropic",
      strategy: "round_robin",
      isActive: true,
    };

    const rateLimitedUpstream = {
      id: "up-anthropic-1",
      name: "anthropic-1",
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      isActive: true,
      timeout: 60,
      weight: 1,
      groupId: "group-1",
    };

    const availableUpstream = {
      id: "up-anthropic-2",
      name: "anthropic-2",
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      isActive: true,
      timeout: 60,
      weight: 1,
      groupId: "group-1",
    };

    vi.mocked(getUpstreamGroupByName).mockResolvedValueOnce(anthropicGroup);

    vi.mocked(selectUpstream)
      .mockResolvedValueOnce({
        upstream: rateLimitedUpstream,
        strategy: "round_robin",
      })
      .mockResolvedValueOnce({
        upstream: availableUpstream,
        strategy: "round_robin",
      });

    // First request returns 429, second succeeds
    vi.mocked(forwardRequest)
      .mockResolvedValueOnce({
        statusCode: 429,
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
        "x-upstream-group": "anthropic-group",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-opus",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["messages"] }) });

    expect(response.status).toBe(200);
    expect(markUnhealthy).toHaveBeenCalledWith("up-anthropic-1", "HTTP 429 error");
    expect(markHealthy).toHaveBeenCalledWith("up-anthropic-2", 100);
    expect(forwardRequest).toHaveBeenCalledTimes(2);
  });

  it("should perform failover on connection error", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { getUpstreamGroupByName, selectUpstream, releaseConnection } =
      await import("@/lib/services/load-balancer");
    const { markHealthy, markUnhealthy } = await import("@/lib/services/health-checker");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-anthropic-1" },
      { upstreamId: "up-anthropic-2" },
    ]);
    vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
      { id: "up-anthropic-1" },
      { id: "up-anthropic-2" },
    ]);

    const anthropicGroup = {
      id: "group-1",
      name: "anthropic-group",
      provider: "anthropic",
      strategy: "round_robin",
      isActive: true,
    };

    const unreachableUpstream = {
      id: "up-anthropic-1",
      name: "anthropic-1",
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      isActive: true,
      timeout: 60,
      weight: 1,
      groupId: "group-1",
    };

    const reachableUpstream = {
      id: "up-anthropic-2",
      name: "anthropic-2",
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      isActive: true,
      timeout: 60,
      weight: 1,
      groupId: "group-1",
    };

    vi.mocked(getUpstreamGroupByName).mockResolvedValueOnce(anthropicGroup);

    vi.mocked(selectUpstream)
      .mockResolvedValueOnce({
        upstream: unreachableUpstream,
        strategy: "round_robin",
      })
      .mockResolvedValueOnce({
        upstream: reachableUpstream,
        strategy: "round_robin",
      });

    // First request throws connection error, second succeeds
    vi.mocked(forwardRequest)
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
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
        "x-upstream-group": "anthropic-group",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-opus",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["messages"] }) });

    expect(response.status).toBe(200);
    expect(markUnhealthy).toHaveBeenCalledWith("up-anthropic-1", "connect ECONNREFUSED");
    expect(markHealthy).toHaveBeenCalledWith("up-anthropic-2", 100);
    expect(releaseConnection).toHaveBeenCalledWith("up-anthropic-1");
    expect(forwardRequest).toHaveBeenCalledTimes(2);
  });

  it("should perform failover on timeout error", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { getUpstreamGroupByName, selectUpstream } = await import("@/lib/services/load-balancer");
    const { markHealthy, markUnhealthy } = await import("@/lib/services/health-checker");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-anthropic-1" },
      { upstreamId: "up-anthropic-2" },
    ]);
    vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
      { id: "up-anthropic-1" },
      { id: "up-anthropic-2" },
    ]);

    const anthropicGroup = {
      id: "group-1",
      name: "anthropic-group",
      provider: "anthropic",
      strategy: "round_robin",
      isActive: true,
    };

    const slowUpstream = {
      id: "up-anthropic-1",
      name: "anthropic-1",
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      isActive: true,
      timeout: 60,
      weight: 1,
      groupId: "group-1",
    };

    const fastUpstream = {
      id: "up-anthropic-2",
      name: "anthropic-2",
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      isActive: true,
      timeout: 60,
      weight: 1,
      groupId: "group-1",
    };

    vi.mocked(getUpstreamGroupByName).mockResolvedValueOnce(anthropicGroup);

    vi.mocked(selectUpstream)
      .mockResolvedValueOnce({
        upstream: slowUpstream,
        strategy: "round_robin",
      })
      .mockResolvedValueOnce({
        upstream: fastUpstream,
        strategy: "round_robin",
      });

    // First request times out, second succeeds
    vi.mocked(forwardRequest)
      .mockRejectedValueOnce(new Error("Request timed out"))
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
        "x-upstream-group": "anthropic-group",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-opus",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["messages"] }) });

    expect(response.status).toBe(200);
    expect(markUnhealthy).toHaveBeenCalledWith("up-anthropic-1", "Request timed out");
    expect(markHealthy).toHaveBeenCalledWith("up-anthropic-2", 100);
    expect(forwardRequest).toHaveBeenCalledTimes(2);
  });

  it("should exhaust failover attempts and return error from last upstream", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest } = await import("@/lib/services/proxy-client");
    const { getUpstreamGroupByName, selectUpstream } = await import("@/lib/services/load-balancer");
    const { markUnhealthy } = await import("@/lib/services/health-checker");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-anthropic-1" },
      { upstreamId: "up-anthropic-2" },
      { upstreamId: "up-anthropic-3" },
    ]);
    vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
      { id: "up-anthropic-1" },
      { id: "up-anthropic-2" },
      { id: "up-anthropic-3" },
    ]);

    const anthropicGroup = {
      id: "group-1",
      name: "anthropic-group",
      provider: "anthropic",
      strategy: "round_robin",
      isActive: true,
    };

    const upstreams = [1, 2, 3].map((i) => ({
      id: `up-anthropic-${i}`,
      name: `anthropic-${i}`,
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      isActive: true,
      timeout: 60,
      weight: 1,
      groupId: "group-1",
    }));

    vi.mocked(getUpstreamGroupByName).mockResolvedValueOnce(anthropicGroup);

    // All upstreams fail
    vi.mocked(selectUpstream)
      .mockResolvedValueOnce({ upstream: upstreams[0], strategy: "round_robin" })
      .mockResolvedValueOnce({ upstream: upstreams[1], strategy: "round_robin" })
      .mockResolvedValueOnce({ upstream: upstreams[2], strategy: "round_robin" });

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
        "x-upstream-group": "anthropic-group",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-opus",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["messages"] }) });
    const data = await response.json();

    // After exhausting all attempts, should return 502
    expect(response.status).toBe(502);
    expect(data).toEqual({ error: "Failed to connect to upstream" });

    // All upstreams should be marked unhealthy
    expect(markUnhealthy).toHaveBeenCalledTimes(3);
    expect(forwardRequest).toHaveBeenCalledTimes(3);
  });

  it("should prefer X-Upstream-Name over X-Upstream-Group when both provided", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest, prepareUpstreamForProxy } = await import("@/lib/services/proxy-client");
    const { getUpstreamGroupByName, selectUpstream } = await import("@/lib/services/load-balancer");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-anthropic-1" },
    ]);

    const specificUpstream = {
      id: "up-anthropic-1",
      name: "anthropic-specific",
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      isDefault: false,
      isActive: true,
      timeout: 60,
    };

    vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce(specificUpstream);

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
        "x-upstream-name": "anthropic-specific",
        "x-upstream-group": "anthropic-group", // Should be ignored
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-opus",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["messages"] }) });

    expect(response.status).toBe(200);

    // Load balancer should NOT be used when X-Upstream-Name is provided
    expect(getUpstreamGroupByName).not.toHaveBeenCalled();
    expect(selectUpstream).not.toHaveBeenCalled();

    // Should use the specific upstream directly
    expect(prepareUpstreamForProxy).toHaveBeenCalledWith(specificUpstream);
    expect(forwardRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: "anthropic-specific" }),
      "messages",
      expect.any(String)
    );
  });

  it("should work with OpenAI group for chat/completions path", async () => {
    const { db } = await import("@/lib/db");
    const { forwardRequest, prepareUpstreamForProxy } = await import("@/lib/services/proxy-client");
    const { getUpstreamGroupByName, selectUpstream, recordConnection, releaseConnection } =
      await import("@/lib/services/load-balancer");
    const { markHealthy } = await import("@/lib/services/health-checker");

    vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
      { id: "key-1", keyHash: "hash-1", expiresAt: null, isActive: true },
    ]);
    vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
      { upstreamId: "up-openai-1" },
    ]);
    vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([{ id: "up-openai-1" }]);

    const openaiGroup = {
      id: "group-2",
      name: "openai-group",
      provider: "openai",
      strategy: "weighted",
      isActive: true,
    };

    const selectedUpstream = {
      id: "up-openai-1",
      name: "openai-1",
      provider: "openai",
      baseUrl: "https://api.openai.com",
      isActive: true,
      timeout: 60,
      weight: 10,
      groupId: "group-2",
    };

    vi.mocked(getUpstreamGroupByName).mockResolvedValueOnce(openaiGroup);
    vi.mocked(selectUpstream).mockResolvedValueOnce({
      upstream: selectedUpstream,
      strategy: "weighted",
    });

    vi.mocked(forwardRequest).mockResolvedValue({
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
        "x-upstream-group": "openai-group",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ path: ["chat", "completions"] }),
    });

    expect(response.status).toBe(200);
    expect(getUpstreamGroupByName).toHaveBeenCalledWith("openai-group");
    expect(selectUpstream).toHaveBeenCalledWith("group-2", undefined, undefined);
    expect(recordConnection).toHaveBeenCalledWith("up-openai-1");
    expect(releaseConnection).toHaveBeenCalledWith("up-openai-1");
    expect(markHealthy).toHaveBeenCalledWith("up-openai-1", 100);
    expect(prepareUpstreamForProxy).toHaveBeenCalledWith(selectedUpstream);
  });
});
