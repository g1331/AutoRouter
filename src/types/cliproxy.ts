/**
 * CLIProxyAPI 管理界面相关的前端类型定义。
 *
 * 字段命名与后端 Admin API 的响应保持一致，使用 snake_case。
 */

/** CLIProxyAPI 实例运行模式。 */
export type CliproxyInstanceMode = "managed" | "external";

/** 全部可选运行模式，供表单选项使用。 */
export const CLIPROXY_INSTANCE_MODES: readonly CliproxyInstanceMode[] = ["managed", "external"];

/** CLI OAuth 服务商。 */
export type CliproxyProvider = "codex" | "anthropic" | "gemini" | "xai" | "antigravity" | "kimi";

/** 全部 CLI OAuth 服务商，供选项使用。 */
export const CLIPROXY_PROVIDERS: readonly CliproxyProvider[] = [
  "codex",
  "anthropic",
  "gemini",
  "xai",
  "antigravity",
  "kimi",
];

/**
 * 支持一键创建池上游或单账号上游的服务商集合。
 *
 * 当前只覆盖 OAuth Provider 的子集，因为 xAI / Antigravity / Kimi 的代理路径与
 * 路由能力约定尚未稳定。OAuth 登录仍可在全部 6 个 Provider 上发起。
 */
export type CliproxyUpstreamProvider = "codex" | "anthropic" | "gemini";

/** 全部支持上游预设的服务商。 */
export const CLIPROXY_UPSTREAM_PROVIDERS: readonly CliproxyUpstreamProvider[] = [
  "codex",
  "anthropic",
  "gemini",
];

/** CLIProxyAPI 实例的对外响应形态，凭据明文以布尔标记代替。 */
export interface CliproxyInstance {
  id: string;
  name: string;
  mode: string;
  base_url: string;
  management_url: string;
  has_client_api_key: boolean;
  has_management_key: boolean;
  enabled: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/** 创建实例的请求体。 */
export interface CliproxyInstanceCreate {
  name: string;
  mode: CliproxyInstanceMode;
  base_url: string;
  management_url: string;
  client_api_key: string;
  management_key: string;
  enabled?: boolean;
  description?: string | null;
}

/** 更新实例的请求体，全部字段可选。 */
export interface CliproxyInstanceUpdate {
  name?: string;
  mode?: CliproxyInstanceMode;
  base_url?: string;
  management_url?: string;
  client_api_key?: string;
  management_key?: string;
  enabled?: boolean;
  description?: string | null;
}

/** 连通性检测结果状态。 */
export type CliproxyConnectionStatus = "success" | "auth_failed" | "unreachable" | "service_error";

/** 连通性检测结果。 */
export interface CliproxyConnectionTestResult {
  status: CliproxyConnectionStatus;
  message: string;
  statusCode: number | null;
}

/** CLIProxyAPI OAuth 账号的对外响应形态。 */
export interface CliproxyAuthAccount {
  id: string;
  instance_id: string;
  auth_file_name: string;
  provider: string;
  email: string | null;
  status: string | null;
  disabled: boolean;
  prefix: string | null;
  model_count: number;
  priority: number | null;
  note: string | null;
  raw_metadata: Record<string, unknown> | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 账号字段更新请求体。 */
export interface CliproxyAuthAccountFieldsUpdate {
  prefix?: string;
  proxy_url?: string;
  priority?: number;
  note?: string;
}

/** 账号同步结果。 */
export interface CliproxyAuthAccountSyncResult {
  added: number;
  updated: number;
  removed: number;
  total: number;
}

/** 发起 OAuth 登录的结果。 */
export interface CliproxyOAuthInitiateResult {
  provider: CliproxyProvider;
  /** OAuth 授权地址。 */
  url: string;
  /** 登录会话标识，用于轮询登录状态。 */
  state: string;
}

/** OAuth 登录状态。 */
export type CliproxyOAuthStatus = "ok" | "wait" | "error";

/** OAuth 登录状态查询结果。 */
export interface CliproxyOAuthStatusResult {
  status: CliproxyOAuthStatus;
  error?: string;
  syncResult?: CliproxyAuthAccountSyncResult;
}

/** CLIProxyAPI 管理日志条目。 */
export interface CliproxyLogEntry {
  timestamp: string;
  level: string;
  message: string;
  [key: string]: unknown;
}

/** CLIProxyAPI auth-file 模型条目。 */
export interface CliproxyAuthFileModel {
  id: string;
  display_name?: string;
  type?: string;
  owned_by?: string;
}

/** 关联上游类型。 */
export type CliproxyLinkedUpstreamKind = "pool" | "single";

/** 实例下关联的上游记录。 */
export interface CliproxyLinkedUpstream {
  id: string;
  name: string;
  provider: string;
  kind: CliproxyLinkedUpstreamKind;
  auth_file_name: string | null;
  is_active: boolean;
  created_at: string;
}
