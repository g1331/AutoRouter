import type { BackgroundSyncTaskDefinition } from "./background-sync-types";
import { createBillingPriceCatalogSyncTaskDefinition } from "./billing-price-background-sync";
import { createTrafficRecordingCleanupTaskDefinition } from "./traffic-recording-background-cleanup";
import { createUpstreamModelCatalogSyncTaskDefinition } from "./upstream-model-catalog-background-sync";

/**
 * Returns all background sync task definitions registered by the application.
 */
export function getBackgroundSyncTaskDefinitions(): BackgroundSyncTaskDefinition[] {
  return [
    createBillingPriceCatalogSyncTaskDefinition(),
    createUpstreamModelCatalogSyncTaskDefinition(),
    createTrafficRecordingCleanupTaskDefinition(),
  ];
}
