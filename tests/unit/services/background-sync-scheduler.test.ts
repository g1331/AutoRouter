import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BackgroundSyncTaskDefinition,
  BackgroundSyncTaskRunRecord,
  BackgroundSyncTaskState,
  BackgroundSyncTaskStore,
} from "@/lib/services/background-sync-types";

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
      lastError: null,
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
      lastSuccessAt:
        record.status === "success" || record.status === "partial"
          ? record.finishedAt
          : state.lastSuccessAt,
      lastFailedAt:
        record.status === "failed" || record.status === "partial"
          ? record.finishedAt
          : state.lastFailedAt,
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
    return definitions.map((definition) => {
      const state = this.states.get(definition.taskName);
      return {
        ...(state ?? {
          taskName: definition.taskName,
          displayName: definition.displayName,
          enabled: definition.defaultEnabled,
          intervalSeconds: definition.defaultIntervalSeconds,
          startupDelaySeconds: definition.defaultStartupDelaySeconds,
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
          nextRunAt: null,
          updatedAt: null,
        }),
        isRunning: runningTaskNames.has(definition.taskName),
      };
    });
  }
}

function createTask(
  overrides: Partial<BackgroundSyncTaskDefinition> = {}
): BackgroundSyncTaskDefinition {
  return {
    taskName: "test_sync",
    displayName: "Test Sync",
    defaultEnabled: true,
    defaultIntervalSeconds: 60,
    defaultStartupDelaySeconds: 5,
    run: vi.fn(async () => ({
      status: "success",
      successCount: 1,
      failureCount: 0,
      errorSummary: null,
    })),
    ...overrides,
  };
}

