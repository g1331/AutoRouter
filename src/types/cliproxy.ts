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
export type CliproxyProvider = "codex" | "anthropic" | "gemini";

/** 全部 CLI OAuth 服务商，供选项使用。 */
export const CLIPROXY_PROVIDERS: readonly CliproxyProvider[] = ["codex", "anthropic", "gemini"];

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
