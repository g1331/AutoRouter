import { createLogger } from "../utils/logger";

const log = createLogger("cliproxy-connection-tester");

/** 管理 API 探活使用的只读端点路径。 */
const PROBE_PATH = "/v0/management/auth-files";

/** 连通性检测默认超时（秒）。 */
const DEFAULT_TIMEOUT_SECONDS = 10;

export type CliproxyConnectionStatus = "success" | "auth_failed" | "unreachable" | "service_error";

export interface TestCliproxyConnectionInput {
  /** CLIProxyAPI 管理 API 基础地址。 */
  managementUrl: string;
  /** 管理 API 密钥明文。 */
  managementKey: string;
  /** 可选超时（秒），默认 10。 */
  timeout?: number;
}

export interface TestCliproxyConnectionResult {
  status: CliproxyConnectionStatus;
  /** 面向管理员的可理解说明。 */
  message: string;
  /** 命中的 HTTP 状态码，网络或超时错误时为 null。 */
  statusCode: number | null;
}

/**
 * 将管理 API 基础地址与探活路径拼接为完整 URL。
 * 容忍基础地址结尾的斜杠，并兼容基础地址已包含 `/v0/management` 前缀的情况。
 */
function buildProbeUrl(managementUrl: string): string {
  const trimmed = managementUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/v0/management")) {
    return `${trimmed}/auth-files`;
  }
  return `${trimmed}${PROBE_PATH}`;
}

/**
 * 检测 CLIProxyAPI 管理 API 连通性。
 *
 * 调用管理 API 只读端点 `GET /v0/management/auth-files`，根据响应区分四类结果：
 * - success：HTTP 2xx，连接正常。
 * - auth_failed：HTTP 401/403，管理密钥无效。
 * - unreachable：连接超时、DNS 失败、连接拒绝，地址不可达。
 * - service_error：其他非 2xx 状态码，CLIProxyAPI 返回异常。
 */
export async function testCliproxyConnection(
  input: TestCliproxyConnectionInput
): Promise<TestCliproxyConnectionResult> {
  const { managementUrl, managementKey } = input;
  const timeout = input.timeout ?? DEFAULT_TIMEOUT_SECONDS;

  let probeUrl: string;
  try {
    probeUrl = buildProbeUrl(managementUrl);
    // 校验拼接结果为合法 URL。
    new URL(probeUrl);
  } catch {
    return {
      status: "unreachable",
      message: "管理 API 地址不是格式合法的 URL",
      statusCode: null,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);

  try {
    const response = await fetch(probeUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${managementKey}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      return {
        status: "success",
        message: "CLIProxyAPI 管理 API 连接正常",
        statusCode: response.status,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        status: "auth_failed",
        message: "管理 API 密钥无效，CLIProxyAPI 拒绝鉴权",
        statusCode: response.status,
      };
    }

    return {
      status: "service_error",
      message: `CLIProxyAPI 管理 API 返回异常状态码 ${response.status}`,
      statusCode: response.status,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      return {
        status: "unreachable",
        message: `管理 API 地址不可达：请求在 ${timeout} 秒内未完成`,
        statusCode: null,
      };
    }

    log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "CLIProxyAPI connection test failed"
    );
    return {
      status: "unreachable",
      message: "管理 API 地址不可达：无法建立连接",
      statusCode: null,
    };
  }
}
