import type {
  UpstreamResponse as ServiceUpstreamResponse,
  PaginatedUpstreams,
} from "@/lib/services/upstream-crud";

// ========== Helper Utilities ==========

/**
 * Convert a Date to ISO string, or return null if the date is null/undefined.
 */
export function toISOStringOrNull(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

// ========== Upstream API Response Types ==========

/**
 * API response format for upstream (snake_case).
 * This matches the actual response format used by the API routes.
 */
export interface UpstreamApiResponse {
  id: string;
  name: string;
  provider: string;
  base_url: string;
  api_key_masked: string;
  is_default: boolean;
  timeout: number;
  is_active: boolean;
  config: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Paginated API response format.
 */
export interface PaginatedApiResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ========== Upstream Transformers ==========

/**
 * Transform a service layer upstream response to API response format.
 * Converts camelCase properties to snake_case for API consistency.
 */
export function transformUpstreamToApi(upstream: ServiceUpstreamResponse): UpstreamApiResponse {
  return {
    id: upstream.id,
    name: upstream.name,
    provider: upstream.provider,
    base_url: upstream.baseUrl,
    api_key_masked: upstream.apiKeyMasked,
    is_default: upstream.isDefault,
    timeout: upstream.timeout,
    is_active: upstream.isActive,
    config: upstream.config,
    created_at: upstream.createdAt.toISOString(),
    updated_at: upstream.updatedAt.toISOString(),
  };
}

/**
 * Transform paginated upstream results to API response format.
 */
export function transformPaginatedUpstreams(
  result: PaginatedUpstreams
): PaginatedApiResponse<UpstreamApiResponse> {
  return {
    items: result.items.map(transformUpstreamToApi),
    total: result.total,
    page: result.page,
    page_size: result.pageSize,
    total_pages: result.totalPages,
  };
}
