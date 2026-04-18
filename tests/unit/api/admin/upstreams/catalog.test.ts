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

const mockRefreshUpstreamCatalog = vi.fn();
const mockImportUpstreamCatalogModels = vi.fn();

vi.mock("@/lib/services/upstream-service", () => ({
  refreshUpstreamCatalog: (...args: unknown[]) => mockRefreshUpstreamCatalog(...args),
  importUpstreamCatalogModels: (...args: unknown[]) => mockImportUpstreamCatalogModels(...args),
  UpstreamNotFoundError: class UpstreamNotFoundError extends Error {},
}));

const upstreamResponse = {
  id: "upstream-1",
  name: "gateway-upstream",
  baseUrl: "https://gateway.example.com/codex/v1",
  officialWebsiteUrl: null,
  apiKeyMasked: "sk-***1234",
  isDefault: false,
  timeout: 60,
  isActive: true,
  currentConcurrency: 0,
  maxConcurrency: null,
  config: null,
  weight: 1,
  priority: 0,
  routeCapabilities: ["openai_chat_compatible"],
  allowedModels: ["gpt-4.1"],
  modelRedirects: { "gpt-4.1-preview": "gpt-4.1" },
  modelDiscovery: {
    mode: "openai_compatible",
    customEndpoint: null,
    enableLiteLlmFallback: true,
  },
  modelCatalog: [
    { model: "gpt-4.1", source: "native" },
    { model: "gpt-4.1-mini", source: "inferred" },
  ],
  modelCatalogUpdatedAt: new Date("2026-04-18T03:00:00.000Z"),
  modelCatalogLastStatus: "success" as const,
  modelCatalogLastError: null,
  modelCatalogLastFailedAt: null,
  modelRules: [
    {
      type: "exact" as const,
      value: "gpt-4.1",
      targetModel: null,
      source: "native" as const,
      displayLabel: "精确匹配",
    },
  ],
  affinityMigration: null,
  billingInputMultiplier: 1,
  billingOutputMultiplier: 1,
  spendingRules: null,
  lastUsedAt: null,
  createdAt: new Date("2026-04-18T02:00:00.000Z"),
  updatedAt: new Date("2026-04-18T03:00:00.000Z"),
  circuitBreaker: null,
};

describe("Admin Upstream Catalog API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should refresh an upstream catalog", async () => {
    const { POST } = await import("@/app/api/admin/upstreams/[id]/catalog/refresh/route");
    mockRefreshUpstreamCatalog.mockResolvedValueOnce(upstreamResponse);

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upstreams/upstream-1/catalog/refresh",
      {
        method: "POST",
        headers: {
          authorization: "Bearer test-admin-token",
        },
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: "upstream-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.model_catalog).toEqual([
      { model: "gpt-4.1", source: "native" },
      { model: "gpt-4.1-mini", source: "inferred" },
    ]);
    expect(mockRefreshUpstreamCatalog).toHaveBeenCalledWith("upstream-1");
  });

  it("should import selected catalog models into upstream rules", async () => {
    const { POST } = await import("@/app/api/admin/upstreams/[id]/catalog/import/route");
    mockImportUpstreamCatalogModels.mockResolvedValueOnce(upstreamResponse);

    const request = new NextRequest(
      "http://localhost:3000/api/admin/upstreams/upstream-1/catalog/import",
      {
        method: "POST",
        headers: {
          authorization: "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          models: ["gpt-4.1", "gpt-4.1-mini"],
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: "upstream-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.model_rules).toEqual([
      {
        type: "exact",
        value: "gpt-4.1",
        target_model: null,
        source: "native",
        display_label: "精确匹配",
      },
    ]);
    expect(mockImportUpstreamCatalogModels).toHaveBeenCalledWith("upstream-1", [
      "gpt-4.1",
      "gpt-4.1-mini",
    ]);
  });
});
