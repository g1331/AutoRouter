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

describe("proxy route upstream selection", () => {
  let POST: (
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
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
