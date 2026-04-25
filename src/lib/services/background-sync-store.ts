import { eq } from "drizzle-orm";
import { backgroundSyncTaskRuns, backgroundSyncTasks, db } from "@/lib/db";
import type {
  BackgroundSyncTaskConfigUpdate,
  BackgroundSyncTaskDefinition,
  BackgroundSyncTaskLastStatus,
  BackgroundSyncTaskRunRecord,
  BackgroundSyncTaskState,
  BackgroundSyncTaskStore,
} from "./background-sync-types";

function toLastStatus(value: string | null): BackgroundSyncTaskLastStatus | null {
  if (
    value === "running" ||
    value === "success" ||
    value === "partial" ||
    value === "failed" ||
    value === "skipped"
  ) {
    return value;
  }
  return null;
}

function toTaskState(
  definition: BackgroundSyncTaskDefinition,
  row: typeof backgroundSyncTasks.$inferSelect | undefined,
  isRunning = false
): BackgroundSyncTaskState {
  return {
    taskName: definition.taskName,
    displayName: definition.displayName,
    enabled: row?.enabled ?? definition.defaultEnabled,
    intervalSeconds: row?.intervalSeconds ?? definition.defaultIntervalSeconds,
    startupDelaySeconds: row?.startupDelaySeconds ?? definition.defaultStartupDelaySeconds,
    isRunning,
    lastStartedAt: row?.lastStartedAt ?? null,
    lastFinishedAt: row?.lastFinishedAt ?? null,
    lastSuccessAt: row?.lastSuccessAt ?? null,
    lastFailedAt: row?.lastFailedAt ?? null,
    lastStatus: isRunning ? "running" : toLastStatus(row?.lastStatus ?? null),
    lastError: row?.lastError ?? null,
    lastDurationMs: row?.lastDurationMs ?? null,
    lastSuccessCount: row?.lastSuccessCount ?? 0,
    lastFailureCount: row?.lastFailureCount ?? 0,
    nextRunAt: row?.nextRunAt ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export class DatabaseBackgroundSyncTaskStore implements BackgroundSyncTaskStore {
  async ensureTaskDefinition(
    definition: BackgroundSyncTaskDefinition
  ): Promise<BackgroundSyncTaskState> {
    await db
      .insert(backgroundSyncTasks)
      .values({
        taskName: definition.taskName,
        enabled: definition.defaultEnabled,
        intervalSeconds: definition.defaultIntervalSeconds,
        startupDelaySeconds: definition.defaultStartupDelaySeconds,
        nextRunAt: null,
        updatedAt: new Date(),
      })
      .onConflictDoNothing({
        target: backgroundSyncTasks.taskName,
      });

    const row = await db.query.backgroundSyncTasks.findFirst({
      where: eq(backgroundSyncTasks.taskName, definition.taskName),
    });

    return toTaskState(definition, row);
  }

  async updateTaskConfig(
    taskName: string,
    update: BackgroundSyncTaskConfigUpdate
  ): Promise<BackgroundSyncTaskState | null> {
    const updatedRows = await db
      .update(backgroundSyncTasks)
      .set({
        ...(update.enabled !== undefined ? { enabled: update.enabled } : {}),
        ...(update.intervalSeconds !== undefined
          ? { intervalSeconds: update.intervalSeconds }
          : {}),
        ...(update.startupDelaySeconds !== undefined
          ? { startupDelaySeconds: update.startupDelaySeconds }
          : {}),
        ...(update.nextRunAt !== undefined ? { nextRunAt: update.nextRunAt } : {}),
        updatedAt: new Date(),
      })
      .where(eq(backgroundSyncTasks.taskName, taskName))
      .returning();

    const row = updatedRows[0];
    if (!row) {
      return null;
    }

    return {
      taskName: row.taskName,
      displayName: row.taskName,
      enabled: row.enabled,
      intervalSeconds: row.intervalSeconds,
      startupDelaySeconds: row.startupDelaySeconds,
      isRunning: false,
      lastStartedAt: row.lastStartedAt ?? null,
      lastFinishedAt: row.lastFinishedAt ?? null,
      lastSuccessAt: row.lastSuccessAt ?? null,
      lastFailedAt: row.lastFailedAt ?? null,
      lastStatus: toLastStatus(row.lastStatus),
      lastError: row.lastError ?? null,
      lastDurationMs: row.lastDurationMs ?? null,
      lastSuccessCount: row.lastSuccessCount ?? 0,
      lastFailureCount: row.lastFailureCount ?? 0,
      nextRunAt: row.nextRunAt ?? null,
      updatedAt: row.updatedAt ?? null,
    };
  }

  async markTaskStarted(taskName: string, startedAt: Date): Promise<void> {
    await db
      .update(backgroundSyncTasks)
      .set({
        lastStartedAt: startedAt,
        lastStatus: "running",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(backgroundSyncTasks.taskName, taskName));
  }

  async recordTaskRun(record: BackgroundSyncTaskRunRecord, nextRunAt: Date | null): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.insert(backgroundSyncTaskRuns).values({
        taskName: record.taskName,
        triggerType: record.triggerType,
        status: record.status,
        successCount: record.successCount,
        failureCount: record.failureCount,
        startedAt: record.startedAt,
        finishedAt: record.finishedAt,
        durationMs: record.durationMs,
        errorSummary: record.errorSummary,
        createdAt: new Date(),
      });

      await tx
        .update(backgroundSyncTasks)
        .set({
          lastFinishedAt: record.finishedAt,
          lastSuccessAt:
            record.status === "success" || record.status === "partial"
              ? record.finishedAt
              : undefined,
          lastFailedAt:
            record.status === "failed" || record.status === "partial"
              ? record.finishedAt
              : undefined,
          lastStatus: record.status,
          lastError: record.errorSummary,
          lastDurationMs: record.durationMs,
          lastSuccessCount: record.successCount,
          lastFailureCount: record.failureCount,
          nextRunAt,
          updatedAt: new Date(),
        })
        .where(eq(backgroundSyncTasks.taskName, record.taskName));
    });
  }

  async listTaskStates(
    definitions: BackgroundSyncTaskDefinition[],
    runningTaskNames: Set<string>
  ): Promise<BackgroundSyncTaskState[]> {
    const rows = await db.query.backgroundSyncTasks.findMany();
    const rowsByName = new Map(rows.map((row) => [row.taskName, row]));

    return definitions.map((definition) => {
      const row = rowsByName.get(definition.taskName);
      const isRunning = runningTaskNames.has(definition.taskName);

      return {
        taskName: definition.taskName,
        displayName: definition.displayName,
        enabled: row?.enabled ?? definition.defaultEnabled,
        intervalSeconds: row?.intervalSeconds ?? definition.defaultIntervalSeconds,
        startupDelaySeconds: row?.startupDelaySeconds ?? definition.defaultStartupDelaySeconds,
        isRunning,
        lastStartedAt: row?.lastStartedAt ?? null,
        lastFinishedAt: row?.lastFinishedAt ?? null,
        lastSuccessAt: row?.lastSuccessAt ?? null,
        lastFailedAt: row?.lastFailedAt ?? null,
        lastStatus: isRunning ? "running" : toLastStatus(row?.lastStatus ?? null),
        lastError: row?.lastError ?? null,
        lastDurationMs: row?.lastDurationMs ?? null,
        lastSuccessCount: row?.lastSuccessCount ?? 0,
        lastFailureCount: row?.lastFailureCount ?? 0,
        nextRunAt: row?.nextRunAt ?? null,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }
}

export const backgroundSyncTaskStore = new DatabaseBackgroundSyncTaskStore();
