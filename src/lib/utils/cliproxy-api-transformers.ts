import type { CliproxyInstanceResponse } from "@/lib/services/cliproxy-instance-crud";
import type { CliproxyAuthAccount } from "@/lib/db";

/** CLIProxyAPI 实例的对外 API 响应形态，使用 snake_case 字段并隐去凭据明文。 */
export interface CliproxyInstanceApiResponse {
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

/** 将服务层实例 DTO 转换为对外 API 响应。 */
export function toCliproxyInstanceApiResponse(
  instance: CliproxyInstanceResponse
): CliproxyInstanceApiResponse {
  return {
    id: instance.id,
    name: instance.name,
    mode: instance.mode,
    base_url: instance.baseUrl,
    management_url: instance.managementUrl,
    has_client_api_key: instance.hasClientApiKey,
    has_management_key: instance.hasManagementKey,
    enabled: instance.enabled,
    description: instance.description,
    created_at: instance.createdAt.toISOString(),
    updated_at: instance.updatedAt.toISOString(),
  };
}

/** CLIProxyAPI OAuth 账号的对外 API 响应形态，使用 snake_case 字段。 */
export interface CliproxyAuthAccountApiResponse {
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

/** 将 OAuth 账号缓存记录转换为对外 API 响应。 */
export function toCliproxyAuthAccountApiResponse(
  account: CliproxyAuthAccount
): CliproxyAuthAccountApiResponse {
  return {
    id: account.id,
    instance_id: account.instanceId,
    auth_file_name: account.authFileName,
    provider: account.provider,
    email: account.email ?? null,
    status: account.status ?? null,
    disabled: account.disabled,
    prefix: account.prefix ?? null,
    model_count: account.modelCount,
    priority: account.priority ?? null,
    note: account.note ?? null,
    raw_metadata: account.rawMetadata ?? null,
    last_synced_at: account.lastSyncedAt ? account.lastSyncedAt.toISOString() : null,
    created_at: account.createdAt.toISOString(),
    updated_at: account.updatedAt.toISOString(),
  };
}
