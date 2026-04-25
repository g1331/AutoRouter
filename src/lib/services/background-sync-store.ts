import { eq } from "drizzle-orm";
import { backgroundSyncTaskRuns, backgroundSyncTasks, db } from "@/lib/db";
import type {
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

export class DatabaseBackgroundSyncTaskStore implements BackgroundSyncTaskStore {
  async ensureTaskDefinition(
    definition: BackgroundSyncTaskDefinition,
    nextRunAt: Date | null
  ): Promise<void> {
    await db
      .insert(backgroundSyncTasks)
      .values({
        taskName: definition.taskName,
        enabled: definition.enabled,
        intervalSeconds: definition.intervalSeconds,
        startupDelaySeconds: definition.startupDelaySeconds,
        nextRunAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: backgroundSyncTasks.taskName,
        set: {
          enabled: definition.enabled,
          intervalSeconds: definition.intervalSeconds,
          startupDelaySeconds: definition.startupDelaySeconds,
          nextRunAt,
          updatedAt: new Date(),
        },
      });
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
        enabled: row?.enabled ?? definition.enabled,
        intervalSeconds: row?.intervalSeconds ?? definition.intervalSeconds,
        startupDelaySeconds: row?.startupDelaySeconds ?? definition.startupDelaySeconds,
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
