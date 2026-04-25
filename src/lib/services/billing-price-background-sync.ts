import { config } from "@/lib/utils/config";
import {
  syncBillingModelPrices,
  type BillingSyncSummary,
} from "@/lib/services/billing-price-service";
import type {
  BackgroundSyncTaskDefinition,
  BackgroundSyncTaskRunResult,
} from "./background-sync-types";

export const BILLING_PRICE_CATALOG_SYNC_TASK_NAME = "billing_price_catalog_sync";

export function toBillingPriceCatalogSyncTaskResult(
  summary: BillingSyncSummary
): BackgroundSyncTaskRunResult {
  return {
    status: summary.status,
    successCount: summary.successCount,
    failureCount: summary.failureCount,
    errorSummary: summary.failureReason,
  };
}

export async function runBillingPriceCatalogSyncTask(): Promise<BackgroundSyncTaskRunResult> {
  const summary = await syncBillingModelPrices();
  return toBillingPriceCatalogSyncTaskResult(summary);
}

export function createBillingPriceCatalogSyncTaskDefinition(): BackgroundSyncTaskDefinition {
  return {
    taskName: BILLING_PRICE_CATALOG_SYNC_TASK_NAME,
    displayName: "Price catalog sync",
    enabled: config.billingPriceSyncEnabled ?? true,
    intervalSeconds: config.billingPriceSyncIntervalSeconds,
    startupDelaySeconds: config.backgroundSyncStartupDelaySeconds,
    run: runBillingPriceCatalogSyncTask,
  };
}
