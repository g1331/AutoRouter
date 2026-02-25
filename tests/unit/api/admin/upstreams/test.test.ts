import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Mock modules before imports
vi.mock("@/lib/utils/config", () => ({
  config: {
    adminToken: "test-admin-token",
  },
  validateAdminToken: vi.fn((token: string | null) => token === "test-admin-token"),
}));

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader: string | null) => {
    if (!authHeader) return false;
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : authHeader.trim();
    return token === "test-admin-token";
  }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      upstreams: {
        findFirst: vi.fn(),
      },
    },
  },
  upstreams: {},
}));

vi.mock("@/lib/services/upstream-service", () => ({
  testUpstreamConnection: vi.fn(),
  getDecryptedApiKey: vi.fn(),
  formatTestUpstreamResponse: vi.fn((result) => ({
    success: result.success,
    message: result.message,
    latency_ms: result.latencyMs,
    status_code: result.statusCode,
    error_type: result.errorType,
    error_details: result.errorDetails,
    tested_at: result.testedAt.toISOString(),
  })),
}));

describe("POST /api/admin/upstreams/test", () => {
  let POST: (request: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamic import to ensure mocks are applied
    const routeModule = await import("@/app/api/admin/upstreams/test/route");
    POST = routeModule.POST;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should successfully test upstream with valid configuration", async () => {
    const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

    vi.mocked(testUpstreamConnection).mockResolvedValueOnce({
      success: true,
      message: "Connection successful",
      latencyMs: 150,
      statusCode: 200,
      errorType: undefined,
      errorDetails: undefined,
      testedAt: new Date("2024-01-01T00:00:00.000Z"),
    });

    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/test", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
      },
      body: JSON.stringify({
        route_capabilities: ["openai_chat_compatible"],
        base_url: "https://api.openai.com",
        api_key: "sk-test-key-12345678",
        timeout: 10,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      message: "Connection successful",
      latency_ms: 150,
      status_code: 200,
      error_type: undefined,
      error_details: undefined,
      tested_at: "2024-01-01T00:00:00.000Z",
    });

    expect(testUpstreamConnection).toHaveBeenCalledWith({
      routeCapabilities: ["openai_chat_compatible"],
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test-key-12345678",
      timeout: 10,
    });
  });

  it("should use default timeout when not provided", async () => {
    const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

    vi.mocked(testUpstreamConnection).mockResolvedValueOnce({
      success: true,
      message: "Connection successful",
      latencyMs: 150,
      statusCode: 200,
      errorType: undefined,
      errorDetails: undefined,
      testedAt: new Date("2024-01-01T00:00:00.000Z"),
    });

    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/test", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
      },
      body: JSON.stringify({
        route_capabilities: ["anthropic_messages"],
        base_url: "https://api.anthropic.com",
        api_key: "sk-ant-api03-test",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(testUpstreamConnection).toHaveBeenCalledWith({
      routeCapabilities: ["anthropic_messages"],
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-api03-test",
      timeout: 10, // Default timeout from Zod schema
    });
  });

  it("should return 401 when authorization header is missing", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/test", {
      method: "POST",
      body: JSON.stringify({
        route_capabilities: ["openai_chat_compatible"],
        base_url: "https://api.openai.com",
        api_key: "sk-test-key",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: "Unauthorized" });
  });

  it("should return 401 when authorization token is invalid", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/test", {
      method: "POST",
      headers: {
        authorization: "Bearer invalid-token",
      },
      body: JSON.stringify({
        route_capabilities: ["openai_chat_compatible"],
        base_url: "https://api.openai.com",
        api_key: "sk-test-key",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: "Unauthorized" });
  });

  it("should return 400 for invalid provider", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/test", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
      },
      body: JSON.stringify({
        route_capabilities: ["invalid-provider"],
        base_url: "https://api.example.com",
        api_key: "sk-test-key",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Validation error");
  });

  it("should return 400 for invalid base_url format", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/test", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
      },
      body: JSON.stringify({
        route_capabilities: ["openai_chat_compatible"],
        base_url: "not-a-valid-url",
        api_key: "sk-test-key-12345678",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Validation error");
    expect(data.error).toContain("Base URL must be a valid URL");
  });

  it("should return 400 for missing api_key", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/test", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
      },
      body: JSON.stringify({
        route_capabilities: ["openai_chat_compatible"],
        base_url: "https://api.openai.com",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Validation error");
  });

  it("should return 400 for api_key that is too short", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/test", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
      },
      body: JSON.stringify({
        route_capabilities: ["openai_chat_compatible"],
        base_url: "https://api.openai.com",
        api_key: "short",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Validation error");
    expect(data.error).toContain("at least 10 characters");
  });

  it("should return 400 for api_key that is too long", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/test", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
      },
      body: JSON.stringify({
        route_capabilities: ["openai_chat_compatible"],
        base_url: "https://api.openai.com",
        api_key: "a".repeat(513),
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Validation error");
    expect(data.error).toContain("not exceed 512 characters");
  });

  it("should return 400 for negative timeout", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/test", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
      },
      body: JSON.stringify({
        route_capabilities: ["openai_chat_compatible"],
        base_url: "https://api.openai.com",
        api_key: "sk-test-key-12345678",
        timeout: -5,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Validation error");
    expect(data.error).toContain("greater than 0");
  });

  it("should return 400 for timeout exceeding maximum", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/test", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
      },
      body: JSON.stringify({
        route_capabilities: ["openai_chat_compatible"],
        base_url: "https://api.openai.com",
        api_key: "sk-test-key-12345678",
        timeout: 301,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Validation error");
    expect(data.error).toContain("not exceed 300 seconds");
  });

  it("should return 400 for non-integer timeout", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/test", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
      },
      body: JSON.stringify({
        route_capabilities: ["openai_chat_compatible"],
        base_url: "https://api.openai.com",
        api_key: "sk-test-key-12345678",
        timeout: 10.5,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Validation error");
    expect(data.error).toContain("integer");
  });

  it("should return test failure result when connection test fails", async () => {
    const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

    vi.mocked(testUpstreamConnection).mockResolvedValueOnce({
      success: false,
      message: "Authentication failed - invalid API key",
      latencyMs: 100,
      statusCode: 401,
      errorType: "authentication",
      errorDetails: "HTTP 401: Invalid API key",
      testedAt: new Date("2024-01-01T00:00:00.000Z"),
    });

    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/test", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
      },
      body: JSON.stringify({
        route_capabilities: ["openai_chat_compatible"],
        base_url: "https://api.openai.com",
        api_key: "sk-invalid-key",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: false,
      message: "Authentication failed - invalid API key",
      latency_ms: 100,
      status_code: 401,
      error_type: "authentication",
      error_details: "HTTP 401: Invalid API key",
      tested_at: "2024-01-01T00:00:00.000Z",
    });
  });

  it("should return test failure result when network error occurs", async () => {
    const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

    vi.mocked(testUpstreamConnection).mockResolvedValueOnce({
      success: false,
      message: "Network error - could not reach upstream",
      latencyMs: null,
      statusCode: null,
      errorType: "network",
      errorDetails: "fetch failed",
      testedAt: new Date("2024-01-01T00:00:00.000Z"),
    });

    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/test", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
      },
      body: JSON.stringify({
        route_capabilities: ["openai_chat_compatible"],
        base_url: "https://invalid.example.com",
        api_key: "sk-test-key-12345678",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(false);
    expect(data.error_type).toBe("network");
    expect(data.latency_ms).toBeNull();
    expect(data.status_code).toBeNull();
  });

  it("should handle JSON parse errors", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/test", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
        "content-type": "application/json",
      },
      body: "invalid-json",
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Internal server error");
  });
});

