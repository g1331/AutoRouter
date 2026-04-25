export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { startBackgroundSyncScheduler } = await import("@/lib/services/background-sync");
  await startBackgroundSyncScheduler();
}
