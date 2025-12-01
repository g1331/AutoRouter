/**
 * API 类型定义
 * 与后端 Pydantic schemas 保持一致
 */

// ========== API Key 相关类型 ==========

export interface APIKeyCreate {
  name: string;
  description?: string | null;
  upstream_ids: string[]; // UUID[]
  expires_at?: string | null; // ISO 8601 date string
}

export interface APIKeyResponse {
  id: string; // UUID
  key_prefix: string;
  name: string;
  description: string | null;
  upstream_ids: string[]; // UUID[]
  is_active: boolean;
  expires_at: string | null; // ISO 8601 date string
  created_at: string; // ISO 8601 date string
  updated_at: string; // ISO 8601 date string
}

// Type alias for convenience
export type APIKey = APIKeyResponse;

export interface APIKeyCreateResponse extends APIKeyResponse {
  key: string; // 完整 key，仅在创建时返回一次
}

// ========== Upstream 相关类型 ==========

export interface UpstreamCreate {
  name: string;
  provider: string; // "openai" | "anthropic"
  base_url: string;
  api_key: string;
  description?: string | null;
  is_default?: boolean;
  timeout?: number;
}

export interface UpstreamUpdate {
  name?: string;
  provider?: string;
  base_url?: string;
  api_key?: string; // 留空表示不更新
  description?: string | null;
  is_default?: boolean;
  timeout?: number;
}

export interface UpstreamResponse {
  id: string; // UUID
  name: string;
  provider: string;
  base_url: string;
  description: string | null;
  api_key_masked: string; // "sk-***1234"
  is_default: boolean;
  timeout: number;
  is_active: boolean;
  created_at: string; // ISO 8601 date string
  updated_at: string; // ISO 8601 date string
}

// Type alias for convenience
export type Upstream = UpstreamResponse;

// ========== 分页相关类型 ==========

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export type PaginatedAPIKeysResponse = PaginatedResponse<APIKeyResponse>;
export type PaginatedUpstreamsResponse = PaginatedResponse<UpstreamResponse>;

// ========== 错误响应类型 ==========

export interface ErrorDetail {
  error: string;
  message: string;
  request_id?: string;
}
