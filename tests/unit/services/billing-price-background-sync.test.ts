import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BackgroundSyncTaskDefinition,
  BackgroundSyncTaskRunRecord,
  BackgroundSyncTaskState,
  BackgroundSyncTaskStore,
} from "@/lib/services/background-sync-types";

const { syncBillingModelPricesMock } = vi.hoisted(() => ({
  syncBillingModelPricesMock: vi.fn(),
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
    definition: BackgroundSyncTaskDefinition
  ): Promise<BackgroundSyncTaskState> {
    const existing = this.states.get(definition.taskName);
    const state = {
      taskName: definition.taskName,
      displayName: definition.displayName,
      enabled: existing?.enabled ?? definition.defaultEnabled,
      intervalSeconds: existing?.intervalSeconds ?? definition.defaultIntervalSeconds,
      startupDelaySeconds: existing?.startupDelaySeconds ?? definition.defaultStartupDelaySeconds,
      isRunning: false,
      lastStartedAt: existing?.lastStartedAt ?? null,
      lastFinishedAt: existing?.lastFinishedAt ?? null,
      lastSuccessAt: existing?.lastSuccessAt ?? null,
      lastFailedAt: existing?.lastFailedAt ?? null,
      lastStatus: existing?.lastStatus ?? null,
      lastError: existing?.lastError ?? null,
      lastDurationMs: existing?.lastDurationMs ?? null,
      lastSuccessCount: existing?.lastSuccessCount ?? 0,
      lastFailureCount: existing?.lastFailureCount ?? 0,
      nextRunAt: existing?.nextRunAt ?? null,
      updatedAt: existing?.updatedAt ?? new Date(),
    };
    this.states.set(definition.taskName, state);
    return state;
  }

  async updateTaskConfig(
    taskName: string,
    update: {
      enabled?: boolean;
      intervalSeconds?: number;
      startupDelaySeconds?: number;
      nextRunAt?: Date | null;
    }
  ): Promise<BackgroundSyncTaskState | null> {
    const state = this.states.get(taskName);
    if (!state) return null;
    const nextState = {
      ...state,
      ...(update.enabled !== undefined ? { enabled: update.enabled } : {}),
      ...(update.intervalSeconds !== undefined ? { intervalSeconds: update.intervalSeconds } : {}),
      ...(update.startupDelaySeconds !== undefined
        ? { startupDelaySeconds: update.startupDelaySeconds }
        : {}),
      ...(update.nextRunAt !== undefined ? { nextRunAt: update.nextRunAt } : {}),
      updatedAt: new Date(),
    };
    this.states.set(taskName, nextState);
    return nextState;
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a definition with database-backed default configuration", async () => {
    const { createBillingPriceCatalogSyncTaskDefinition } =
      await import("@/lib/services/billing-price-background-sync");

    const definition = createBillingPriceCatalogSyncTaskDefinition();

    expect(definition.taskName).toBe("billing_price_catalog_sync");
    expect(definition.displayName).toBe("Price catalog sync");
    expect(definition.defaultEnabled).toBe(true);
    expect(definition.defaultIntervalSeconds).toBe(86_400);
    expect(definition.defaultStartupDelaySeconds).toBe(60);
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

  it("executes once after the default startup delay", async () => {
    const { BackgroundSyncScheduler } = await import("@/lib/services/background-sync-scheduler");
    const { createBillingPriceCatalogSyncTaskDefinition } =
      await import("@/lib/services/billing-price-background-sync");

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

    await vi.advanceTimersByTimeAsync(59_999);
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