describe("BackgroundSyncScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers enabled tasks and executes after startup delay", async () => {
    const { BackgroundSyncScheduler } = await import("@/lib/services/background-sync-scheduler");
    const task = createTask();
    const store = new MemoryBackgroundSyncTaskStore();
    const scheduler = new BackgroundSyncScheduler([task], store);

    await scheduler.start();

    expect(store.states.get("test_sync")?.nextRunAt?.toISOString()).toBe(
      "2026-04-25T00:00:05.000Z"
    );
    expect(task.run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(task.run).toHaveBeenCalledWith("startup");
    expect(store.runs[0]?.status).toBe("success");
    expect(store.states.get("test_sync")?.nextRunAt?.toISOString()).toBe(
      "2026-04-25T00:01:05.000Z"
    );

    scheduler.stop();
  });

  it("does not start timers when a task is disabled dynamically", async () => {
    const { BackgroundSyncScheduler } = await import("@/lib/services/background-sync-scheduler");
    const task = createTask({ defaultEnabled: false });
    const store = new MemoryBackgroundSyncTaskStore();
    const scheduler = new BackgroundSyncScheduler([task], store);

    await scheduler.start();
    await vi.runOnlyPendingTimersAsync();

    expect(task.run).not.toHaveBeenCalled();
    expect(store.states.get("test_sync")?.enabled).toBe(false);
    expect(store.states.get("test_sync")?.nextRunAt).toBeNull();
  });

  it("updates task config and reschedules the timer", async () => {
    const { BackgroundSyncScheduler } = await import("@/lib/services/background-sync-scheduler");
    const task = createTask({ defaultIntervalSeconds: 60, defaultStartupDelaySeconds: 5 });
    const store = new MemoryBackgroundSyncTaskStore();
    const scheduler = new BackgroundSyncScheduler([task], store);

    await scheduler.start();
    const updated = await scheduler.updateTaskConfig("test_sync", {
      enabled: true,
      intervalSeconds: 120,
    });

    expect(updated.intervalSeconds).toBe(120);
    expect(store.states.get("test_sync")?.nextRunAt?.toISOString()).toBe(
      "2026-04-25T00:02:00.000Z"
    );

    await vi.advanceTimersByTimeAsync(5_000);
    expect(task.run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(115_000);
    expect(task.run).toHaveBeenCalledWith("scheduled");

    scheduler.stop();
  });

  it("clears scheduled timers when stopped", async () => {
    const { BackgroundSyncScheduler } = await import("@/lib/services/background-sync-scheduler");
    const task = createTask();
    const scheduler = new BackgroundSyncScheduler([task], new MemoryBackgroundSyncTaskStore());

    await scheduler.start();
    scheduler.stop();
    await vi.runOnlyPendingTimersAsync();

    expect(task.run).not.toHaveBeenCalled();
  });

  it("runs a registered task manually", async () => {
    const { BackgroundSyncScheduler } = await import("@/lib/services/background-sync-scheduler");
    const task = createTask();
    const store = new MemoryBackgroundSyncTaskStore();
    const scheduler = new BackgroundSyncScheduler([task], store);
    await scheduler.start();

    const result = await scheduler.executeNow("test_sync");

    expect(task.run).toHaveBeenCalledWith("manual");
    expect(result.status).toBe("success");
    expect(store.runs.at(-1)?.triggerType).toBe("manual");
    scheduler.stop();
  });

  it("returns running state instead of starting a second same-name task", async () => {
    const { BackgroundSyncScheduler } = await import("@/lib/services/background-sync-scheduler");
    let resolveTask: (() => void) | null = null;
    const task = createTask({
      run: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveTask = () =>
              resolve({
                status: "success",
                successCount: 1,
                failureCount: 0,
                errorSummary: null,
              });
          })
      ),
    });
    const scheduler = new BackgroundSyncScheduler([task], new MemoryBackgroundSyncTaskStore());
    await scheduler.start();

    const firstRun = scheduler.executeNow("test_sync");
    const secondRun = await scheduler.executeNow("test_sync");

    expect(secondRun.status).toBe("running");
    expect(task.run).toHaveBeenCalledTimes(1);

    resolveTask?.();
    await firstRun;
    scheduler.stop();
  });

  it("records skipped status when a scheduled run finds the task already running", async () => {
    const { BackgroundSyncScheduler } = await import("@/lib/services/background-sync-scheduler");
    let resolveTask: (() => void) | null = null;
    const task = createTask({
      run: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveTask = () =>
              resolve({
                status: "success",
                successCount: 1,
                failureCount: 0,
                errorSummary: null,
              });
          })
      ),
    });
    const store = new MemoryBackgroundSyncTaskStore();
    const scheduler = new BackgroundSyncScheduler([task], store);
    await scheduler.start();

    const firstRun = scheduler.executeNow("test_sync");
    await vi.advanceTimersByTimeAsync(5_000);

    expect(store.runs[0]?.status).toBe("skipped");
    expect(store.runs[0]?.triggerType).toBe("startup");
    expect(task.run).toHaveBeenCalledTimes(1);

    resolveTask?.();
    await firstRun;
    scheduler.stop();
  });

  it("lists running task states", async () => {
    const { BackgroundSyncScheduler } = await import("@/lib/services/background-sync-scheduler");
    let resolveTask: (() => void) | null = null;
    const task = createTask({
      run: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveTask = () =>
              resolve({
                status: "success",
                successCount: 1,
                failureCount: 0,
                errorSummary: null,
              });
          })
      ),
    });
    const scheduler = new BackgroundSyncScheduler([task], new MemoryBackgroundSyncTaskStore());
    await scheduler.start();

    const run = scheduler.executeNow("test_sync");
    const states = await scheduler.listTaskStates();

    expect(states[0]?.isRunning).toBe(true);

    resolveTask?.();
    await run;
    scheduler.stop();
  });

  it("throws for unknown manual task execution", async () => {
    const { BackgroundSyncScheduler } = await import("@/lib/services/background-sync-scheduler");
    const scheduler = new BackgroundSyncScheduler([], new MemoryBackgroundSyncTaskStore());

    await expect(scheduler.executeNow("missing")).rejects.toThrow(
      "Unknown background sync task: missing"
    );
  });
});
