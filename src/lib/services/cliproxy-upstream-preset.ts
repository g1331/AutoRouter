import { eq } from "drizzle-orm";
import { db, upstreams } from "../db";
import { createLogger } from "../utils/logger";
import type { RouteCapability } from "@/lib/route-capabilities";
import {
  getCliproxyInstanceRow,
  getDecryptedClientApiKey,
  CliproxyInstanceNotFoundError,
} from "./cliproxy-instance-crud";
import { isCliproxyOAuthProvider } from "./cliproxy-management-client";
import { InvalidCliproxyOAuthProviderError } from "./cliproxy-oauth-login-service";
import { CLIPROXY_UPSTREAM_PROVIDERS, type CliproxyUpstreamProvider } from "@/types/cliproxy";
import {
  getCliproxyAuthAccount,
  updateCliproxyAuthAccountFields,
  CliproxyAuthAccountNotFoundError,
} from "./cliproxy-auth-account-service";
import { createUpstream, type UpstreamResponse } from "./upstream-crud";

const log = createLogger("cliproxy-upstream-preset");

/** 账号前缀与模型名之间的分隔符，须与 CLIProxyAPI 的 `rewriteModelForAuth` 约定一致。 */
export const CLIPROXY_PREFIX_DELIMITER = "/";

/** 单个服务商的池上游预设。 */
interface CliproxyUpstreamPreset {
  /** 代理地址在实例 baseUrl 之后追加的服务商专属路径后缀。 */
  pathSuffix: string;
  /** 该服务商池上游的默认路由能力。 */
  routeCapabilities: RouteCapability[];
  /** 用于生成默认上游名称的服务商显示名。 */
  label: string;
}

/**
 * 三类 CLI 服务商的池上游预设表。路径后缀与路由能力为 CLIProxyAPI 的对外约定，
 * 集中维护于此，CLIProxyAPI 调整对外约定时改动收敛于这一处。
 *
 * Provider 列表与类型复用 `@/types/cliproxy` 中的 `CLIPROXY_UPSTREAM_PROVIDERS`，
 * 使前端 Zod schema、后端 route schema 与本预设表共享同一来源。
 */
export const CLIPROXY_UPSTREAM_PRESETS: Record<CliproxyUpstreamProvider, CliproxyUpstreamPreset> = {
  codex: {
    pathSuffix: "/v1",
    routeCapabilities: ["codex_cli_responses", "openai_responses"],
    label: "Codex",
  },
  anthropic: {
    pathSuffix: "/api/provider/anthropic/v1",
    routeCapabilities: ["claude_code_messages", "anthropic_messages"],
    label: "Claude",
  },
  gemini: {
    pathSuffix: "/api/provider/google",
    routeCapabilities: ["gemini_native_generate"],
    label: "Gemini",
  },
};

/** 判断给定值是否为支持一键创建池上游的服务商。 */
export function isCliproxyUpstreamPresetProvider(
  value: unknown
): value is CliproxyUpstreamProvider {
  return (
    typeof value === "string" && (CLIPROXY_UPSTREAM_PROVIDERS as readonly string[]).includes(value)
  );
}

/** 账号前缀取值非法错误。 */
export class InvalidCliproxyPrefixError extends Error {
  constructor(prefix: string) {
    super(`CLIProxyAPI account prefix is invalid: ${prefix}`);
    this.name = "InvalidCliproxyPrefixError";
  }
}

/**
 * 归一化账号前缀：去除首尾空白与斜杠。归一化后为空或仍含斜杠时判为非法，
 * 与 CLIProxyAPI 对前缀不得包含斜杠的约束保持一致。
 */
export function normalizeCliproxyPrefix(prefix: string): string {
  const normalized = prefix.trim().replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized.includes(CLIPROXY_PREFIX_DELIMITER)) {
    throw new InvalidCliproxyPrefixError(prefix);
  }
  return normalized;
}

/**
 * 将账号前缀拼接到模型名前，得到 CLIProxyAPI 固定账号路由所需的 `<前缀>/<模型名>` 形式。
 * 模型名已以该前缀开头时跳过，避免重复拼接。
 */
export function buildCliproxyPrefixedModel(prefix: string, model: string): string {
  const normalizedPrefix = normalizeCliproxyPrefix(prefix);
  const head = `${normalizedPrefix}${CLIPROXY_PREFIX_DELIMITER}`;
  return model.startsWith(head) ? model : `${head}${model}`;
}

/**
 * 转发层使用：取单账号映射上游所绑定 OAuth 账号的前缀。
 *
 * 账号缓存记录不存在、账号无前缀或前缀取值非法时返回 null，由调用方据此决定是否注入。
 * 返回值经 `normalizeCliproxyPrefix` 归一化，与创建上游时写入 CLIProxyAPI 的形式一致。
 */
export async function resolveCliproxyAccountPrefix(
  instanceId: string,
  authFileName: string
): Promise<string | null> {
  const account = await getCliproxyAuthAccount(instanceId, authFileName);
  if (!account?.prefix) {
    return null;
  }
  try {
    return normalizeCliproxyPrefix(account.prefix);
  } catch (err) {
    log.warn(
      {
        instanceId,
        authFileName,
        prefix: account.prefix,
        err: err instanceof Error ? err.message : String(err),
      },
      "CLIProxyAPI account prefix is invalid, skipping model prefix injection"
    );
    return null;
  }
}

