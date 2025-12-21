/**
 * API 客户端
 * 封装 fetch API，自动注入 Authorization header，统一错误处理
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

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
        let errorDetail: unknown;
        try {
          const errorData = await response.json();
          errorDetail = errorData.detail || errorData;
        } catch {
          errorDetail = response.statusText;
        }

        throw new ApiError(
          typeof errorDetail === "string" ? errorDetail : "请求失败",
          response.status,
          errorDetail
        );
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
