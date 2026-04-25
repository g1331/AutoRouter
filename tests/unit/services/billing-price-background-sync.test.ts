import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BackgroundSyncTaskDefinition,
  BackgroundSyncTaskRunRecord,
  BackgroundSyncTaskState,
  BackgroundSyncTaskStore,
} from "@/lib/services/background-sync-types";

const { mockConfig, syncBillingModelPricesMock } = vi.hoisted(() => ({
  mockConfig: {
    backgroundSyncEnabled: true,
    billingPriceSyncEnabled: true,
    billingPriceSyncIntervalSeconds: 86_400,
    backgroundSyncStartupDelaySeconds: 60,
  },
  syncBillingModelPricesMock: vi.fn(),
}));

vi.mock("@/lib/utils/config", () => ({
  config: mockConfig,
}));

vi.mock("@/lib/services/billing-price-service", () => ({
  syncBillingModelPrices: (...args: unknown[]) => syncBillingModelPricesMock(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

class MemoryBackgroundSyncTaskStore implements BackgroundSyncTaskStore {
  states = new Map<string, BackgroundSyncTaskState>();
  runs: BackgroundSyncTaskRunRecord[] = [];

  async ensureTaskDefinition(
    definition: BackgroundSyncTaskDefinition,
    nextRunAt: Date | null
  ): Promise<void> {
    this.states.set(definition.taskName, {
      taskName: definition.taskName,
      displayName: definition.displayName,
      enabled: definition.enabled,
      intervalSeconds: definition.intervalSeconds,
      startupDelaySeconds: definition.startupDelaySeconds,
      isRunning: false,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastSuccessAt: null,
      lastFailedAt: null,
      lastStatus: null,
      lastError: null,
      lastDurationMs: null,
      lastSuccessCount: 0,
      lastFailureCount: 0,
      nextRunAt,
      updatedAt: new Date(),
    });
  }

  async markTaskStarted(taskName: string, startedAt: Date): Promise<void> {
    const state = this.states.get(taskName);
    if (!state) return;
    this.states.set(taskName, {
      ...state,
      lastStartedAt: startedAt,
      lastStatus: "running",
      updatedAt: new Date(),
    });
  }

  async recordTaskRun(record: BackgroundSyncTaskRunRecord, nextRunAt: Date | null): Promise<void> {
    this.runs.push(record);
    const state = this.states.get(record.taskName);
    if (!state) return;
    this.states.set(record.taskName, {
      ...state,
      lastFinishedAt: record.finishedAt,
      lastStatus: record.status,
      lastError: record.errorSummary,
      lastDurationMs: record.durationMs,
      lastSuccessCount: record.successCount,
      lastFailureCount: record.failureCount,
      nextRunAt,
      updatedAt: new Date(),
    });
  }

  async listTaskStates(
    definitions: BackgroundSyncTaskDefinition[],
    runningTaskNames: Set<string>
  ): Promise<BackgroundSyncTaskState[]> {
    return definitions.map((definition) => ({
      ...this.states.get(definition.taskName)!,
      isRunning: runningTaskNames.has(definition.taskName),
    }));
  }
}

describe("billing price catalog background sync task", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T00:00:00.000Z"));
    vi.clearAllMocks();
    mockConfig.backgroundSyncEnabled = true;
    mockConfig.billingPriceSyncEnabled = true;
    mockConfig.billingPriceSyncIntervalSeconds = 86_400;
    mockConfig.backgroundSyncStartupDelaySeconds = 60;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a definition from background sync configuration", async () => {
    const { createBillingPriceCatalogSyncTaskDefinition } =
      await import("@/lib/services/billing-price-background-sync");

    mockConfig.billingPriceSyncEnabled = false;
    mockConfig.billingPriceSyncIntervalSeconds = 3_600;
    mockConfig.backgroundSyncStartupDelaySeconds = 15;

    const definition = createBillingPriceCatalogSyncTaskDefinition();

    expect(definition.taskName).toBe("billing_price_catalog_sync");
    expect(definition.displayName).toBe("Price catalog sync");
    expect(definition.enabled).toBe(false);
    expect(definition.intervalSeconds).toBe(3_600);
    expect(definition.startupDelaySeconds).toBe(15);
  });

  it("converts successful billing sync results into background task results", async () => {
    const { runBillingPriceCatalogSyncTask } =
      await import("@/lib/services/billing-price-background-sync");

    syncBillingModelPricesMock.mockResolvedValueOnce({
      status: "success",
      source: "litellm",
      successCount: 12,
      failureCount: 0,
      failureReason: null,
      syncedAt: new Date("2026-04-25T00:00:00.000Z"),
    });

    await expect(runBillingPriceCatalogSyncTask()).resolves.toEqual({
      status: "success",
      successCount: 12,
      failureCount: 0,
      errorSummary: null,
    });
  });

  it("converts failed billing sync results without throwing", async () => {
    const { runBillingPriceCatalogSyncTask } =
      await import("@/lib/services/billing-price-background-sync");

    syncBillingModelPricesMock.mockResolvedValueOnce({
      status: "failed",
      source: null,
      successCount: 0,
      failureCount: 1,
      failureReason: "LiteLLM returned no valid price rows",
      syncedAt: new Date("2026-04-25T00:00:00.000Z"),
    });

    await expect(runBillingPriceCatalogSyncTask()).resolves.toEqual({
      status: "failed",
      successCount: 0,
      failureCount: 1,
      errorSummary: "LiteLLM returned no valid price rows",
    });
  });

  it("executes once after the configured startup delay", async () => {
    const { BackgroundSyncScheduler } = await import("@/lib/services/background-sync-scheduler");
    const { createBillingPriceCatalogSyncTaskDefinition } =
      await import("@/lib/services/billing-price-background-sync");

    mockConfig.backgroundSyncStartupDelaySeconds = 10;
    syncBillingModelPricesMock.mockResolvedValue({
      status: "success",
      source: "litellm",
      successCount: 1,
      failureCount: 0,
      failureReason: null,
      syncedAt: new Date("2026-04-25T00:00:00.000Z"),
    });

    const scheduler = new BackgroundSyncScheduler(
      [createBillingPriceCatalogSyncTaskDefinition()],
      new MemoryBackgroundSyncTaskStore()
    );
    await scheduler.start();

    await vi.advanceTimersByTimeAsync(9_999);
    expect(syncBillingModelPricesMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(syncBillingModelPricesMock).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });

  it("registers billing price catalog sync in the shared registry", async () => {
    const { getBackgroundSyncTaskDefinitions } =
      await import("@/lib/services/background-sync-registry");

    const definitions = getBackgroundSyncTaskDefinitions();

    expect(
      definitions.map((definition: BackgroundSyncTaskDefinition) => definition.taskName)
    ).toContain("billing_price_catalog_sync");
  });
});
