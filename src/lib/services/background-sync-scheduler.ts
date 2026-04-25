import { createLogger } from "@/lib/utils/logger";
import { backgroundSyncTaskStore } from "./background-sync-store";
import type {
  BackgroundSyncExecuteResult,
  BackgroundSyncTaskDefinition,
  BackgroundSyncTaskRunRecord,
  BackgroundSyncTaskState,
  BackgroundSyncTaskStore,
  BackgroundSyncTaskTriggerType,
} from "./background-sync-types";

const log = createLogger("background-sync-scheduler");

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

function getDurationMs(startedAt: Date, finishedAt: Date): number {
  return Math.max(0, finishedAt.getTime() - startedAt.getTime());
}

function maybeUnref(timer: ReturnType<typeof setTimeout>): void {
  if (typeof timer === "object" && "unref" in timer && typeof timer.unref === "function") {
    timer.unref();
  }
}

export class BackgroundSyncScheduler {
  private readonly definitions = new Map<string, BackgroundSyncTaskDefinition>();
  private readonly taskStates = new Map<string, BackgroundSyncTaskState>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly running = new Map<string, Promise<BackgroundSyncExecuteResult>>();
  private started = false;

  constructor(
    definitions: BackgroundSyncTaskDefinition[],
    private readonly store: BackgroundSyncTaskStore = backgroundSyncTaskStore
  ) {
    for (const definition of definitions) {
      this.definitions.set(definition.taskName, definition);
    }
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;

    const now = new Date();
    for (const definition of this.definitions.values()) {
      const state = await this.store.ensureTaskDefinition(definition);
      this.taskStates.set(definition.taskName, state);

      const nextRunAt = state.enabled ? addSeconds(now, state.startupDelaySeconds) : null;
      await this.updateTaskRuntimeConfig(definition.taskName, { nextRunAt });
      if (state.enabled && nextRunAt) {
        this.schedule(definition.taskName, nextRunAt, "startup");
      }
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.started = false;
  }

  getTaskDefinition(taskName: string): BackgroundSyncTaskDefinition | null {
    return this.definitions.get(taskName) ?? null;
  }

  async listTaskStates() {
    const states = await this.store.listTaskStates(
      this.getDefinitions(),
      new Set(this.running.keys())
    );
    for (const state of states) {
      this.taskStates.set(state.taskName, state);
    }
    return states;
  }

  getDefinitions(): BackgroundSyncTaskDefinition[] {
    return [...this.definitions.values()];
  }

  async executeNow(taskName: string): Promise<BackgroundSyncExecuteResult> {
    const definition = this.definitions.get(taskName);
    if (!definition) {
      throw new Error(`Unknown background sync task: ${taskName}`);
    }
    return this.executeTask(definition, "manual");
  }

  async updateTaskConfig(
    taskName: string,
    input: { enabled?: boolean; intervalSeconds?: number }
  ): Promise<BackgroundSyncTaskState> {
    const definition = this.definitions.get(taskName);
    if (!definition) {
      throw new Error(`Unknown background sync task: ${taskName}`);
    }

    await this.store.ensureTaskDefinition(definition);
    const current = await this.getTaskRuntimeConfig(definition);
    const nextEnabled = input.enabled ?? current.enabled;
    const nextIntervalSeconds = input.intervalSeconds ?? current.intervalSeconds;
    const nextRunAt = nextEnabled ? addSeconds(new Date(), nextIntervalSeconds) : null;
    const nextState = await this.updateTaskRuntimeConfig(taskName, {
      enabled: nextEnabled,
      intervalSeconds: nextIntervalSeconds,
      nextRunAt,
    });

    if (nextEnabled && nextRunAt) {
      this.schedule(taskName, nextRunAt, "scheduled");
    } else {
      this.clearTimer(taskName);
    }

    return { ...nextState, displayName: definition.displayName };
  }

  private clearTimer(taskName: string): void {
    const existingTimer = this.timers.get(taskName);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.timers.delete(taskName);
    }
  }

  private async getTaskRuntimeConfig(
    definition: BackgroundSyncTaskDefinition
  ): Promise<BackgroundSyncTaskState> {
    const state = this.taskStates.get(definition.taskName);
    if (state) {
      return state;
    }
    const ensured = await this.store.ensureTaskDefinition(definition);
    this.taskStates.set(definition.taskName, ensured);
    return ensured;
  }

  private async updateTaskRuntimeConfig(
    taskName: string,
    input: {
      enabled?: boolean;
      intervalSeconds?: number;
      startupDelaySeconds?: number;
      nextRunAt?: Date | null;
    }
  ): Promise<BackgroundSyncTaskState> {
    const updated = await this.store.updateTaskConfig(taskName, input);
    if (!updated) {
      throw new Error(`Unknown background sync task: ${taskName}`);
    }
    const definition = this.definitions.get(taskName);
    const nextState = {
      ...updated,
      displayName: definition?.displayName ?? updated.displayName,
      isRunning: this.running.has(taskName),
    };
    this.taskStates.set(taskName, nextState);
    return nextState;
  }

