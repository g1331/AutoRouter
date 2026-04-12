import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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

const mockRefreshStoredUpstreamModelCatalog = vi.fn();
const mockImportStoredUpstreamCatalogModels = vi.fn();

class MockUpstreamNotFoundError extends Error {}

vi.mock("@/lib/services/upstream-service", () => ({
  refreshStoredUpstreamModelCatalog: (...args: unknown[]) =>
    mockRefreshStoredUpstreamModelCatalog(...args),
  importStoredUpstreamCatalogModels: (...args: unknown[]) =>
    mockImportStoredUpstreamCatalogModels(...args),
  UpstreamNotFoundError: MockUpstreamNotFoundError,
}));

describe("Admin Upstream Catalog API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("POST /api/admin/upstreams/[id]/catalog/refresh", () => {
    let POST: (
      request: NextRequest,
      context: { params: Promise<{ id: string }> }
    ) => Promise<Response>;

    beforeEach(async () => {
      const routeModule = await import("@/app/api/admin/upstreams/[id]/catalog/refresh/route");
      POST = routeModule.POST;
    });

    it("should reject unauthorized refresh requests", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/admin/upstreams/up-1/catalog/refresh",
        {
          method: "POST",
        }
      );

      const response = await POST(request, { params: Promise.resolve({ id: "up-1" }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data).toEqual({ error: "Unauthorized" });
    });

    it("should return refreshed upstream payload and refresh metadata", async () => {
      mockRefreshStoredUpstreamModelCatalog.mockResolvedValueOnce({
        upstream: {
          id: "up-1",
          name: "catalog-upstream",
          baseUrl: "https://api.openai.com",
          officialWebsiteUrl: null,
          apiKeyMasked: "sk-***-key",
          isDefault: false,
          timeout: 60,
          isActive: true,
          currentConcurrency: 0,
          maxConcurrency: null,
          config: null,
          weight: 1,
          priority: 0,
          routeCapabilities: ["openai_chat_compatible"],
          allowedModels: null,
          modelRedirects: null,
          modelDiscovery: { mode: "openai_compatible", enableLiteLlmFallback: true },
          modelCatalog: [{ model: "gpt-4.1", source: "native" }],
          modelCatalogUpdatedAt: new Date("2026-04-11T08:00:00.000Z"),
          modelCatalogLastFailedAt: null,
          modelCatalogLastStatus: "success",
          modelCatalogLastError: null,
          modelRules: null,
          affinityMigration: null,
          spendingRules: null,
          lastUsedAt: null,
          createdAt: new Date("2026-04-10T08:00:00.000Z"),
          updatedAt: new Date("2026-04-11T08:00:00.000Z"),
        },
        resolvedMode: "openai_compatible",
        fallbackUsed: false,
        modelCatalog: [{ model: "gpt-4.1", source: "native" }],
        modelCatalogUpdatedAt: new Date("2026-04-11T08:00:00.000Z"),
        modelCatalogLastFailedAt: null,
        modelCatalogLastStatus: "success",
        modelCatalogLastError: null,
      });

      const request = new NextRequest(
        "http://localhost:3000/api/admin/upstreams/up-1/catalog/refresh",
        {
          method: "POST",
          headers: {
            authorization: "Bearer test-admin-token",
          },
        }
      );

      const response = await POST(request, { params: Promise.resolve({ id: "up-1" }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.refresh).toEqual({
        resolved_mode: "openai_compatible",
        fallback_used: false,
        status: "success",
        failed_at: null,
        error: null,
      });
      expect(data.upstream.model_catalog).toEqual([{ model: "gpt-4.1", source: "native" }]);
      expect(mockRefreshStoredUpstreamModelCatalog).toHaveBeenCalledWith("up-1");
    });

    it("should expose inferred legacy discovery config in the refresh response", async () => {
      mockRefreshStoredUpstreamModelCatalog.mockResolvedValueOnce({
        upstream: {
          id: "up-legacy",
          name: "legacy-anyrouter",
          baseUrl: "https://api.anyrouter.top",
          officialWebsiteUrl: null,
          apiKeyMasked: "sk-***-key",
          isDefault: false,
          timeout: 60,
          isActive: true,
          currentConcurrency: 0,
          maxConcurrency: null,
          config: null,
          weight: 1,
          priority: 0,
          routeCapabilities: ["anthropic_messages"],
          allowedModels: null,
          modelRedirects: null,
          modelDiscovery: {
            mode: "anthropic_native",
            customEndpoint: null,
            enableLiteLlmFallback: true,
          },
          modelCatalog: [{ model: "claude-3-7-sonnet", source: "native" }],
          modelCatalogUpdatedAt: new Date("2026-04-11T08:00:00.000Z"),
          modelCatalogLastFailedAt: null,
          modelCatalogLastStatus: "success",
          modelCatalogLastError: null,
          modelRules: null,
          affinityMigration: null,
          spendingRules: null,
          lastUsedAt: null,
          createdAt: new Date("2026-04-10T08:00:00.000Z"),
          updatedAt: new Date("2026-04-11T08:00:00.000Z"),
        },
        resolvedMode: "anthropic_native",
        fallbackUsed: true,
        modelCatalog: [{ model: "claude-3-7-sonnet", source: "native" }],
        modelCatalogUpdatedAt: new Date("2026-04-11T08:00:00.000Z"),
        modelCatalogLastFailedAt: null,
        modelCatalogLastStatus: "success",
        modelCatalogLastError: null,
      });

      const request = new NextRequest(
        "http://localhost:3000/api/admin/upstreams/up-legacy/catalog/refresh",
        {
          method: "POST",
          headers: {
            authorization: "Bearer test-admin-token",
          },
        }
      );

      const response = await POST(request, { params: Promise.resolve({ id: "up-legacy" }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.refresh).toEqual({
        resolved_mode: "anthropic_native",
        fallback_used: true,
        status: "success",
        failed_at: null,
        error: null,
      });
      expect(data.upstream.model_discovery).toEqual({
        mode: "anthropic_native",
        custom_endpoint: null,
        enable_lite_llm_fallback: true,
      });
    });

    it("should expose a failure timestamp when catalog refresh fails", async () => {
      mockRefreshStoredUpstreamModelCatalog.mockResolvedValueOnce({
        upstream: {
          id: "up-failed",
          name: "failed-upstream",
          baseUrl: "https://api.openai.com",
          officialWebsiteUrl: null,
          apiKeyMasked: "sk-***-key",
          isDefault: false,
          timeout: 60,
          isActive: true,
          currentConcurrency: 0,
          maxConcurrency: null,
          config: null,
          weight: 1,
          priority: 0,
          routeCapabilities: ["openai_chat_compatible"],
          allowedModels: null,
          modelRedirects: null,
          modelDiscovery: {
            mode: "openai_compatible",
            customEndpoint: "/v1/models",
            enableLiteLlmFallback: false,
          },
          modelCatalog: null,
          modelCatalogUpdatedAt: null,
          modelCatalogLastFailedAt: new Date("2026-04-11T09:30:00.000Z"),
          modelCatalogLastStatus: "failure",
          modelCatalogLastError: "Discovery timeout",
          modelRules: null,
          affinityMigration: null,
          spendingRules: null,
          lastUsedAt: null,
          createdAt: new Date("2026-04-10T08:00:00.000Z"),
          updatedAt: new Date("2026-04-11T09:30:00.000Z"),
        },
        resolvedMode: "openai_compatible",
        fallbackUsed: false,
        modelCatalog: null,
        modelCatalogUpdatedAt: null,
        modelCatalogLastFailedAt: new Date("2026-04-11T09:30:00.000Z"),
        modelCatalogLastStatus: "failure",
        modelCatalogLastError: "Discovery timeout",
      });

      const request = new NextRequest(
        "http://localhost:3000/api/admin/upstreams/up-failed/catalog/refresh",
        {
          method: "POST",
          headers: {
            authorization: "Bearer test-admin-token",
          },
        }
      );

      const response = await POST(request, { params: Promise.resolve({ id: "up-failed" }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.refresh).toEqual({
        resolved_mode: "openai_compatible",
        fallback_used: false,
        status: "failure",
        failed_at: "2026-04-11T09:30:00.000Z",
        error: "Discovery timeout",
      });
      expect(data.upstream.model_catalog_last_failed_at).toBe("2026-04-11T09:30:00.000Z");
    });
  });

  describe("POST /api/admin/upstreams/[id]/catalog/import", () => {
    let POST: (
      request: NextRequest,
      context: { params: Promise<{ id: string }> }
    ) => Promise<Response>;

    beforeEach(async () => {
      const routeModule = await import("@/app/api/admin/upstreams/[id]/catalog/import/route");
      POST = routeModule.POST;
    });

    it("should validate that at least one model is provided", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/admin/upstreams/up-1/catalog/import",
        {
          method: "POST",
          headers: {
            authorization: "Bearer test-admin-token",
            "content-type": "application/json",
          },
          body: JSON.stringify({ models: [] }),
        }
      );

      const response = await POST(request, { params: Promise.resolve({ id: "up-1" }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Validation error");
    });

    it("should import selected catalog models into explicit rules", async () => {
      mockImportStoredUpstreamCatalogModels.mockResolvedValueOnce({
        id: "up-1",
        name: "catalog-upstream",
        baseUrl: "https://api.openai.com",
        officialWebsiteUrl: null,
        apiKeyMasked: "sk-***-key",
        isDefault: false,
        timeout: 60,
        isActive: true,
        currentConcurrency: 0,
        maxConcurrency: null,
        config: null,
        weight: 1,
        priority: 0,
        routeCapabilities: ["openai_chat_compatible"],
        allowedModels: null,
        modelRedirects: null,
        modelDiscovery: null,
        modelCatalog: [{ model: "gpt-4.1-mini", source: "inferred" }],
        modelCatalogUpdatedAt: null,
        modelCatalogLastStatus: null,
        modelCatalogLastError: null,
        modelRules: [{ type: "exact", model: "gpt-4.1-mini", source: "inferred" }],
        affinityMigration: null,
        spendingRules: null,
        lastUsedAt: null,
        createdAt: new Date("2026-04-10T08:00:00.000Z"),
        updatedAt: new Date("2026-04-11T08:00:00.000Z"),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/admin/upstreams/up-1/catalog/import",
        {
          method: "POST",
          headers: {
            authorization: "Bearer test-admin-token",
            "content-type": "application/json",
          },
          body: JSON.stringify({ models: ["gpt-4.1-mini"] }),
        }
      );

      const response = await POST(request, { params: Promise.resolve({ id: "up-1" }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.model_rules).toEqual([
        { type: "exact", model: "gpt-4.1-mini", source: "inferred" },
      ]);
      expect(mockImportStoredUpstreamCatalogModels).toHaveBeenCalledWith("up-1", {
        models: ["gpt-4.1-mini"],
      });
    });
  });
});
