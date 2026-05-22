import { createLogger } from "../utils/logger";

const log = createLogger("cliproxy-management-client");

/** 管理 API 调用默认超时（秒）。 */
const DEFAULT_TIMEOUT_SECONDS = 15;

/** CLIProxyAPI 支持发起 OAuth 登录的服务商。 */
export const CLIPROXY_OAUTH_PROVIDERS = ["codex", "anthropic", "gemini"] as const;
export type CliproxyOAuthProvider = (typeof CLIPROXY_OAUTH_PROVIDERS)[number];

/** 各服务商对应的授权地址端点片段。 */
const AUTH_URL_ENDPOINT: Record<CliproxyOAuthProvider, string> = {
  codex: "codex-auth-url",
  anthropic: "anthropic-auth-url",
  gemini: "gemini-cli-auth-url",
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

/** 执行一次管理 API 请求并返回解析后的 JSON。 */
async function requestManagementApi<T>(
  target: CliproxyManagementTarget,
  path: string,
  init: { method: string; body?: unknown },
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

    // 部分写入端点可能返回空响应体。
    const text = await response.text();
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

/** 判断给定值是否为受支持的 OAuth 服务商。 */
export function isCliproxyOAuthProvider(value: unknown): value is CliproxyOAuthProvider {
  return (
    typeof value === "string" && CLIPROXY_OAUTH_PROVIDERS.includes(value as CliproxyOAuthProvider)
  );
}
