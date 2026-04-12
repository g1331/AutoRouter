/**
 * API 客户端
 * 封装 fetch API，自动注入 Authorization header，统一错误处理
 */

const API_BASE_URL = "/api";
const DEFAULT_ERROR_MESSAGE = "请求失败";

function getNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractErrorMessage(payload: unknown): string | undefined {
  const directMessage = getNonEmptyString(payload);
  if (directMessage) {
    return directMessage;
  }

  if (!isRecord(payload)) {
    return undefined;
  }

  const detailMessage = getNonEmptyString(payload.detail);
  if (detailMessage) {
    return detailMessage;
  }

  const topLevelErrorMessage = getNonEmptyString(payload.error);
  if (topLevelErrorMessage) {
    return topLevelErrorMessage;
  }

  if (isRecord(payload.error)) {
    const nestedErrorMessage =
      getNonEmptyString(payload.error.message) ?? getNonEmptyString(payload.error.detail);
    if (nestedErrorMessage) {
      return nestedErrorMessage;
    }
  }

  const topLevelMessage = getNonEmptyString(payload.message);
  if (topLevelMessage) {
    return topLevelMessage;
  }

  if (isRecord(payload.detail)) {
    return (
      getNonEmptyString(payload.detail.error) ??
      getNonEmptyString(payload.detail.message) ??
      getNonEmptyString(payload.detail.detail)
    );
  }

  return undefined;
}

/**
 * API 错误类
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * 未授权错误类
 */
export class UnauthorizedError extends ApiError {
  constructor(message: string = "认证已过期或无效") {
    super(message, 401);
    this.name = "UnauthorizedError";
  }
}

/**
 * API 客户端选项
 */
interface ApiClientOptions {
  getToken: () => string | null;
  onUnauthorized?: () => void;
}

/**
 * 创建 API 客户端
 */
export function createApiClient(options: ApiClientOptions) {
  const { getToken, onUnauthorized } = options;

  /**
   * 发起 API 请求
   */
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((init?.headers as Record<string, string>) || {}),
    };

    // 注入 Authorization header
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const url = `${API_BASE_URL}${path}`;

    try {
      const response = await fetch(url, {
        ...init,
        headers,
      });

      // 401 错误：触发登出逻辑
      if (response.status === 401) {
        onUnauthorized?.();
        throw new UnauthorizedError();
      }

      // 非 2xx 状态：解析错误详情
      if (!response.ok) {
        const fallbackMessage = getNonEmptyString(response.statusText) ?? DEFAULT_ERROR_MESSAGE;
        const rawErrorText = await response.text();
        const errorText = getNonEmptyString(rawErrorText);

        let errorDetail: unknown = fallbackMessage;
        let errorMessage = fallbackMessage;

        if (errorText) {
          try {
            const errorData = JSON.parse(errorText);
            errorDetail = errorData;
            errorMessage = extractErrorMessage(errorData) ?? fallbackMessage;
          } catch {
            errorDetail = errorText;
            errorMessage = errorText;
          }
        }

        throw new ApiError(errorMessage, response.status, errorDetail);
      }

      // 204 No Content：返回 null
      if (response.status === 204) {
        return null as T;
      }

      // 解析 JSON 响应
      return await response.json();
    } catch (error) {
      // 重新抛出 ApiError 和 UnauthorizedError
      if (error instanceof ApiError) {
        throw error;
      }

      // 网络错误
      throw new ApiError(error instanceof Error ? error.message : "网络请求失败", 0);
    }
  }

  return {
    /**
     * GET 请求
     */
    get: <T>(path: string, init?: Omit<RequestInit, "method" | "body">) =>
      request<T>(path, { ...init, method: "GET" }),

    /**
     * POST 请求
     */
    post: <T>(path: string, data?: unknown, init?: Omit<RequestInit, "method">) =>
      request<T>(path, {
        ...init,
        method: "POST",
        body: data ? JSON.stringify(data) : undefined,
      }),

    /**
     * PUT 请求
     */
    put: <T>(path: string, data?: unknown, init?: Omit<RequestInit, "method">) =>
      request<T>(path, {
        ...init,
        method: "PUT",
        body: data ? JSON.stringify(data) : undefined,
      }),

    /**
     * DELETE 请求
     */
    delete: <T>(path: string, init?: Omit<RequestInit, "method" | "body">) =>
      request<T>(path, { ...init, method: "DELETE" }),
  };
}
