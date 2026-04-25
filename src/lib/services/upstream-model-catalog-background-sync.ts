import { loadActiveUpstreams, refreshUpstreamCatalog } from "@/lib/services/upstream-service";
import type { Upstream } from "@/lib/db";
import {
  inferDefaultModelDiscoveryConfig,
  normalizeUpstreamModelDiscoveryConfig,
} from "./upstream-model-types";
import type {
  BackgroundSyncTaskDefinition,
  BackgroundSyncTaskRunResult,
} from "./background-sync-types";

export const UPSTREAM_MODEL_CATALOG_SYNC_TASK_NAME = "upstream_model_catalog_sync";
const DEFAULT_MODEL_CATALOG_SYNC_INTERVAL_SECONDS = 86_400;
const DEFAULT_BACKGROUND_SYNC_STARTUP_DELAY_SECONDS = 60;

function isUpstreamEligibleForBackgroundCatalogRefresh(upstream: Upstream): boolean {
  if (!upstream.isActive || !upstream.modelDiscovery) {
    return false;
  }

  const inferredMode =
    inferDefaultModelDiscoveryConfig(upstream.routeCapabilities)?.mode ?? "openai_compatible";
  const modelDiscovery = normalizeUpstreamModelDiscoveryConfig(
    upstream.modelDiscovery,
    inferredMode
  );

  return modelDiscovery.autoRefreshEnabled;
}

function toTaskStatus(successCount: number, failureCount: number): BackgroundSyncTaskRunResult {
  const status = failureCount === 0 ? "success" : successCount === 0 ? "failed" : "partial";

  return {
    status,
    successCount,
    failureCount,
    errorSummary: null,
  };
}

export async function runUpstreamModelCatalogSyncTask(): Promise<BackgroundSyncTaskRunResult> {
  const activeUpstreams = await loadActiveUpstreams();
  const eligibleUpstreams = activeUpstreams.filter(isUpstreamEligibleForBackgroundCatalogRefresh);
  if (eligibleUpstreams.length === 0) {
    return {
      status: "success",
      successCount: 0,
      failureCount: 0,
      errorSummary: null,
    };
  }

  let successCount = 0;
  let failureCount = 0;
  const failures: string[] = [];

  for (const upstream of eligibleUpstreams) {
    try {
      const refreshed = await refreshUpstreamCatalog(upstream.id);
      if (refreshed.modelCatalogLastStatus === "failed") {
        failureCount += 1;
        failures.push(
          `${upstream.name}: ${refreshed.modelCatalogLastError ?? "model catalog refresh failed"}`
        );
      } else {
        successCount += 1;
      }
    } catch (error) {
      failureCount += 1;
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${upstream.name}: ${message}`);
    }
  }

  return {
    ...toTaskStatus(successCount, failureCount),
    errorSummary: failures.length > 0 ? failures.join("; ") : null,
  };
}

export function createUpstreamModelCatalogSyncTaskDefinition(): BackgroundSyncTaskDefinition {
  return {
    taskName: UPSTREAM_MODEL_CATALOG_SYNC_TASK_NAME,
    displayName: "Model catalog auto refresh",
    defaultEnabled: true,
    defaultIntervalSeconds: DEFAULT_MODEL_CATALOG_SYNC_INTERVAL_SECONDS,
    defaultStartupDelaySeconds: DEFAULT_BACKGROUND_SYNC_STARTUP_DELAY_SECONDS,
    run: runUpstreamModelCatalogSyncTask,
  };
}
