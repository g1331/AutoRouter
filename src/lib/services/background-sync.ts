import { BackgroundSyncScheduler } from "./background-sync-scheduler";
import { getBackgroundSyncTaskDefinitions } from "./background-sync-registry";

let scheduler: BackgroundSyncScheduler | null = null;

/**
 * Returns the singleton background sync scheduler.
 */
export function getBackgroundSyncScheduler(): BackgroundSyncScheduler {
  if (!scheduler) {
    scheduler = new BackgroundSyncScheduler(getBackgroundSyncTaskDefinitions());
  }
  return scheduler;
}

/**
 * Starts the singleton background sync scheduler.
 */
export async function startBackgroundSyncScheduler(): Promise<void> {
  await getBackgroundSyncScheduler().start();
}

/**
 * Resets the singleton scheduler for isolated tests.
 */
export function resetBackgroundSyncSchedulerForTests(): void {
  scheduler?.stop();
  scheduler = null;
}
