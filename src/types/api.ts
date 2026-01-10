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
  key_value: string; // 完整 key，仅在创建时返回一次
}

export interface APIKeyRevealResponse {
  id: string; // UUID
  key_value: string; // 完整解密后的 key
  key_prefix: string;
  name: string;
}

export interface APIKeyUpdate {
  name?: string;
  description?: string | null;
  upstream_ids?: string[]; // UUID[]
  is_active?: boolean;
  expires_at?: string | null; // ISO 8601 date string
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

// ========== Request Log 相关类型 ==========

export interface RequestLogResponse {
  id: string; // UUID
  api_key_id: string | null; // UUID
  upstream_id: string | null; // UUID
  method: string | null;
  path: string | null;
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  status_code: number | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string; // ISO 8601 date string
}

// Type alias for convenience
export type RequestLog = RequestLogResponse;

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
export type PaginatedRequestLogsResponse = PaginatedResponse<RequestLogResponse>;

// ========== 错误响应类型 ==========

export interface ErrorDetail {
  error: string;
  message: string;
  request_id?: string;
}

// ========== 统计相关类型 ==========

export type TimeRange = "today" | "7d" | "30d";

export interface StatsOverviewResponse {
  today_requests: number;
  avg_response_time_ms: number;
  total_tokens_today: number;
  success_rate_today: number;
}

export interface TimeseriesDataPoint {
  timestamp: string; // ISO 8601 date string
  request_count: number;
  total_tokens: number;
  avg_duration_ms: number;
}

export interface UpstreamTimeseriesData {
  upstream_id: string | null; // UUID
  upstream_name: string;
  data: TimeseriesDataPoint[];
}

export interface StatsTimeseriesResponse {
  range: string;
  granularity: string;
  series: UpstreamTimeseriesData[];
}

export interface LeaderboardAPIKeyItem {
  id: string; // UUID
  name: string;
  key_prefix: string;
  request_count: number;
  total_tokens: number;
}

export interface LeaderboardUpstreamItem {
  id: string; // UUID
  name: string;
  provider: string;
  request_count: number;
  total_tokens: number;
}

export interface LeaderboardModelItem {
  model: string;
  request_count: number;
  total_tokens: number;
}

export interface StatsLeaderboardResponse {
  range: string;
  api_keys: LeaderboardAPIKeyItem[];
  upstreams: LeaderboardUpstreamItem[];
  models: LeaderboardModelItem[];
}
