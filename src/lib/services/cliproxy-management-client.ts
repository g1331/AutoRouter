import { createLogger } from "../utils/logger";

const log = createLogger("cliproxy-management-client");

/** 管理 API 调用默认超时（秒）。 */
const DEFAULT_TIMEOUT_SECONDS = 15;

/** CLIProxyAPI 支持发起 OAuth 登录的服务商。 */
export const CLIPROXY_OAUTH_PROVIDERS = [
  "codex",
  "anthropic",
  "gemini",
  "xai",
  "antigravity",
  "kimi",
] as const;
export type CliproxyOAuthProvider = (typeof CLIPROXY_OAUTH_PROVIDERS)[number];

/** 各服务商对应的授权地址端点片段。 */
const AUTH_URL_ENDPOINT: Record<CliproxyOAuthProvider, string> = {
  codex: "codex-auth-url",
  anthropic: "anthropic-auth-url",
  gemini: "gemini-cli-auth-url",
  xai: "xai-auth-url",
  antigravity: "antigravity-auth-url",
  kimi: "kimi-auth-url",
};

/** 管理 API 调用错误分类。 */
export type CliproxyManagementErrorKind = "auth_failed" | "unreachable" | "service_error";

/** 管理 API 调用错误。 */
export class CliproxyManagementApiError extends Error {
  readonly kind: CliproxyManagementErrorKind;
  readonly statusCode: number | null;

  constructor(kind: CliproxyManagementErrorKind, message: string, statusCode: number | null) {
    super(message);
    this.name = "CliproxyManagementApiError";
    this.kind = kind;
    this.statusCode = statusCode;
  }
}

/** auth-files 列表中的单个账号条目，仅声明已知非敏感字段，其余字段保留。 */
export interface CliproxyAuthFileEntry {
  name: string;
  type?: string;
  provider?: string;
  email?: string;
  status?: string;
  status_message?: string;
  disabled?: boolean;
  unavailable?: boolean;
  priority?: number;
  prefix?: string;
  note?: string;
  [key: string]: unknown;
}

/** auth-file 模型条目。 */
export interface CliproxyAuthFileModel {
  id: string;
  display_name?: string;
  type?: string;
  owned_by?: string;
}

/** 发起 OAuth 登录返回的授权信息。 */
export interface CliproxyAuthUrlResult {
  url: string;
  state: string;
}

/** OAuth 登录状态查询结果。 */
export interface CliproxyAuthStatusResult {
  status: "ok" | "wait" | "error";
  error?: string;
}

/** 账号字段更新请求体。 */
export interface CliproxyAuthFileFieldsPatch {
  name: string;
  prefix?: string;
  proxy_url?: string;
  headers?: Record<string, string>;
  priority?: number;
  note?: string;
}

/** 管理日志条目。 */
export interface CliproxyLogEntry {
  timestamp: string;
  level: string;
  message: string;
  [key: string]: unknown;
}

/** 连接参数：管理 API 基础地址与管理密钥明文。 */
export interface CliproxyManagementTarget {
  managementUrl: string;
  managementKey: string;
}

/**
 * 拼接管理 API 完整 URL。容忍基础地址结尾斜杠，
 * 并兼容基础地址已包含 `/v0/management` 前缀的情况。
 */
function buildManagementUrl(managementUrl: string, path: string): string {
  const trimmed = managementUrl.replace(/\/+$/, "");
  const base = trimmed.endsWith("/v0/management") ? trimmed : `${trimmed}/v0/management`;
  return `${base}${path}`;
}

/** 按响应状态码归类错误。 */
function classifyHttpError(statusCode: number): CliproxyManagementApiError {
  if (statusCode === 401 || statusCode === 403) {
    return new CliproxyManagementApiError(
      "auth_failed",
      "CLIProxyAPI 管理 API 鉴权失败，管理密钥无效",
      statusCode
    );
  }
  return new CliproxyManagementApiError(
    "service_error",
    `CLIProxyAPI 管理 API 返回异常状态码 ${statusCode}`,
    statusCode
  );
}

