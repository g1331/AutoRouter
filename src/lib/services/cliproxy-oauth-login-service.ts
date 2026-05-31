import {
  getCliproxyInstanceRow,
  getDecryptedManagementKey,
  CliproxyInstanceNotFoundError,
} from "./cliproxy-instance-crud";
import {
  getProviderAuthUrl,
  getAuthStatus,
  submitOAuthCallback,
  isCliproxyOAuthProvider,
  type CliproxyOAuthProvider,
  type CliproxyManagementTarget,
} from "./cliproxy-management-client";
import {
  syncCliproxyAuthAccounts,
  type CliproxyAuthAccountSyncResult,
} from "./cliproxy-auth-account-service";
import { createLogger } from "../utils/logger";

const log = createLogger("cliproxy-oauth-login-service");

/** 服务商取值非法错误。 */
export class InvalidCliproxyOAuthProviderError extends Error {
  constructor(provider: string) {
    super(`Unsupported CLIProxyAPI OAuth provider: ${provider}`);
    this.name = "InvalidCliproxyOAuthProviderError";
  }
}

/** 发起 OAuth 登录的结果。 */
export interface CliproxyOAuthLoginInitiateResult {
  provider: CliproxyOAuthProvider;
  /** OAuth 授权地址，供管理端展示给用户。 */
  url: string;
  /** 登录会话标识，用于后续轮询。 */
  state: string;
}

/** OAuth 登录状态查询结果。 */
export interface CliproxyOAuthLoginStatusResult {
  status: "ok" | "wait" | "error";
  error?: string;
  /** 登录成功并完成账号同步时返回的同步结果。 */
  syncResult?: CliproxyAuthAccountSyncResult;
}

/** 解析实例并构造管理 API 调用目标。 */
async function resolveTarget(instanceId: string): Promise<CliproxyManagementTarget> {
  const instance = await getCliproxyInstanceRow(instanceId);
  if (!instance) {
    throw new CliproxyInstanceNotFoundError(instanceId);
  }
  return {
    managementUrl: instance.managementUrl,
    managementKey: getDecryptedManagementKey(instance),
  };
}

/**
 * 发起某 CLIProxyAPI 实例的 OAuth 登录。
 *
 * 校验服务商取值，调用 CLIProxyAPI 获取授权地址，返回授权地址与会话标识。
 * AutoRouter 不持久化登录会话，会话状态由 CLIProxyAPI 通过 `state` 维护。
 */
export async function initiateCliproxyOAuthLogin(
  instanceId: string,
  provider: string
): Promise<CliproxyOAuthLoginInitiateResult> {
  if (!isCliproxyOAuthProvider(provider)) {
    throw new InvalidCliproxyOAuthProviderError(provider);
  }
  const target = await resolveTarget(instanceId);
  const { url, state } = await getProviderAuthUrl(target, provider);
  log.info({ instanceId, provider }, "initiated CLIProxyAPI OAuth login");
  return { provider, url, state };
}

/**
 * 查询某 OAuth 登录会话的状态。
 *
 * 透传 CLIProxyAPI 的登录状态。当状态为成功时，触发该实例的账号同步，
 * 使新登录账号立即进入缓存表，并返回同步结果。
 */
export async function pollCliproxyOAuthStatus(
  instanceId: string,
  state: string
): Promise<CliproxyOAuthLoginStatusResult> {
  const target = await resolveTarget(instanceId);
  const { status, error } = await getAuthStatus(target, state);

  if (status === "ok") {
    const syncResult = await syncCliproxyAuthAccounts(instanceId);
    log.info({ instanceId, syncResult }, "CLIProxyAPI OAuth login completed, accounts synced");
    return { status, syncResult };
  }

  return { status, error };
}

/**
 * 手动提交 OAuth 回调地址，绕过自动回调链路完成授权。
 *
 * 适用于 CLIProxyAPI 的 callback forwarder 无法回到本地（例如远程部署、容器
 * 网络隔离）的场景：管理员从浏览器地址栏复制回调 URL 后通过本接口提交。
 * 上游处理成功后触发该实例的账号同步，使新登录账号立即进入缓存表。
 */
export async function submitCliproxyOAuthCallback(
  instanceId: string,
  provider: string,
  redirectUrl: string
): Promise<CliproxyOAuthLoginStatusResult> {
  if (!isCliproxyOAuthProvider(provider)) {
    throw new InvalidCliproxyOAuthProviderError(provider);
  }
  const target = await resolveTarget(instanceId);
  await submitOAuthCallback(target, provider, redirectUrl);
  const syncResult = await syncCliproxyAuthAccounts(instanceId);
  log.info(
    { instanceId, provider, syncResult },
    "submitted CLIProxyAPI OAuth callback URL and synced accounts"
  );
  return { status: "ok", syncResult };
}
