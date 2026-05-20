import type { CliproxyInstanceResponse } from "@/lib/services/cliproxy-instance-crud";

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