/** 由账号文件名推导默认前缀：去除 `.json` 后缀并移除斜杠。 */
function buildDefaultAccountPrefix(authFileName: string): string {
  const base = authFileName.replace(/\.json$/i, "");
  return normalizeCliproxyPrefix(base.replace(/\//g, "-"));
}

/** 去除地址结尾的斜杠，便于与服务商路径后缀拼接。 */
function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/** 创建 CLIProxyAPI 上游的可选项。 */
export interface CliproxyUpstreamCreateOptions {
  /** 上游名称，未提供时按实例名与服务商生成默认名称。 */
  name?: string;
  /** 上游权重，未提供时沿用 `createUpstream` 默认值。 */
  weight?: number;
  /** 上游优先级，未提供时沿用 `createUpstream` 默认值。 */
  priority?: number;
  /** 自定义账号前缀，仅单账号映射上游在账号尚无前缀时生效。 */
  prefix?: string;
}

/** 落库后回填上游的 CLIProxyAPI 关联字段，回填失败仅记录告警，上游仍是可用的普通上游。 */
async function backfillCliproxyColumns(
  upstreamId: string,
  values: { cliproxyInstanceId: string; cliproxyProvider: string; cliproxyAuthFileName?: string }
): Promise<void> {
  try {
    await db
      .update(upstreams)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(upstreams.id, upstreamId));
  } catch (err) {
    log.warn(
      { upstreamId, err: err instanceof Error ? err.message : String(err) },
      "failed to backfill CLIProxyAPI columns on upstream"
    );
  }
}

/**
 * 按服务商一键创建 OAuth 池上游。
 *
 * 代理地址由实例 baseUrl 拼接服务商路径后缀得到，鉴权使用实例的客户端 API Key，
 * 路由能力按服务商预设。复用 `createUpstream` 落库后回填实例与服务商关联字段。
 */
export async function createCliproxyPoolUpstream(
  instanceId: string,
  provider: string,
  options: CliproxyUpstreamCreateOptions = {}
): Promise<UpstreamResponse> {
  // OAuth 支持的 Provider 是池上游 Provider 的超集；这里仅允许已配置 preset 的服务商，
  // 避免在没有上游路径与路由能力约定的情况下创建无法转发的上游。
  if (!isCliproxyUpstreamPresetProvider(provider)) {
    throw new InvalidCliproxyOAuthProviderError(provider);
  }
  const instance = await getCliproxyInstanceRow(instanceId);
  if (!instance) {
    throw new CliproxyInstanceNotFoundError(instanceId);
  }

  const preset = CLIPROXY_UPSTREAM_PRESETS[provider];
  const created = await createUpstream({
    name: options.name ?? `CLIProxyAPI ${instance.name} ${preset.label} Pool`,
    baseUrl: `${trimTrailingSlash(instance.baseUrl)}${preset.pathSuffix}`,
    apiKey: getDecryptedClientApiKey(instance),
    routeCapabilities: preset.routeCapabilities,
    weight: options.weight,
    priority: options.priority,
  });

  await backfillCliproxyColumns(created.id, {
    cliproxyInstanceId: instanceId,
    cliproxyProvider: provider,
  });

  log.info({ instanceId, provider, upstreamId: created.id }, "created CLIProxyAPI pool upstream");
  return created;
}

/**
 * 将单个 OAuth 账号固定映射为一个上游。
 *
 * 以对应服务商池上游配置为基础创建上游，确定账号前缀（已有则沿用，否则生成并通过
 * CLIProxyAPI 写入该账号），落库后回填实例、服务商与账号文件名关联字段。
 * 请求转发时由代理层按账号前缀改写模型名，使 CLIProxyAPI 固定路由到该账号。
 */
export async function createCliproxySingleAccountUpstream(
  instanceId: string,
  authFileName: string,
  options: CliproxyUpstreamCreateOptions = {}
): Promise<UpstreamResponse> {
  const instance = await getCliproxyInstanceRow(instanceId);
  if (!instance) {
    throw new CliproxyInstanceNotFoundError(instanceId);
  }
  const account = await getCliproxyAuthAccount(instanceId, authFileName);
  if (!account) {
    throw new CliproxyAuthAccountNotFoundError(instanceId, authFileName);
  }

  const provider = account.provider;
  // 单账号上游同样要求 Provider 已配置 preset，否则没有路径与路由能力可用。
  if (!isCliproxyOAuthProvider(provider) || !isCliproxyUpstreamPresetProvider(provider)) {
    throw new InvalidCliproxyOAuthProviderError(provider);
  }

  // 确定账号前缀：已有则沿用，否则生成并通过 CLIProxyAPI 写入该账号。
  let prefix: string;
  if (account.prefix) {
    prefix = normalizeCliproxyPrefix(account.prefix);
  } else {
    prefix = options.prefix
      ? normalizeCliproxyPrefix(options.prefix)
      : buildDefaultAccountPrefix(authFileName);
    await updateCliproxyAuthAccountFields(instanceId, authFileName, { prefix });
  }

  const preset = CLIPROXY_UPSTREAM_PRESETS[provider];
  const created = await createUpstream({
    name: options.name ?? `CLIProxyAPI ${instance.name} ${authFileName}`,
    baseUrl: `${trimTrailingSlash(instance.baseUrl)}${preset.pathSuffix}`,
    apiKey: getDecryptedClientApiKey(instance),
    routeCapabilities: preset.routeCapabilities,
    weight: options.weight,
    priority: options.priority,
  });

  await backfillCliproxyColumns(created.id, {
    cliproxyInstanceId: instanceId,
    cliproxyProvider: provider,
    cliproxyAuthFileName: authFileName,
  });

  log.info(
    { instanceId, authFileName, provider, prefix, upstreamId: created.id },
    "created CLIProxyAPI single-account upstream"
  );
  return created;
}
