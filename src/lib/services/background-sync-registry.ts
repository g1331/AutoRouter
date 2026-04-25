import type { BackgroundSyncTaskDefinition } from "./background-sync-types";
import { createBillingPriceCatalogSyncTaskDefinition } from "./billing-price-background-sync";

export function getBackgroundSyncTaskDefinitions(): BackgroundSyncTaskDefinition[] {
  return [createBillingPriceCatalogSyncTaskDefinition()];
}
