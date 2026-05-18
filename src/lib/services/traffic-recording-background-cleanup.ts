import { cleanupExpiredTrafficRecordings } from "@/lib/services/traffic-recording-service";
import type {
  BackgroundSyncTaskDefinition,
  BackgroundSyncTaskRunResult,
} from "./background-sync-types";

export const TRAFFIC_RECORDING_CLEANUP_TASK_NAME = "traffic_recording_cleanup";

const DEFAULT_TRAFFIC_RECORDING_CLEANUP_INTERVAL_SECONDS = 86_400;
const DEFAULT_BACKGROUND_SYNC_STARTUP_DELAY_SECONDS = 120;

/** Run the scheduled cleanup task for expired traffic recordings. */
export async function runTrafficRecordingCleanupTask(): Promise<BackgroundSyncTaskRunResult> {
  const result = await cleanupExpiredTrafficRecordings();
  return {
    status:
      result.failureCount === 0 ? "success" : result.deletedCount === 0 ? "failed" : "partial",
    successCount: result.deletedCount,
    failureCount: result.failureCount,
    errorSummary: result.errorSummary,
  };
}

/** Create the background sync definition for traffic recording cleanup. */
export function createTrafficRecordingCleanupTaskDefinition(): BackgroundSyncTaskDefinition {
  return {
    taskName: TRAFFIC_RECORDING_CLEANUP_TASK_NAME,
    displayName: "Traffic recording cleanup",
    defaultEnabled: true,
    defaultIntervalSeconds: DEFAULT_TRAFFIC_RECORDING_CLEANUP_INTERVAL_SECONDS,
    defaultStartupDelaySeconds: DEFAULT_BACKGROUND_SYNC_STARTUP_DELAY_SECONDS,
    run: runTrafficRecordingCleanupTask,
  };
}
