import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Upstream } from "@/lib/db";
import type { UpstreamResponse } from "@/lib/services/upstream-crud";

const { mockConfig, loadActiveUpstreamsMock, refreshUpstreamCatalogMock } = vi.hoisted(() => ({
  mockConfig: {
    modelCatalogSyncEnabled: true,
    modelCatalogSyncIntervalSeconds: 86_400,
    backgroundSyncStartupDelaySeconds: 60,
  },
  loadActiveUpstreamsMock: vi.fn(),
  refreshUpstreamCatalogMock: vi.fn(),
}));

vi.mock("@/lib/utils/config", () => ({
  config: mockConfig,
}));

vi.mock("@/lib/services/upstream-service", () => ({
  loadActiveUpstreams: (...args: unknown[]) => loadActiveUpstreamsMock(...args),
  refreshUpstreamCatalog: (...args: unknown[]) => refreshUpstreamCatalogMock(...args),
}));

function createUpstream(overrides: Partial<Upstream> = {}): Upstream {
  return {
    id: "upstream-1",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    officialWebsiteUrl: null,
    apiKeyEncrypted: "encrypted-key",
    isDefault: false,
    timeout: 60,
    isActive: true,
    currentConcurrency: 0,
    maxConcurrency: null,
    queuePolicy: null,
    config: null,
    weight: 1,
    priority: 0,
    routeCapabilities: ["openai_chat_compatible"],
    allowedModels: null,
    modelRedirects: null,
    modelDiscovery: {
      mode: "openai_compatible",
      customEndpoint: null,
      enableLiteLlmFallback: false,
      autoRefreshEnabled: true,
    },
    modelCatalog: null,
    modelCatalogUpdatedAt: null,
    modelCatalogLastStatus: null,
    modelCatalogLastError: null,
    modelCatalogLastFailedAt: null,
    modelRules: null,
    affinityMigration: null,
    billingInputMultiplier: 1,
    billingOutputMultiplier: 1,
    spendingRules: null,
    createdAt: new Date("2026-04-25T00:00:00.000Z"),
    updatedAt: new Date("2026-04-25T00:00:00.000Z"),
    ...overrides,
  } as Upstream;
}

function createRefreshResponse(overrides: Partial<UpstreamResponse> = {}): UpstreamResponse {
  return {
    id: "upstream-1",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    officialWebsiteUrl: null,
    apiKeyMasked: "sk-***1234",
    isDefault: false,
    timeout: 60,
    isActive: true,
    currentConcurrency: 0,
    maxConcurrency: null,
    queuePolicy: null,
    config: null,
    weight: 1,
    priority: 0,
    routeCapabilities: ["openai_chat_compatible"],
    allowedModels: null,
    modelRedirects: null,
    modelDiscovery: {
      mode: "openai_compatible",
      customEndpoint: null,
      enableLiteLlmFallback: false,
      autoRefreshEnabled: true,
    },
    modelCatalog: [{ model: "gpt-4.1", source: "native" }],
    modelCatalogUpdatedAt: new Date("2026-04-25T00:00:00.000Z"),
    modelCatalogLastStatus: "success",
    modelCatalogLastError: null,
    modelCatalogLastFailedAt: null,
    modelRules: null,
    affinityMigration: null,
    billingInputMultiplier: 1,
    billingOutputMultiplier: 1,
    spendingRules: null,
    lastUsedAt: null,
    createdAt: new Date("2026-04-25T00:00:00.000Z"),
    updatedAt: new Date("2026-04-25T00:00:00.000Z"),
    circuitBreaker: null,
    ...overrides,
  };
}

