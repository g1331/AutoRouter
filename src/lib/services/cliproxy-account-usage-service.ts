import { resolveCliproxyManagementTarget } from "./cliproxy-instance-crud";
import { getAuthFilesSnapshot, type CliproxyAuthFilesSnapshot } from "./cliproxy-management-client";
import type {
  CliproxyAccountUsage,
  CliproxyAccountUsageSnapshot,
  CliproxyQuotaObservation,
  CliproxyRecentRequestBucket,
} from "@/types/cliproxy";

/** 仅允许展示数值型、与用量相关的被动观测信号，不透传任意上游字段。 */
const QUOTA_SIGNAL_NAME =
  /(?:^|[-_])(?:used[-_]percent|reset[-_]after[-_]seconds|reset[-_]at|window[-_]minutes|remaining|limit)$/i;
const NUMERIC_SIGNAL_VALUE = /^\d+(?:\.\d+)?$/;
const RECENT_BUCKET_TIME = /^\d{2}:\d{2}-\d{2}:\d{2}$/;

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function timestamp(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

function recentRequests(value: unknown): CliproxyRecentRequestBucket[] | null {
  if (!Array.isArray(value)) return null;
  return value.slice(-20).flatMap((entry): CliproxyRecentRequestBucket[] => {
    if (!entry || typeof entry !== "object") return [];
    const bucket = entry as Record<string, unknown>;
    const success = nonNegativeInteger(bucket.success);
    const failed = nonNegativeInteger(bucket.failed);
    if (typeof bucket.time !== "string" || !RECENT_BUCKET_TIME.test(bucket.time)) return [];
    if (success === null || failed === null) return [];
    return [{ time: bucket.time, success, failed }];
  });
}

function quotaObservation(value: unknown): CliproxyQuotaObservation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const quota = value as Record<string, unknown>;
  const signals: Record<string, string> = {};
  if (quota.signals && typeof quota.signals === "object" && !Array.isArray(quota.signals)) {
    for (const [key, raw] of Object.entries(quota.signals).slice(0, 40)) {
      if (
        key.length > 80 ||
        !QUOTA_SIGNAL_NAME.test(key) ||
        typeof raw !== "string" ||
        raw.length > 32
      )
        continue;
      if (NUMERIC_SIGNAL_VALUE.test(raw) || timestamp(raw)) signals[key] = raw;
    }
  }
  const observedAt = timestamp(quota.observed_at);
  return observedAt || Object.keys(signals).length > 0
    ? { observed_at: observedAt, signals }
    : null;
}

function modelQuotaObservations(value: unknown): Record<string, CliproxyQuotaObservation> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const observations: Record<string, CliproxyQuotaObservation> = {};
  for (const [model, raw] of Object.entries(value).slice(0, 40)) {
    if (!model || model.length > 100) continue;
    const observation = quotaObservation(raw);
    if (observation) observations[model] = observation;
  }
  return Object.keys(observations).length > 0 ? observations : null;
}

/** 将上游宽松的管理响应投影为可公开给管理员的非敏感用量字段。 */
export function toCliproxyAccountUsageSnapshot(
  snapshot: CliproxyAuthFilesSnapshot,
  fetchedAt: string = new Date().toISOString()
): CliproxyAccountUsageSnapshot {
  const accounts: CliproxyAccountUsage[] = snapshot.files.flatMap((entry) => {
    if (typeof entry.name !== "string" || !entry.name) return [];
    return [
      {
        auth_file_name: entry.name,
        success: nonNegativeInteger(entry.success),
        failed: nonNegativeInteger(entry.failed),
        recent_requests: recentRequests(entry.recent_requests),
        quota: quotaObservation(entry.quota),
        model_quotas: modelQuotaObservations(entry.model_quotas),
      },
    ];
  });
  return { fetched_at: fetchedAt, observed_at: timestamp(snapshot.observed_at), accounts };
}

/** 只读查询 CLIProxyAPI 当前账号请求计数和被动配额观测。 */
export async function getCliproxyAccountUsage(
  instanceId: string
): Promise<CliproxyAccountUsageSnapshot> {
  const target = await resolveCliproxyManagementTarget(instanceId);
  const snapshot = await getAuthFilesSnapshot(target);
  return toCliproxyAccountUsageSnapshot(snapshot);
}