  private schedule(
    taskName: string,
    runAt: Date,
    triggerType: BackgroundSyncTaskTriggerType
  ): void {
    const definition = this.definitions.get(taskName);
    const state = this.taskStates.get(taskName);
    if (!definition || !state?.enabled) {
      return;
    }

    this.clearTimer(taskName);

    const delayMs = Math.max(0, runAt.getTime() - Date.now());
    const timer = setTimeout(() => {
      this.executeTask(definition, triggerType).catch((error) => {
        log.error({ err: error, taskName }, "background sync task execution failed");
      });
    }, delayMs);
    maybeUnref(timer);
    this.timers.set(taskName, timer);
  }

  private async executeTask(
    definition: BackgroundSyncTaskDefinition,
    triggerType: BackgroundSyncTaskTriggerType
  ): Promise<BackgroundSyncExecuteResult> {
    const runningTask = this.running.get(definition.taskName);
    if (runningTask) {
      if (triggerType !== "manual") {
        const skippedAt = new Date();
        const state = await this.getTaskRuntimeConfig(definition);
        const nextRunAt = state.enabled ? addSeconds(skippedAt, state.intervalSeconds) : null;
        await this.store.recordTaskRun(
          {
            taskName: definition.taskName,
            triggerType,
            status: "skipped",
            successCount: 0,
            failureCount: 0,
            startedAt: skippedAt,
            finishedAt: skippedAt,
            durationMs: 0,
            errorSummary: "Task is already running",
          },
          nextRunAt
        );
        if (state.enabled && nextRunAt) {
          await this.updateTaskRuntimeConfig(definition.taskName, { nextRunAt });
          this.schedule(definition.taskName, nextRunAt, "scheduled");
        }

        return {
          taskName: definition.taskName,
          triggerType,
          status: "skipped",
          successCount: 0,
          failureCount: 0,
          errorSummary: "Task is already running",
          startedAt: skippedAt,
          finishedAt: skippedAt,
          durationMs: 0,
          nextRunAt,
        };
      }

      return {
        taskName: definition.taskName,
        triggerType,
        status: "running",
        successCount: 0,
        failureCount: 0,
        errorSummary: "Task is already running",
        startedAt: null,
        finishedAt: null,
        durationMs: null,
        nextRunAt: null,
      };
    }

    const execution = this.runTask(definition, triggerType);
    this.running.set(definition.taskName, execution);
    try {
      return await execution;
    } finally {
      this.running.delete(definition.taskName);
    }
  }

  private async runTask(
    definition: BackgroundSyncTaskDefinition,
    triggerType: BackgroundSyncTaskTriggerType
  ): Promise<BackgroundSyncExecuteResult> {
    const startedAt = new Date();
    await this.store.markTaskStarted(definition.taskName, startedAt);

    let record: BackgroundSyncTaskRunRecord;
    let nextRunAt: Date | null = null;

    try {
      const result = await definition.run(triggerType);
      const finishedAt = new Date();
      const state = await this.getTaskRuntimeConfig(definition);
      nextRunAt = state.enabled ? addSeconds(finishedAt, state.intervalSeconds) : null;
      record = {
        taskName: definition.taskName,
        triggerType,
        status: result.status,
        successCount: result.successCount,
        failureCount: result.failureCount,
        startedAt,
        finishedAt,
        durationMs: getDurationMs(startedAt, finishedAt),
        errorSummary: result.errorSummary,
      };
    } catch (error) {
      const finishedAt = new Date();
      const state = await this.getTaskRuntimeConfig(definition);
      nextRunAt = state.enabled ? addSeconds(finishedAt, state.intervalSeconds) : null;
      record = {
        taskName: definition.taskName,
        triggerType,
        status: "failed",
        successCount: 0,
        failureCount: 1,
        startedAt,
        finishedAt,
        durationMs: getDurationMs(startedAt, finishedAt),
        errorSummary: error instanceof Error ? error.message : String(error),
      };
    }

    await this.store.recordTaskRun(record, nextRunAt);
    if (nextRunAt) {
      await this.updateTaskRuntimeConfig(definition.taskName, { nextRunAt });
      this.schedule(definition.taskName, nextRunAt, "scheduled");
    }

    return {
      taskName: definition.taskName,
      triggerType,
      status: record.status,
      successCount: record.successCount,
      failureCount: record.failureCount,
      errorSummary: record.errorSummary,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      durationMs: record.durationMs,
      nextRunAt,
    };
  }
}