describe("POST /api/admin/upstreams/[id]/test", () => {
  let POST: (
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamic import to ensure mocks are applied
    const routeModule = await import("@/app/api/admin/upstreams/[id]/test/route");
    POST = routeModule.POST;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should successfully test existing upstream by ID", async () => {
    const { db } = await import("@/lib/db");
    const { testUpstreamConnection, getDecryptedApiKey } =
      await import("@/lib/services/upstream-service");

    const mockUpstream = {
      id: "upstream-1",
      name: "test-upstream",
      routeCapabilities: ["openai_chat_compatible"],
      baseUrl: "https://api.openai.com",
      apiKeyEncrypted: "encrypted:sk-test-key",
      isDefault: false,
      timeout: 60,
      isActive: true,
      config: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce(mockUpstream);
    vi.mocked(getDecryptedApiKey).mockReturnValueOnce("sk-test-key-12345678");
    vi.mocked(testUpstreamConnection).mockResolvedValueOnce({
      success: true,
      message: "Connection successful",
      latencyMs: 200,
      statusCode: 200,
      errorType: undefined,
      errorDetails: undefined,
      testedAt: new Date("2024-01-01T00:00:00.000Z"),
    });

    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/upstream-1/test", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
      },
    });

    const context = { params: Promise.resolve({ id: "upstream-1" }) };
    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      message: "Connection successful",
      latency_ms: 200,
      status_code: 200,
      error_type: undefined,
      error_details: undefined,
      tested_at: "2024-01-01T00:00:00.000Z",
    });

    expect(db.query.upstreams.findFirst).toHaveBeenCalled();
    expect(getDecryptedApiKey).toHaveBeenCalledWith(mockUpstream);
    expect(testUpstreamConnection).toHaveBeenCalledWith({
      routeCapabilities: ["openai_chat_compatible"],
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test-key-12345678",
      timeout: 60,
    });
  });

  it("should return 401 when authorization header is missing", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/upstream-1/test", {
      method: "POST",
    });

    const context = { params: Promise.resolve({ id: "upstream-1" }) };
    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: "Unauthorized" });
  });

  it("should return 401 when authorization token is invalid", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/upstream-1/test", {
      method: "POST",
      headers: {
        authorization: "Bearer invalid-token",
      },
    });

    const context = { params: Promise.resolve({ id: "upstream-1" }) };
    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: "Unauthorized" });
  });

  it("should return 404 when upstream is not found", async () => {
    const { db } = await import("@/lib/db");

    vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce(undefined);

    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/non-existent/test", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
      },
    });

    const context = { params: Promise.resolve({ id: "non-existent" }) };
    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: "Upstream not found" });
    expect(db.query.upstreams.findFirst).toHaveBeenCalled();
  });

  it("should return test failure result when connection test fails for existing upstream", async () => {
    const { db } = await import("@/lib/db");
    const { testUpstreamConnection, getDecryptedApiKey } =
      await import("@/lib/services/upstream-service");

    const mockUpstream = {
      id: "upstream-1",
      name: "test-upstream",
      routeCapabilities: ["anthropic_messages"],
      baseUrl: "https://api.anthropic.com",
      apiKeyEncrypted: "encrypted:sk-ant-invalid",
      isDefault: false,
      timeout: 30,
      isActive: true,
      config: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce(mockUpstream);
    vi.mocked(getDecryptedApiKey).mockReturnValueOnce("sk-ant-invalid-key");
    vi.mocked(testUpstreamConnection).mockResolvedValueOnce({
      success: false,
      message: "Authentication failed - invalid API key",
      latencyMs: 120,
      statusCode: 403,
      errorType: "authentication",
      errorDetails: "HTTP 403: Forbidden",
      testedAt: new Date("2024-01-01T00:00:00.000Z"),
    });

    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/upstream-1/test", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
      },
    });

    const context = { params: Promise.resolve({ id: "upstream-1" }) };
    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: false,
      message: "Authentication failed - invalid API key",
      latency_ms: 120,
      status_code: 403,
      error_type: "authentication",
      error_details: "HTTP 403: Forbidden",
      tested_at: "2024-01-01T00:00:00.000Z",
    });
  });

  it("should return test failure result when timeout occurs", async () => {
    const { db } = await import("@/lib/db");
    const { testUpstreamConnection, getDecryptedApiKey } =
      await import("@/lib/services/upstream-service");

    const mockUpstream = {
      id: "upstream-1",
      name: "slow-upstream",
      routeCapabilities: ["openai_chat_compatible"],
      baseUrl: "https://slow-api.example.com",
      apiKeyEncrypted: "encrypted:sk-test-key",
      isDefault: false,
      timeout: 5,
      isActive: true,
      config: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce(mockUpstream);
    vi.mocked(getDecryptedApiKey).mockReturnValueOnce("sk-test-key");
    vi.mocked(testUpstreamConnection).mockResolvedValueOnce({
      success: false,
      message: "Request timed out after 5 seconds",
      latencyMs: null,
      statusCode: null,
      errorType: "timeout",
      errorDetails: "Request exceeded 5s timeout",
      testedAt: new Date("2024-01-01T00:00:00.000Z"),
    });

    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/upstream-1/test", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
      },
    });

    const context = { params: Promise.resolve({ id: "upstream-1" }) };
    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(false);
    expect(data.error_type).toBe("timeout");
    expect(data.latency_ms).toBeNull();
    expect(data.status_code).toBeNull();
  });

  it("should handle decryption errors gracefully", async () => {
    const { db } = await import("@/lib/db");
    const { getDecryptedApiKey } = await import("@/lib/services/upstream-service");

    const mockUpstream = {
      id: "upstream-1",
      name: "test-upstream",
      routeCapabilities: ["openai_chat_compatible"],
      baseUrl: "https://api.openai.com",
      apiKeyEncrypted: "invalid-encrypted-data",
      isDefault: false,
      timeout: 60,
      isActive: true,
      config: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce(mockUpstream);
    vi.mocked(getDecryptedApiKey).mockImplementationOnce(() => {
      throw new Error("Decryption failed");
    });

    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/upstream-1/test", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
      },
    });

    const context = { params: Promise.resolve({ id: "upstream-1" }) };
    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Internal server error");
  });

  it("should handle upstream with different provider (Anthropic)", async () => {
    const { db } = await import("@/lib/db");
    const { testUpstreamConnection, getDecryptedApiKey } =
      await import("@/lib/services/upstream-service");

    const mockUpstream = {
      id: "upstream-2",
      name: "anthropic-upstream",
      routeCapabilities: ["anthropic_messages"],
      baseUrl: "https://api.anthropic.com",
      apiKeyEncrypted: "encrypted:sk-ant-key",
      isDefault: true,
      timeout: 45,
      isActive: true,
      config: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce(mockUpstream);
    vi.mocked(getDecryptedApiKey).mockReturnValueOnce("sk-ant-api03-test-key");
    vi.mocked(testUpstreamConnection).mockResolvedValueOnce({
      success: true,
      message: "Connection successful",
      latencyMs: 180,
      statusCode: 200,
      errorType: undefined,
      errorDetails: undefined,
      testedAt: new Date("2024-01-01T00:00:00.000Z"),
    });

    const request = new NextRequest("http://localhost:3000/api/admin/upstreams/upstream-2/test", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
      },
    });

    const context = { params: Promise.resolve({ id: "upstream-2" }) };
    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(testUpstreamConnection).toHaveBeenCalledWith({
      routeCapabilities: ["anthropic_messages"],
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-api03-test-key",
      timeout: 45,
    });
  });
});
