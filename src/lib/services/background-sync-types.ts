export type BackgroundSyncTaskTriggerType = "scheduled" | "startup" | "manual";
export type BackgroundSyncTaskRunStatus = "success" | "partial" | "failed" | "skipped";
export type BackgroundSyncTaskLastStatus = BackgroundSyncTaskRunStatus | "running";

export interface BackgroundSyncTaskRunResult {
  status: Exclude<BackgroundSyncTaskRunStatus, "skipped">;
  successCount: number;
  failureCount: number;
  errorSummary: string | null;
}

export interface BackgroundSyncTaskDefinition {
  taskName: string;
  displayName: string;
  defaultEnabled: boolean;
  defaultIntervalSeconds: number;
  defaultStartupDelaySeconds: number;
  run: (triggerType: BackgroundSyncTaskTriggerType) => Promise<BackgroundSyncTaskRunResult>;
}

export interface BackgroundSyncTaskState {
  taskName: string;
  displayName: string;
  enabled: boolean;
  intervalSeconds: number;
  startupDelaySeconds: number;
  isRunning: boolean;
  lastStartedAt: Date | null;
  lastFinishedAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailedAt: Date | null;
  lastStatus: BackgroundSyncTaskLastStatus | null;
  lastError: string | null;
  lastDurationMs: number | null;
  lastSuccessCount: number;
  lastFailureCount: number;
  nextRunAt: Date | null;
  updatedAt: Date | null;
}

export interface BackgroundSyncTaskRunRecord {
  taskName: string;
  triggerType: BackgroundSyncTaskTriggerType;
  status: BackgroundSyncTaskRunStatus;
  successCount: number;
  failureCount: number;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  errorSummary: string | null;
}

export interface BackgroundSyncTaskConfigUpdate {
  enabled?: boolean;
  intervalSeconds?: number;
  startupDelaySeconds?: number;
  nextRunAt?: Date | null;
}

export interface BackgroundSyncTaskStore {
  ensureTaskDefinition(definition: BackgroundSyncTaskDefinition): Promise<BackgroundSyncTaskState>;
  updateTaskConfig(
    taskName: string,
    update: BackgroundSyncTaskConfigUpdate
  ): Promise<BackgroundSyncTaskState | null>;
  markTaskStarted(taskName: string, startedAt: Date): Promise<void>;
  recordTaskRun(record: BackgroundSyncTaskRunRecord, nextRunAt: Date | null): Promise<void>;
  listTaskStates(
    definitions: BackgroundSyncTaskDefinition[],
    runningTaskNames: Set<string>
  ): Promise<BackgroundSyncTaskState[]>;
}

export interface BackgroundSyncExecuteResult {
  taskName: string;
  triggerType: BackgroundSyncTaskTriggerType;
  status: BackgroundSyncTaskRunStatus | "running";
  successCount: number;
  failureCount: number;
  errorSummary: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationMs: number | null;
  nextRunAt: Date | null;
}
