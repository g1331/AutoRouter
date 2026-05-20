import { errorResponse } from "./api-auth";
import { CliproxyInstanceNotFoundError } from "@/lib/services/cliproxy-instance-crud";
import { CliproxyAuthAccountNotFoundError } from "@/lib/services/cliproxy-auth-account-service";
import { CliproxyManagementApiError } from "@/lib/services/cliproxy-management-client";
import { InvalidCliproxyOAuthProviderError } from "@/lib/services/cliproxy-oauth-login-service";

/**
 * 将 CLIProxyAPI 相关领域错误映射为标准 HTTP 错误响应。
 *
 * 命中已知领域错误时返回对应响应，未命中时返回 null，由调用方按 500 处理。
 * CLIProxyAPI 管理 API 调用失败统一映射为 502，表示上游服务异常。
 */
export function handleCliproxyRouteError(err: unknown): Response | null {
  if (err instanceof CliproxyInstanceNotFoundError) {
    return errorResponse("CLIProxyAPI instance not found", 404);
  }
  if (err instanceof CliproxyAuthAccountNotFoundError) {
    return errorResponse("CLIProxyAPI auth account not found", 404);
  }
  if (err instanceof InvalidCliproxyOAuthProviderError) {
    return errorResponse(err.message, 400);
  }
  if (err instanceof CliproxyManagementApiError) {
    return errorResponse(`CLIProxyAPI 管理 API 调用失败：${err.message}`, 502);
  }
  return null;
}
