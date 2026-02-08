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
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  upstreams: {},
}));

const mockCreateUpstream = vi.fn();
const mockUpdateUpstream = vi.fn();
const mockDeleteUpstream = vi.fn();
const mockListUpstreams = vi.fn();
const mockGetUpstreamById = vi.fn();

vi.mock("@/lib/services/upstream-service", () => ({
  createUpstream: (...args: unknown[]) => mockCreateUpstream(...args),
  updateUpstream: (...args: unknown[]) => mockUpdateUpstream(...args),
  deleteUpstream: (...args: unknown[]) => mockDeleteUpstream(...args),
  listUpstreams: (...args: unknown[]) => mockListUpstreams(...args),
  getUpstreamById: (...args: unknown[]) => mockGetUpstreamById(...args),
  UpstreamNotFoundError: class UpstreamNotFoundError extends Error {},
}));

describe("Admin Upstreams API with new fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("POST /api/admin/upstreams - Create with new fields", () => {
    let POST: (request: NextRequest) => Promise<Response>;

    beforeEach(async () => {
      const routeModule = await import("@/app/api/admin/upstreams/route");
      POST = routeModule.POST;
    });

    it("should create upstream with provider_type", async () => {
      mockCreateUpstream.mockResolvedValueOnce({
        id: "upstream-1",
        name: "openai-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyMasked: "sk-***1234",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        weight: 1,
        priority: 0,
        providerType: "openai",
        allowedModels: null,
        modelRedirects: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest("http://localhost:3000/api/admin/upstreams", {
        method: "POST",
        headers: {
          authorization: "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "openai-upstream",
          provider: "openai",
          base_url: "https://api.openai.com",
          api_key: "sk-test-key-12345678",
          provider_type: "openai",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.provider_type).toBe("openai");
      expect(mockCreateUpstream).toHaveBeenCalledWith(
        expect.objectContaining({
          providerType: "openai",
        })
      );
    });

    it("should create upstream with allowed_models", async () => {
      mockCreateUpstream.mockResolvedValueOnce({
        id: "upstream-1",
        name: "openai-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyMasked: "sk-***1234",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        weight: 1,
        priority: 0,
        providerType: "openai",
        allowedModels: ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"],
        modelRedirects: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest("http://localhost:3000/api/admin/upstreams", {
        method: "POST",
        headers: {
          authorization: "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "openai-upstream",
          provider: "openai",
          base_url: "https://api.openai.com",
          api_key: "sk-test-key-12345678",
          provider_type: "openai",
          allowed_models: ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.allowed_models).toEqual(["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"]);
      expect(mockCreateUpstream).toHaveBeenCalledWith(
        expect.objectContaining({
          allowedModels: ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"],
        })
      );
    });

    it("should create upstream with model_redirects", async () => {
      mockCreateUpstream.mockResolvedValueOnce({
        id: "upstream-1",
        name: "anthropic-upstream",
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        apiKeyMasked: "sk-***1234",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        weight: 1,
        priority: 0,
        providerType: "anthropic",
        allowedModels: null,
        modelRedirects: { "claude-3": "claude-3-opus-20240229" },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest("http://localhost:3000/api/admin/upstreams", {
        method: "POST",
        headers: {
          authorization: "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "anthropic-upstream",
          provider: "anthropic",
          base_url: "https://api.anthropic.com",
          api_key: "sk-test-key-12345678",
          provider_type: "anthropic",
          model_redirects: { "claude-3": "claude-3-opus-20240229" },
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.model_redirects).toEqual({ "claude-3": "claude-3-opus-20240229" });
      expect(mockCreateUpstream).toHaveBeenCalledWith(
        expect.objectContaining({
          modelRedirects: { "claude-3": "claude-3-opus-20240229" },
        })
      );
    });

    it("should create upstream with all new fields", async () => {
      mockCreateUpstream.mockResolvedValueOnce({
        id: "upstream-1",
        name: "multi-model-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyMasked: "sk-***1234",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        weight: 1,
        priority: 0,
        providerType: "openai",
        allowedModels: ["gpt-4", "gpt-3.5-turbo"],
        modelRedirects: { "gpt-4-turbo": "gpt-4" },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest("http://localhost:3000/api/admin/upstreams", {
        method: "POST",
        headers: {
          authorization: "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "multi-model-upstream",
          provider: "openai",
          base_url: "https://api.openai.com",
          api_key: "sk-test-key-12345678",
          provider_type: "openai",
          allowed_models: ["gpt-4", "gpt-3.5-turbo"],
          model_redirects: { "gpt-4-turbo": "gpt-4" },
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.provider_type).toBe("openai");
      expect(data.allowed_models).toEqual(["gpt-4", "gpt-3.5-turbo"]);
      expect(data.model_redirects).toEqual({ "gpt-4-turbo": "gpt-4" });
    });

    it("should accept all valid provider_type values", async () => {
      const validProviderTypes = ["anthropic", "openai", "google", "custom"];

      for (const providerType of validProviderTypes) {
        vi.clearAllMocks();
        mockCreateUpstream.mockResolvedValueOnce({
          id: `upstream-${providerType}`,
          name: `${providerType}-upstream`,
          provider: "openai",
          baseUrl: "https://api.example.com",
          apiKeyMasked: "sk-***1234",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          weight: 1,
          priority: 0,
          providerType,
          allowedModels: null,
          modelRedirects: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const request = new NextRequest("http://localhost:3000/api/admin/upstreams", {
          method: "POST",
          headers: {
            authorization: "Bearer test-admin-token",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            name: `${providerType}-upstream`,
            provider: "openai",
            base_url: "https://api.example.com",
            api_key: "sk-test-key-12345678",
            provider_type: providerType,
          }),
        });

        const response = await POST(request);
        expect(response.status).toBe(201);
        const data = await response.json();
        expect(data.provider_type).toBe(providerType);
      }
    });

    it("should reject invalid provider_type", async () => {
      const request = new NextRequest("http://localhost:3000/api/admin/upstreams", {
        method: "POST",
        headers: {
          authorization: "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "invalid-upstream",
          provider: "openai",
          base_url: "https://api.openai.com",
          api_key: "sk-test-key-12345678",
          provider_type: "invalid-provider",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Validation error");
    });

    it("should accept null values for optional new fields", async () => {
      mockCreateUpstream.mockResolvedValueOnce({
        id: "upstream-1",
        name: "basic-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyMasked: "sk-***1234",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        weight: 1,
        priority: 0,
        providerType: null,
        allowedModels: null,
        modelRedirects: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest("http://localhost:3000/api/admin/upstreams", {
        method: "POST",
        headers: {
          authorization: "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "basic-upstream",
          provider: "openai",
          base_url: "https://api.openai.com",
          api_key: "sk-test-key-12345678",
          provider_type: null,
          allowed_models: null,
          model_redirects: null,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
    });
  });

  describe("PUT /api/admin/upstreams/[id] - Update with new fields", () => {
    let PUT: (
      request: NextRequest,
      context: { params: Promise<{ id: string }> }
    ) => Promise<Response>;

    beforeEach(async () => {
      const routeModule = await import("@/app/api/admin/upstreams/[id]/route");
      PUT = routeModule.PUT;
    });

    it("should update upstream provider_type", async () => {
      mockUpdateUpstream.mockResolvedValueOnce({
        id: "upstream-1",
        name: "updated-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyMasked: "sk-***1234",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        weight: 1,
        priority: 0,
        providerType: "anthropic",
        allowedModels: null,
        modelRedirects: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest("http://localhost:3000/api/admin/upstreams/upstream-1", {
        method: "PUT",
        headers: {
          authorization: "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          provider_type: "anthropic",
        }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: "upstream-1" }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.provider_type).toBe("anthropic");
      expect(mockUpdateUpstream).toHaveBeenCalledWith(
        "upstream-1",
        expect.objectContaining({
          providerType: "anthropic",
        })
      );
    });

    it("should update upstream allowed_models", async () => {
      mockUpdateUpstream.mockResolvedValueOnce({
        id: "upstream-1",
        name: "updated-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyMasked: "sk-***1234",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        weight: 1,
        priority: 0,
        providerType: "openai",
        allowedModels: ["gpt-4", "gpt-4-turbo-preview"],
        modelRedirects: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest("http://localhost:3000/api/admin/upstreams/upstream-1", {
        method: "PUT",
        headers: {
          authorization: "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          allowed_models: ["gpt-4", "gpt-4-turbo-preview"],
        }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: "upstream-1" }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.allowed_models).toEqual(["gpt-4", "gpt-4-turbo-preview"]);
      expect(mockUpdateUpstream).toHaveBeenCalledWith(
        "upstream-1",
        expect.objectContaining({
          allowedModels: ["gpt-4", "gpt-4-turbo-preview"],
        })
      );
    });

    it("should update upstream model_redirects", async () => {
      mockUpdateUpstream.mockResolvedValueOnce({
        id: "upstream-1",
        name: "updated-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyMasked: "sk-***1234",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        weight: 1,
        priority: 0,
        providerType: "openai",
        allowedModels: null,
        modelRedirects: { "gpt-4": "gpt-4-turbo" },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest("http://localhost:3000/api/admin/upstreams/upstream-1", {
        method: "PUT",
        headers: {
          authorization: "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model_redirects: { "gpt-4": "gpt-4-turbo" },
        }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: "upstream-1" }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.model_redirects).toEqual({ "gpt-4": "gpt-4-turbo" });
    });

    it("should clear allowed_models by setting to null", async () => {
      mockUpdateUpstream.mockResolvedValueOnce({
        id: "upstream-1",
        name: "updated-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyMasked: "sk-***1234",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        weight: 1,
        priority: 0,
        providerType: "openai",
        allowedModels: null,
        modelRedirects: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest("http://localhost:3000/api/admin/upstreams/upstream-1", {
        method: "PUT",
        headers: {
          authorization: "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          allowed_models: null,
        }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: "upstream-1" }) });
      expect(response.status).toBe(200);
    });

    it("should update all new fields simultaneously", async () => {
      mockUpdateUpstream.mockResolvedValueOnce({
        id: "upstream-1",
        name: "updated-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyMasked: "sk-***1234",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        weight: 1,
        priority: 0,
        providerType: "google",
        allowedModels: ["gemini-pro", "gemini-ultra"],
        modelRedirects: { gemini: "gemini-pro" },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest("http://localhost:3000/api/admin/upstreams/upstream-1", {
        method: "PUT",
        headers: {
          authorization: "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          provider_type: "google",
          allowed_models: ["gemini-pro", "gemini-ultra"],
          model_redirects: { gemini: "gemini-pro" },
        }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: "upstream-1" }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.provider_type).toBe("google");
      expect(data.allowed_models).toEqual(["gemini-pro", "gemini-ultra"]);
      expect(data.model_redirects).toEqual({ gemini: "gemini-pro" });
    });
  });

  describe("GET /api/admin/upstreams - List with new fields", () => {
    let GET: (request: NextRequest) => Promise<Response>;

    beforeEach(async () => {
      const routeModule = await import("@/app/api/admin/upstreams/route");
      GET = routeModule.GET;
    });

    it("should list upstreams with new fields included", async () => {
      mockListUpstreams.mockResolvedValueOnce({
        items: [
          {
            id: "upstream-1",
            name: "openai-upstream",
            provider: "openai",
            baseUrl: "https://api.openai.com",
            apiKeyMasked: "sk-***1234",
            isDefault: false,
            timeout: 60,
            isActive: true,
            config: null,
            weight: 1,
            priority: 0,
            providerType: "openai",
            allowedModels: ["gpt-4", "gpt-3.5-turbo"],
            modelRedirects: { "gpt-4-turbo": "gpt-4" },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: "upstream-2",
            name: "anthropic-upstream",
            provider: "anthropic",
            baseUrl: "https://api.anthropic.com",
            apiKeyMasked: "sk-***5678",
            isDefault: false,
            timeout: 60,
            isActive: true,
            config: null,
            weight: 1,
            priority: 0,
            providerType: "anthropic",
            allowedModels: null,
            modelRedirects: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        total: 2,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      });

      const request = new NextRequest("http://localhost:3000/api/admin/upstreams", {
        method: "GET",
        headers: {
          authorization: "Bearer test-admin-token",
        },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.items).toHaveLength(2);
      expect(data.items[0].provider_type).toBe("openai");
      expect(data.items[0].allowed_models).toEqual(["gpt-4", "gpt-3.5-turbo"]);
      expect(data.items[0].model_redirects).toEqual({ "gpt-4-turbo": "gpt-4" });
      expect(data.items[1].provider_type).toBe("anthropic");
    });

    it("should handle upstreams with null new fields", async () => {
      mockListUpstreams.mockResolvedValueOnce({
        items: [
          {
            id: "upstream-1",
            name: "legacy-upstream",
            provider: "openai",
            baseUrl: "https://api.openai.com",
            apiKeyMasked: "sk-***1234",
            isDefault: false,
            timeout: 60,
            isActive: true,
            config: null,
            weight: 1,
            priority: 0,
            providerType: null,
            allowedModels: null,
            modelRedirects: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      });

      const request = new NextRequest("http://localhost:3000/api/admin/upstreams", {
        method: "GET",
        headers: {
          authorization: "Bearer test-admin-token",
        },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.items[0].provider_type).toBeNull();
      expect(data.items[0].allowed_models).toBeNull();
      expect(data.items[0].model_redirects).toBeNull();
    });
  });

  describe("GET /api/admin/upstreams/[id] - Get single with new fields", () => {
    let GET: (
      request: NextRequest,
      context: { params: Promise<{ id: string }> }
    ) => Promise<Response>;

    beforeEach(async () => {
      const routeModule = await import("@/app/api/admin/upstreams/[id]/route");
      GET = routeModule.GET;
    });

    it("should return upstream with new fields", async () => {
      mockGetUpstreamById.mockResolvedValueOnce({
        id: "upstream-1",
        name: "detailed-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyMasked: "sk-***1234",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        weight: 5,
        priority: 10,
        providerType: "openai",
        allowedModels: ["gpt-4", "gpt-4-turbo", "gpt-4-vision"],
        modelRedirects: { "gpt-4-preview": "gpt-4-turbo" },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest("http://localhost:3000/api/admin/upstreams/upstream-1", {
        method: "GET",
        headers: {
          authorization: "Bearer test-admin-token",
        },
      });

      const response = await GET(request, { params: Promise.resolve({ id: "upstream-1" }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.provider_type).toBe("openai");
      expect(data.allowed_models).toEqual(["gpt-4", "gpt-4-turbo", "gpt-4-vision"]);
      expect(data.model_redirects).toEqual({ "gpt-4-preview": "gpt-4-turbo" });
    });
  });
});