/**
 * 执行一次管理 API 请求并返回解析后的结果。
 *
 * `returnRawText` 为 true 时跳过 JSON.parse，直接将响应文本作为泛型 T 返回
 * （调用方需确保 T = string），用于上游返回纯文本而非 JSON 包装对象的端点
 * （例如 auth-files/download）。
 */
async function requestManagementApi<T>(
  target: CliproxyManagementTarget,
  path: string,
  init: { method: string; body?: unknown; returnRawText?: boolean },
  timeoutSeconds = DEFAULT_TIMEOUT_SECONDS
): Promise<T> {
  let requestUrl: string;
  try {
    requestUrl = buildManagementUrl(target.managementUrl, path);
    new URL(requestUrl);
  } catch {
    throw new CliproxyManagementApiError("unreachable", "管理 API 地址不是格式合法的 URL", null);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${target.managementKey}`,
    };
    if (init.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(requestUrl, {
      method: init.method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw classifyHttpError(response.status);
    }

    const text = await response.text();

    if (init.returnRawText) {
      return text as unknown as T;
    }

    // 部分写入端点可能返回空响应体。
    return (text ? JSON.parse(text) : {}) as T;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof CliproxyManagementApiError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new CliproxyManagementApiError(
        "unreachable",
        `管理 API 请求在 ${timeoutSeconds} 秒内未完成`,
        null
      );
    }
    log.warn(
      { error: error instanceof Error ? error.message : String(error), path },
      "CLIProxyAPI management API request failed"
    );
    throw new CliproxyManagementApiError("unreachable", "管理 API 地址不可达", null);
  }
}

/** 列出某 CLIProxyAPI 实例下的全部 OAuth 账号（auth-files）。 */
export async function listAuthFiles(
  target: CliproxyManagementTarget
): Promise<CliproxyAuthFileEntry[]> {
  const result = await requestManagementApi<{ files?: CliproxyAuthFileEntry[] }>(
    target,
    "/auth-files",
    { method: "GET" }
  );
  return Array.isArray(result.files) ? result.files : [];
}

/** 查询某个 auth-file 的可用模型列表。 */
export async function getAuthFileModels(
  target: CliproxyManagementTarget,
  authFileName: string
): Promise<CliproxyAuthFileModel[]> {
  const result = await requestManagementApi<{ models?: CliproxyAuthFileModel[] }>(
    target,
    `/auth-files/models?name=${encodeURIComponent(authFileName)}`,
    { method: "GET" }
  );
  return Array.isArray(result.models) ? result.models : [];
}

/** 更新某个 auth-file 的启用状态。 */
export async function patchAuthFileStatus(
  target: CliproxyManagementTarget,
  authFileName: string,
  disabled: boolean
): Promise<void> {
  await requestManagementApi(target, "/auth-files/status", {
    method: "PATCH",
    body: { name: authFileName, disabled },
  });
}

/** 更新某个 auth-file 的字段（前缀、出站代理、优先级、备注等）。 */
export async function patchAuthFileFields(
  target: CliproxyManagementTarget,
  patch: CliproxyAuthFileFieldsPatch
): Promise<void> {
  await requestManagementApi(target, "/auth-files/fields", {
    method: "PATCH",
    body: patch,
  });
}

/**
 * 删除指定的 auth-file。
 * 对应上游 `DELETE /v0/management/auth-files`，请求体携带 `{ name }`。
 */
export async function deleteAuthFile(
  target: CliproxyManagementTarget,
  authFileName: string
): Promise<void> {
  await requestManagementApi(target, "/auth-files", {
    method: "DELETE",
    body: { name: authFileName },
  });
}

/**
 * 上传（创建）一个 auth-file。
 *
 * 请求体为认证文件的完整 JSON 对象，由调用方构造；
 * 上游端点为 `POST /v0/management/auth-files`。
 */
export async function uploadAuthFile(
  target: CliproxyManagementTarget,
  content: Record<string, unknown>
): Promise<void> {
  await requestManagementApi(target, "/auth-files", {
    method: "POST",
    body: content,
  });
}

/**
 * 下载指定 auth-file 的原始 JSON 内容。
 *
 * 上游返回纯 JSON 字符串（非 `{ files: [...] }` 包装），通过 `returnRawText`
 * 选项跳过响应体的二次 JSON.parse，再由本方法显式解析以返回结构化对象。
 */
export async function downloadAuthFile(
  target: CliproxyManagementTarget,
  authFileName: string
): Promise<Record<string, unknown>> {
  const raw = await requestManagementApi<string>(
    target,
    `/auth-files/download?name=${encodeURIComponent(authFileName)}`,
    { method: "GET", returnRawText: true }
  );
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new CliproxyManagementApiError(
      "service_error",
      "CLIProxyAPI 返回的 auth-file 内容不是合法 JSON",
      null
    );
  }
}

/**
 * 获取指定服务商的 OAuth 授权地址。默认携带 `is_webui=true`，
 * 由 CLIProxyAPI 的 callbackForwarder 处理容器与远程部署下的回调。
 */
export async function getProviderAuthUrl(
  target: CliproxyManagementTarget,
  provider: CliproxyOAuthProvider
): Promise<CliproxyAuthUrlResult> {
  const endpoint = AUTH_URL_ENDPOINT[provider];
  const result = await requestManagementApi<Partial<CliproxyAuthUrlResult>>(
    target,
    `/${endpoint}?is_webui=true`,
    { method: "GET" }
  );
  if (!result.url || !result.state) {
    throw new CliproxyManagementApiError(
      "service_error",
      "CLIProxyAPI 未返回有效的授权地址或会话标识",
      null
    );
  }
  return { url: result.url, state: result.state };
}

/** 查询某个 OAuth 登录会话的状态。 */
export async function getAuthStatus(
  target: CliproxyManagementTarget,
  state: string
): Promise<CliproxyAuthStatusResult> {
  const result = await requestManagementApi<Partial<CliproxyAuthStatusResult>>(
    target,
    `/get-auth-status?state=${encodeURIComponent(state)}`,
    { method: "GET" }
  );
  const status = result.status === "wait" || result.status === "error" ? result.status : "ok";
  return { status, error: result.error };
}

/**
 * 手动提交 OAuth 回调地址，通知 CLIProxyAPI 完成授权流程。
 *
 * 对应上游 `POST /v0/management/oauth-callback`，
 * 请求体为 `{ provider, redirect_url }`，用于自动回调不可达时由管理员手动粘贴回调 URL。
 */
export async function submitOAuthCallback(
  target: CliproxyManagementTarget,
  provider: CliproxyOAuthProvider,
  redirectUrl: string
): Promise<void> {
  await requestManagementApi(target, "/oauth-callback", {
    method: "POST",
    body: { provider, redirect_url: redirectUrl },
  });
}

/**
 * 查询 CLIProxyAPI 管理日志。
 *
 * `since` 为可选的 ISO 8601 时间戳字符串，传入时仅返回该时刻之后的条目。
 * 兼容上游返回直接数组与 `{ logs: [...] }` 包装两种格式。
 */
export async function getLogs(
  target: CliproxyManagementTarget,
  since?: string
): Promise<CliproxyLogEntry[]> {
  const query = since ? `?since=${encodeURIComponent(since)}` : "";
  const result = await requestManagementApi<CliproxyLogEntry[] | { logs?: CliproxyLogEntry[] }>(
    target,
    `/logs${query}`,
    { method: "GET" }
  );
  if (Array.isArray(result)) {
    return result;
  }
  const wrapped = result as { logs?: CliproxyLogEntry[] };
  return Array.isArray(wrapped.logs) ? wrapped.logs : [];
}

/** 判断给定值是否为受支持的 OAuth 服务商。 */
export function isCliproxyOAuthProvider(value: unknown): value is CliproxyOAuthProvider {
  return (
    typeof value === "string" && CLIPROXY_OAUTH_PROVIDERS.includes(value as CliproxyOAuthProvider)
  );
}
