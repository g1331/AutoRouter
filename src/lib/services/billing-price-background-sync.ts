import {
  syncBillingModelPrices,
  type BillingSyncSummary,
} from "@/lib/services/billing-price-service";
import type {
  BackgroundSyncTaskDefinition,
  BackgroundSyncTaskRunResult,
} from "./background-sync-types";

export const BILLING_PRICE_CATALOG_SYNC_TASK_NAME = "billing_price_catalog_sync";
const DEFAULT_BILLING_PRICE_SYNC_INTERVAL_SECONDS = 86_400;
const DEFAULT_BACKGROUND_SYNC_STARTUP_DELAY_SECONDS = 60;

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
    defaultEnabled: true,
    defaultIntervalSeconds: DEFAULT_BILLING_PRICE_SYNC_INTERVAL_SECONDS,
    defaultStartupDelaySeconds: DEFAULT_BACKGROUND_SYNC_STARTUP_DELAY_SECONDS,
    run: runBillingPriceCatalogSyncTask,
  };
}
