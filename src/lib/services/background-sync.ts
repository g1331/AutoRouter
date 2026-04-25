import { BackgroundSyncScheduler } from "./background-sync-scheduler";
import { getBackgroundSyncTaskDefinitions } from "./background-sync-registry";

let scheduler: BackgroundSyncScheduler | null = null;

export function getBackgroundSyncScheduler(): BackgroundSyncScheduler {
  if (!scheduler) {
    scheduler = new BackgroundSyncScheduler(getBackgroundSyncTaskDefinitions());
  }
  return scheduler;
}

export async function startBackgroundSyncScheduler(): Promise<void> {
  await getBackgroundSyncScheduler().start();
}

export function resetBackgroundSyncSchedulerForTests(): void {
  scheduler?.stop();
  scheduler = null;
}
