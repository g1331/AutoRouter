/**
 * Unified error response format for downstream clients.
 *
 * This module provides standardized error responses that hide upstream
 * details from downstream clients while providing useful error information.
 */

import { NextResponse } from "next/server";

/**
 * Error codes for unified error responses.
 */
export type UnifiedErrorCode =
  | "ALL_UPSTREAMS_UNAVAILABLE"
  | "NO_AUTHORIZED_UPSTREAMS"
  | "NO_UPSTREAMS_CONFIGURED"
  | "SERVICE_UNAVAILABLE"
  | "REQUEST_TIMEOUT"
  | "CLIENT_DISCONNECTED"
  | "STREAM_ERROR";

/**
 * Error types for unified error responses.
 */
export type UnifiedErrorType = "service_unavailable" | "timeout" | "client_error" | "stream_error";

/**
 * Optional error reason details for better diagnostics.
 */
export type UnifiedErrorReason =
  | "NO_AUTHORIZED_UPSTREAMS"
  | "CLIENT_DISCONNECTED"
  | "NO_HEALTHY_CANDIDATES"
  | "UPSTREAM_HTTP_ERROR"
  | "UPSTREAM_NETWORK_ERROR";

export interface UnifiedErrorDetails {
  reason?: UnifiedErrorReason;
  did_send_upstream?: boolean;
  request_id?: string;
  user_hint?: string;
}

/**
 * Unified error response structure.
 * Compatible with OpenAI API error format.
 */
export interface UnifiedErrorResponse {
  error: {
    message: string;
    type: UnifiedErrorType;
    code: UnifiedErrorCode;
    reason?: UnifiedErrorReason;
    did_send_upstream?: boolean;
    request_id?: string;
    user_hint?: string;
  };
}

/**
 * Error message mappings for different error codes.
 */
const ERROR_MESSAGES: Record<UnifiedErrorCode, string> = {
  ALL_UPSTREAMS_UNAVAILABLE: "服务暂时不可用，请稍后重试",
  NO_AUTHORIZED_UPSTREAMS: "当前密钥未绑定可用上游，请先完成授权配置",
  NO_UPSTREAMS_CONFIGURED: "服务暂时不可用，请稍后重试",
  SERVICE_UNAVAILABLE: "服务暂时不可用，请稍后重试",
  REQUEST_TIMEOUT: "请求超时，请稍后重试",
  CLIENT_DISCONNECTED: "客户端已断开连接",
  STREAM_ERROR: "流式响应中断，请重试",
};

/**
 * Error type mappings for different error codes.
 */
const ERROR_TYPES: Record<UnifiedErrorCode, UnifiedErrorType> = {
  ALL_UPSTREAMS_UNAVAILABLE: "service_unavailable",
  NO_AUTHORIZED_UPSTREAMS: "client_error",
  NO_UPSTREAMS_CONFIGURED: "service_unavailable",
  SERVICE_UNAVAILABLE: "service_unavailable",
  REQUEST_TIMEOUT: "timeout",
  CLIENT_DISCONNECTED: "client_error",
  STREAM_ERROR: "stream_error",
};

/**
 * HTTP status code mappings for different error codes.
 */
const HTTP_STATUS_CODES: Record<UnifiedErrorCode, number> = {
  ALL_UPSTREAMS_UNAVAILABLE: 503,
  NO_AUTHORIZED_UPSTREAMS: 403,
  NO_UPSTREAMS_CONFIGURED: 503,
  SERVICE_UNAVAILABLE: 503,
  REQUEST_TIMEOUT: 504,
  CLIENT_DISCONNECTED: 499, // Client Closed Request (nginx convention)
  STREAM_ERROR: 502,
};

/**
 * Create a unified error response body.
 *
 * @param code - The error code
 * @param details - Optional diagnostic details for downstream users
 * @returns The unified error response object
 */
export function createUnifiedErrorBody(
  code: UnifiedErrorCode,
  details?: UnifiedErrorDetails
): UnifiedErrorResponse {
  return {
    error: {
      message: ERROR_MESSAGES[code],
      type: ERROR_TYPES[code],
      code,
      ...(details?.reason ? { reason: details.reason } : {}),
      ...(typeof details?.did_send_upstream === "boolean"
        ? { did_send_upstream: details.did_send_upstream }
        : {}),
      ...(details?.request_id ? { request_id: details.request_id } : {}),
      ...(details?.user_hint ? { user_hint: details.user_hint } : {}),
    },
  };
}

/**
 * Create a unified error NextResponse.
 *
 * @param code - The error code
 * @param details - Optional diagnostic details for downstream users
 * @returns A NextResponse with the unified error format
 */
export function createUnifiedErrorResponse(
  code: UnifiedErrorCode,
  details?: UnifiedErrorDetails
): NextResponse {
  return NextResponse.json(createUnifiedErrorBody(code, details), {
    status: HTTP_STATUS_CODES[code],
  });
}

/**
 * Create an SSE error event string for streaming responses.
 * This is sent when an error occurs after streaming has started.
 *
 * @param code - The error code
 * @param details - Optional diagnostic details for downstream users
 * @returns SSE formatted error event string
 */
export function createSSEErrorEvent(code: UnifiedErrorCode, details?: UnifiedErrorDetails): string {
  const errorBody = createUnifiedErrorBody(code, details);
  const data = JSON.stringify(errorBody);
  return `event: error\ndata: ${data}\n\n`;
}

/**
 * Get the HTTP status code for an error code.
 *
 * @param code - The error code
 * @returns The HTTP status code
 */
export function getHttpStatusForError(code: UnifiedErrorCode): number {
  return HTTP_STATUS_CODES[code];
}