describe("upstream model catalog background sync task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.modelCatalogSyncEnabled = true;
    mockConfig.modelCatalogSyncIntervalSeconds = 86_400;
    mockConfig.backgroundSyncStartupDelaySeconds = 60;
  });

  it("creates a definition from background sync configuration", async () => {
    const { createUpstreamModelCatalogSyncTaskDefinition } =
      await import("@/lib/services/upstream-model-catalog-background-sync");

    mockConfig.modelCatalogSyncEnabled = false;
    mockConfig.modelCatalogSyncIntervalSeconds = 3_600;
    mockConfig.backgroundSyncStartupDelaySeconds = 20;

    const definition = createUpstreamModelCatalogSyncTaskDefinition();

    expect(definition.taskName).toBe("upstream_model_catalog_sync");
    expect(definition.displayName).toBe("Model catalog auto refresh");
    expect(definition.enabled).toBe(false);
    expect(definition.intervalSeconds).toBe(3_600);
    expect(definition.startupDelaySeconds).toBe(20);
  });

  it("refreshes only active upstreams with auto refresh explicitly enabled", async () => {
    const { runUpstreamModelCatalogSyncTask } =
      await import("@/lib/services/upstream-model-catalog-background-sync");

    loadActiveUpstreamsMock.mockResolvedValueOnce([
      createUpstream({ id: "enabled", name: "Enabled" }),
      createUpstream({
        id: "disabled",
        name: "Disabled",
        modelDiscovery: {
          mode: "openai_compatible",
          customEndpoint: null,
          enableLiteLlmFallback: false,
          autoRefreshEnabled: false,
        },
      }),
      createUpstream({
        id: "legacy",
        name: "Legacy",
        modelDiscovery: {
          mode: "openai_compatible",
          customEndpoint: null,
          enableLiteLlmFallback: false,
        } as Upstream["modelDiscovery"],
      }),
      createUpstream({ id: "inactive", name: "Inactive", isActive: false }),
    ]);
    refreshUpstreamCatalogMock.mockResolvedValueOnce(
      createRefreshResponse({ id: "enabled", name: "Enabled" })
    );

    await expect(runUpstreamModelCatalogSyncTask()).resolves.toEqual({
      status: "success",
      successCount: 1,
      failureCount: 0,
      errorSummary: null,
    });
    expect(refreshUpstreamCatalogMock).toHaveBeenCalledTimes(1);
    expect(refreshUpstreamCatalogMock).toHaveBeenCalledWith("enabled");
  });

  it("returns success without refreshing when no upstream opted in", async () => {
    const { runUpstreamModelCatalogSyncTask } =
      await import("@/lib/services/upstream-model-catalog-background-sync");

    loadActiveUpstreamsMock.mockResolvedValueOnce([
      createUpstream({ id: "manual-only", modelDiscovery: null }),
    ]);

    await expect(runUpstreamModelCatalogSyncTask()).resolves.toEqual({
      status: "success",
      successCount: 0,
      failureCount: 0,
      errorSummary: null,
    });
    expect(refreshUpstreamCatalogMock).not.toHaveBeenCalled();
  });

  it("records partial status when some eligible upstreams fail", async () => {
    const { runUpstreamModelCatalogSyncTask } =
      await import("@/lib/services/upstream-model-catalog-background-sync");

    loadActiveUpstreamsMock.mockResolvedValueOnce([
      createUpstream({ id: "ok", name: "OK" }),
      createUpstream({ id: "failed", name: "Failed" }),
    ]);
    refreshUpstreamCatalogMock
      .mockResolvedValueOnce(createRefreshResponse({ id: "ok", name: "OK" }))
      .mockResolvedValueOnce(
        createRefreshResponse({
          id: "failed",
          name: "Failed",
          modelCatalog: [{ model: "old-model", source: "native" }],
          modelCatalogLastStatus: "failed",
          modelCatalogLastError: "HTTP 500",
          modelCatalogLastFailedAt: new Date("2026-04-25T00:00:00.000Z"),
        })
      );

    const result = await runUpstreamModelCatalogSyncTask();

    expect(result).toEqual({
      status: "partial",
      successCount: 1,
      failureCount: 1,
      errorSummary: "Failed: HTTP 500",
    });
  });

  it("records failed status and error summary when all eligible upstreams fail", async () => {
    const { runUpstreamModelCatalogSyncTask } =
      await import("@/lib/services/upstream-model-catalog-background-sync");

    loadActiveUpstreamsMock.mockResolvedValueOnce([
      createUpstream({ id: "failed", name: "Failed" }),
    ]);
    refreshUpstreamCatalogMock.mockRejectedValueOnce(new Error("network down"));

    const result = await runUpstreamModelCatalogSyncTask();

    expect(result).toEqual({
      status: "failed",
      successCount: 0,
      failureCount: 1,
      errorSummary: "Failed: network down",
    });
  });

  it("registers upstream model catalog sync in the shared registry", async () => {
    const { getBackgroundSyncTaskDefinitions } =
      await import("@/lib/services/background-sync-registry");

    expect(getBackgroundSyncTaskDefinitions().map((definition) => definition.taskName)).toContain(
      "upstream_model_catalog_sync"
    );
  });
});
