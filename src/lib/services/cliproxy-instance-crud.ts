import { eq, desc } from "drizzle-orm";
import { db, cliproxyInstances, type CliproxyInstance } from "../db";
import { encrypt, decrypt } from "../utils/encryption";
import { isUrlSafe } from "./upstream-ssrf-validator";
import { createLogger } from "../utils/logger";

const log = createLogger("cliproxy-instance-crud");

/**
 * CLIProxyAPI 实例运行模式。
 * - managed：受管 sidecar，与 AutoRouter 同处一个部署网络。
 * - external：外部独立运行的 CLIProxyAPI 服务。
 */
export const CLIPROXY_INSTANCE_MODES = ["managed", "external"] as const;
export type CliproxyInstanceMode = (typeof CLIPROXY_INSTANCE_MODES)[number];

/** 判断给定值是否为合法的运行模式取值。 */
export function isCliproxyInstanceMode(value: unknown): value is CliproxyInstanceMode {
  return (
    typeof value === "string" && CLIPROXY_INSTANCE_MODES.includes(value as CliproxyInstanceMode)
  );
}

/** 实例不存在错误。 */
export class CliproxyInstanceNotFoundError extends Error {
  constructor(instanceId: string) {
    super(`CLIProxyAPI instance not found: ${instanceId}`);
    this.name = "CliproxyInstanceNotFoundError";
  }
}

/** 实例名称冲突错误。 */
export class CliproxyInstanceNameConflictError extends Error {
  constructor(name: string) {
    super(`CLIProxyAPI instance with name '${name}' already exists`);
    this.name = "CliproxyInstanceNameConflictError";
  }
}

/** 实例地址校验失败错误。 */
export class InvalidCliproxyInstanceAddressError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "InvalidCliproxyInstanceAddressError";
  }
}

/** 实例仍被引用、无法删除错误。 */
export class CliproxyInstanceInUseError extends Error {
  constructor(instanceId: string, reason: string) {
    super(`CLIProxyAPI instance ${instanceId} is still in use: ${reason}`);
    this.name = "CliproxyInstanceInUseError";
  }
}

export interface CliproxyInstanceCreateInput {
  name: string;
  mode: CliproxyInstanceMode;
  baseUrl: string;
  managementUrl: string;
  clientApiKey: string;
  managementKey: string;
  enabled?: boolean;
  description?: string | null;
}

export interface CliproxyInstanceUpdateInput {
  name?: string;
  mode?: CliproxyInstanceMode;
  baseUrl?: string;
  managementUrl?: string;
  /** 未提供时保留原有加密凭据。 */
  clientApiKey?: string;
  /** 未提供时保留原有加密凭据。 */
  managementKey?: string;
  enabled?: boolean;
  description?: string | null;
}

