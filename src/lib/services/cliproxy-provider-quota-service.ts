import { CliproxyAuthAccountNotFoundError } from "./cliproxy-auth-account-service";
import { resolveCliproxyManagementTarget } from "./cliproxy-instance-crud";
import {
  CliproxyManagementApiError,
  getAuthFilesSnapshot,
  requestProviderQuota,
  type CliproxyAuthFileEntry,
  type CliproxyProviderQuotaApiCallResult,
} from "./cliproxy-management-client";
import type { CliproxyProviderQuota, CliproxyProviderQuotaWindow } from "@/types/cliproxy";

type SupportedProvider = "codex" | "anthropic";
type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function providerFor(entry: CliproxyAuthFileEntry): SupportedProvider | null {
  const value = (entry.type || entry.provider || entry.name).toLowerCase();
  if (value.includes("codex") || value.includes("openai")) return "codex";
  if (value.includes("claude") || value.includes("anthropic")) return "anthropic";
  return null;
}

function authIndexFor(entry: CliproxyAuthFileEntry): string | null {
  const value = entry.auth_index ?? entry.authIndex ?? entry.AuthIndex;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function codexAccountIdFor(entry: CliproxyAuthFileEntry): string | null {
  const metadata = object(entry.metadata);
  const attributes = object(entry.attributes);
  const candidates = [
    entry.chatgpt_account_id,
    entry.chatgptAccountId,
    metadata?.chatgpt_account_id,
    metadata?.chatgptAccountId,
    attributes?.chatgpt_account_id,
    attributes?.chatgptAccountId,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value)) return value;
  }
  return null;
}

function remainingPercent(value: unknown): number | null {
  const used =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  return Number.isFinite(used) && used >= 0 && used <= 100
    ? Math.round((100 - used) * 10) / 10
    : null;
}

function resetAt(value: unknown, afterSeconds: unknown, now: Date): string | null {
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
    }
    value = numeric;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const millis = value < 1e12 ? value * 1000 : value;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const seconds =
    typeof afterSeconds === "number"
      ? afterSeconds
      : typeof afterSeconds === "string"
        ? Number(afterSeconds)
        : NaN;
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= 365 * 24 * 60 * 60
    ? new Date(now.getTime() + seconds * 1000).toISOString()
    : null;
}

function codexWindow(id: string, value: unknown, now: Date): CliproxyProviderQuotaWindow | null {
  const window = object(value);
  if (!window) return null;
  return {
    id,
    remaining_percent: remainingPercent(window.used_percent ?? window.usedPercent),
    resets_at: resetAt(
      window.reset_at ?? window.resetAt,
      window.reset_after_seconds ?? window.resetAfterSeconds,
      now
    ),
  };
}

/** 仅投影可展示的额度字段；原始供应商响应不离开服务端。 */
export function projectProviderQuota(
  provider: SupportedProvider,
  body: string,
  now: Date = new Date()
): CliproxyProviderQuota {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new CliproxyManagementApiError("service_error", "供应商额度响应不是有效 JSON", null);
  }
  const payload = object(parsed);
  if (!payload) {
    throw new CliproxyManagementApiError("service_error", "供应商额度响应格式无效", null);
  }

  const windows: CliproxyProviderQuotaWindow[] = [];
  if (provider === "codex") {
    const rateLimit = object(payload.rate_limit ?? payload.rateLimit);
    const codeReview = object(payload.code_review_rate_limit ?? payload.codeReviewRateLimit);
    for (const [limit, prefix] of [
      [rateLimit, ""],
      [codeReview, "code-review-"],
    ] as const) {
      if (!limit) continue;
      const primary = codexWindow(
        `${prefix}primary`,
        limit.primary_window ?? limit.primaryWindow,
        now
      );
      const secondary = codexWindow(
        `${prefix}secondary`,
        limit.secondary_window ?? limit.secondaryWindow,
        now
      );
      if (primary) windows.push(primary);
      if (secondary) windows.push(secondary);
    }
  } else {
    for (const [key, id] of [
      ["five_hour", "five-hour"],
      ["seven_day", "seven-day"],
      ["seven_day_opus", "seven-day-opus"],
      ["seven_day_sonnet", "seven-day-sonnet"],
      ["seven_day_oauth_apps", "seven-day-oauth-apps"],
    ] as const) {
      const window = object(payload[key]);
      if (!window) continue;
      windows.push({
        id,
        remaining_percent: remainingPercent(window.utilization),
        resets_at: resetAt(window.resets_at, null, now),
      });
    }
  }

  return {
    provider,
    status: "ready",
    reason: null,
    fetched_at: now.toISOString(),
    windows,
  };
}

/** 按文件名查询单账号真实供应商额度，避免页面加载时批量探测。 */
export async function getCliproxyProviderQuota(
  instanceId: string,
  authFileName: string
): Promise<CliproxyProviderQuota> {
  const target = await resolveCliproxyManagementTarget(instanceId);
  const snapshot = await getAuthFilesSnapshot(target);
  const entry = snapshot.files.find((file) => file.name === authFileName);
  if (!entry) throw new CliproxyAuthAccountNotFoundError(instanceId, authFileName);

  const provider = providerFor(entry);
  const fetchedAt = new Date().toISOString();
  if (!provider) {
    return {
      provider: null,
      status: "unsupported",
      reason: null,
      fetched_at: fetchedAt,
      windows: [],
    };
  }
  if (entry.disabled === true || entry.unavailable === true) {
    return {
      provider,
      status: "unavailable",
      reason: entry.disabled === true ? "disabled" : "upstream_unavailable",
      fetched_at: fetchedAt,
      windows: [],
    };
  }
  const authIndex = authIndexFor(entry);
  if (!authIndex) {
    return {
      provider,
      status: "unavailable",
      reason: "missing_auth_index",
      fetched_at: fetchedAt,
      windows: [],
    };
  }

  let response: CliproxyProviderQuotaApiCallResult;
  try {
    response = await requestProviderQuota(
      target,
      provider,
      authIndex,
      provider === "codex" ? codexAccountIdFor(entry) : null
    );
  } catch (error) {
    if (error instanceof CliproxyManagementApiError) {
      throw new CliproxyManagementApiError(
        error.kind,
        "供应商额度查询失败，请检查 CLIProxyAPI 管理端连接",
        error.statusCode
      );
    }
    throw error;
  }
  if (
    !Number.isInteger(response.status_code) ||
    response.status_code < 200 ||
    response.status_code >= 300
  ) {
    throw new CliproxyManagementApiError(
      "service_error",
      `供应商额度查询失败（HTTP ${response.status_code}）`,
      response.status_code
    );
  }
  return projectProviderQuota(provider, response.body);
}