/** 对外响应形态，不包含任何凭据明文。 */
export interface CliproxyInstanceResponse {
  id: string;
  name: string;
  mode: CliproxyInstanceMode;
  baseUrl: string;
  managementUrl: string;
  hasClientApiKey: boolean;
  hasManagementKey: boolean;
  enabled: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 校验单个实例地址。受管 sidecar 模式仅校验 URL 格式与 http/https 协议，
 * 允许私有与内网地址；外部服务模式额外执行 SSRF 校验，拦截私有地址与云元数据端点。
 */
function validateInstanceAddress(
  label: string,
  urlString: string,
  mode: CliproxyInstanceMode
): void {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new InvalidCliproxyInstanceAddressError(`${label} 不是格式合法的 URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InvalidCliproxyInstanceAddressError(`${label} 协议必须为 http 或 https`);
  }

  if (mode === "external") {
    const result = isUrlSafe(urlString);
    if (!result.safe) {
      throw new InvalidCliproxyInstanceAddressError(
        `${label} 未通过地址安全校验：${result.reason ?? "地址不被允许"}`
      );
    }
  }
}

/** 同时校验代理转发地址与管理 API 地址。 */
function validateInstanceAddresses(
  baseUrl: string,
  managementUrl: string,
  mode: CliproxyInstanceMode
): void {
  validateInstanceAddress("代理转发地址", baseUrl, mode);
  validateInstanceAddress("管理 API 地址", managementUrl, mode);
}

function toCliproxyInstanceResponse(row: CliproxyInstance): CliproxyInstanceResponse {
  return {
    id: row.id,
    name: row.name,
    mode: row.mode as CliproxyInstanceMode,
    baseUrl: row.baseUrl,
    managementUrl: row.managementUrl,
    hasClientApiKey: row.clientApiKeyEncrypted.length > 0,
    hasManagementKey: row.managementKeyEncrypted.length > 0,
    enabled: row.enabled,
    description: row.description ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 列出全部 CLIProxyAPI 实例，按创建时间倒序。 */
export async function listCliproxyInstances(): Promise<CliproxyInstanceResponse[]> {
  const rows = await db.select().from(cliproxyInstances).orderBy(desc(cliproxyInstances.createdAt));
  return rows.map(toCliproxyInstanceResponse);
}

/** 查询指定实例，未找到返回 null。 */
export async function getCliproxyInstanceById(
  instanceId: string
): Promise<CliproxyInstanceResponse | null> {
  const row = await getCliproxyInstanceRow(instanceId);
  return row ? toCliproxyInstanceResponse(row) : null;
}

/** 查询指定实例的原始记录（含加密凭据），未找到返回 null。仅供内部使用。 */
export async function getCliproxyInstanceRow(instanceId: string): Promise<CliproxyInstance | null> {
  const [row] = await db
    .select()
    .from(cliproxyInstances)
    .where(eq(cliproxyInstances.id, instanceId))
    .limit(1);
  return row ?? null;
}

/** 创建 CLIProxyAPI 实例，凭据 Fernet 加密入库。 */
export async function createCliproxyInstance(
  input: CliproxyInstanceCreateInput
): Promise<CliproxyInstanceResponse> {
  const { name, mode, baseUrl, managementUrl, clientApiKey, managementKey } = input;
  const enabled = input.enabled ?? true;
  const description = input.description ?? null;

  if (!isCliproxyInstanceMode(mode)) {
    throw new InvalidCliproxyInstanceAddressError(`运行模式取值非法：${String(mode)}`);
  }
  validateInstanceAddresses(baseUrl, managementUrl, mode);

  const existing = await db
    .select({ id: cliproxyInstances.id })
    .from(cliproxyInstances)
    .where(eq(cliproxyInstances.name, name))
    .limit(1);
  if (existing.length > 0) {
    throw new CliproxyInstanceNameConflictError(name);
  }

  const now = new Date();
  const [row] = await db
    .insert(cliproxyInstances)
    .values({
      name,
      mode,
      baseUrl,
      managementUrl,
      clientApiKeyEncrypted: encrypt(clientApiKey),
      managementKeyEncrypted: encrypt(managementKey),
      enabled,
      description,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  log.info({ id: row.id, name, mode }, "created CLIProxyAPI instance");
  return toCliproxyInstanceResponse(row);
}

/** 更新 CLIProxyAPI 实例，未提交的凭据保留原有加密值。 */
export async function updateCliproxyInstance(
  instanceId: string,
  input: CliproxyInstanceUpdateInput
): Promise<CliproxyInstanceResponse> {
  const current = await getCliproxyInstanceRow(instanceId);
  if (!current) {
    throw new CliproxyInstanceNotFoundError(instanceId);
  }

  const mode = input.mode ?? (current.mode as CliproxyInstanceMode);
  if (!isCliproxyInstanceMode(mode)) {
    throw new InvalidCliproxyInstanceAddressError(`运行模式取值非法：${String(mode)}`);
  }
  const baseUrl = input.baseUrl ?? current.baseUrl;
  const managementUrl = input.managementUrl ?? current.managementUrl;
  validateInstanceAddresses(baseUrl, managementUrl, mode);

  if (input.name !== undefined && input.name !== current.name) {
    const conflict = await db
      .select({ id: cliproxyInstances.id })
      .from(cliproxyInstances)
      .where(eq(cliproxyInstances.name, input.name))
      .limit(1);
    if (conflict.length > 0) {
      throw new CliproxyInstanceNameConflictError(input.name);
    }
  }

  const updateValues: Partial<typeof cliproxyInstances.$inferInsert> = {
    name: input.name ?? current.name,
    mode,
    baseUrl,
    managementUrl,
    enabled: input.enabled ?? current.enabled,
    description: input.description !== undefined ? input.description : current.description,
    updatedAt: new Date(),
  };
  // 未提交的凭据保持原有加密值不变。
  if (input.clientApiKey !== undefined) {
    updateValues.clientApiKeyEncrypted = encrypt(input.clientApiKey);
  }
  if (input.managementKey !== undefined) {
    updateValues.managementKeyEncrypted = encrypt(input.managementKey);
  }

  const [row] = await db
    .update(cliproxyInstances)
    .set(updateValues)
    .where(eq(cliproxyInstances.id, instanceId))
    .returning();

  log.info({ id: instanceId }, "updated CLIProxyAPI instance");
  return toCliproxyInstanceResponse(row);
}

/**
 * 删除 CLIProxyAPI 实例。
 *
 * 后续变更会让 OAuth 账号缓存表与上游表引用本表，届时需在此处补充删除前
 * 引用校验。当前变更尚无引用方，直接允许删除。
 */
export async function deleteCliproxyInstance(instanceId: string): Promise<void> {
  const current = await getCliproxyInstanceRow(instanceId);
  if (!current) {
    throw new CliproxyInstanceNotFoundError(instanceId);
  }

  // 引用校验扩展点：后续变更在此检查 cliproxy_auth_accounts 与 upstreams 引用。

  await db.delete(cliproxyInstances).where(eq(cliproxyInstances.id, instanceId));
  log.info({ id: instanceId }, "deleted CLIProxyAPI instance");
}

/** 解密客户端 API Key，仅供请求转发场景在内存中按需调用。 */
export function getDecryptedClientApiKey(row: CliproxyInstance): string {
  return decrypt(row.clientApiKeyEncrypted);
}

/** 解密管理 API 密钥，仅供连通性检测与管理调用在内存中按需调用。 */
export function getDecryptedManagementKey(row: CliproxyInstance): string {
  return decrypt(row.managementKeyEncrypted);
}
