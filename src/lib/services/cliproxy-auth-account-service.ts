import { eq, and } from "drizzle-orm";
import { db, cliproxyAuthAccounts, type CliproxyAuthAccount } from "../db";
import {
  getCliproxyInstanceRow,
  getDecryptedManagementKey,
  CliproxyInstanceNotFoundError,
} from "./cliproxy-instance-crud";
import {
  listAuthFiles,
  getAuthFileModels,
  patchAuthFileStatus,
  patchAuthFileFields,
  type CliproxyAuthFileEntry,
  type CliproxyManagementTarget,
} from "./cliproxy-management-client";
import { createLogger } from "../utils/logger";

const log = createLogger("cliproxy-auth-account-service");

/** auth-files 条目中允许进入缓存快照的非敏感字段白名单。 */
const RAW_METADATA_WHITELIST = [
  "name",
  "type",
  "provider",
  "label",
  "status",
  "status_message",
  "disabled",
  "unavailable",
  "priority",
  "email",
  "account_type",
  "project_id",
  "source",
] as const;

/** 账号不存在错误。 */
export class CliproxyAuthAccountNotFoundError extends Error {
  constructor(instanceId: string, authFileName: string) {
    super(`CLIProxyAPI auth account not found: ${authFileName} (instance ${instanceId})`);
    this.name = "CliproxyAuthAccountNotFoundError";
  }
}

/** 账号同步结果。 */
export interface CliproxyAuthAccountSyncResult {
  added: number;
  updated: number;
  removed: number;
  total: number;
}

/** 账号字段更新输入。 */
export interface CliproxyAuthAccountFieldsInput {
  prefix?: string;
  proxyUrl?: string;
  priority?: number;
  note?: string;
}

/**
 * 将 CLIProxyAPI 的 provider/type 字段归一化为 codex / anthropic / gemini，
 * 无法识别时返回原始 provider 文本或 type 文本。
 */
function normalizeProvider(entry: CliproxyAuthFileEntry): string {
  const raw = `${entry.provider ?? ""} ${entry.type ?? ""} ${entry.name ?? ""}`.toLowerCase();
  if (raw.includes("codex") || raw.includes("openai")) return "codex";
  if (raw.includes("claude") || raw.includes("anthropic")) return "anthropic";
  if (raw.includes("gemini") || raw.includes("google")) return "gemini";
  return (entry.provider || entry.type || "unknown").toString();
}

/** 从 auth-files 条目中按白名单裁剪出非敏感快照。 */
function buildRawMetadata(entry: CliproxyAuthFileEntry): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const key of RAW_METADATA_WHITELIST) {
    if (entry[key] !== undefined) {
      snapshot[key] = entry[key];
    }
  }
  return snapshot;
}

/** 构造管理 API 调用目标。 */
async function resolveManagementTarget(instanceId: string): Promise<CliproxyManagementTarget> {
  const instance = await getCliproxyInstanceRow(instanceId);
  if (!instance) {
    throw new CliproxyInstanceNotFoundError(instanceId);
  }
  return {
    managementUrl: instance.managementUrl,
    managementKey: getDecryptedManagementKey(instance),
  };
}

/** 列出某实例下缓存的 OAuth 账号。 */
export async function listCliproxyAuthAccounts(instanceId: string): Promise<CliproxyAuthAccount[]> {
  return db
    .select()
    .from(cliproxyAuthAccounts)
    .where(eq(cliproxyAuthAccounts.instanceId, instanceId));
}

/** 查询某实例下指定账号的缓存记录，未找到返回 null。 */
export async function getCliproxyAuthAccount(
  instanceId: string,
  authFileName: string
): Promise<CliproxyAuthAccount | null> {
  const [row] = await db
    .select()
    .from(cliproxyAuthAccounts)
    .where(
      and(
        eq(cliproxyAuthAccounts.instanceId, instanceId),
        eq(cliproxyAuthAccounts.authFileName, authFileName)
      )
    )
    .limit(1);
  return row ?? null;
}

/**
 * 同步某 CLIProxyAPI 实例的 OAuth 账号。
 *
 * 从 CLIProxyAPI 拉取 auth-files，按 `(实例, 账号文件名)` upsert 到缓存表，
 * 并移除 CLIProxyAPI 侧已不存在的本地缓存条目。单个账号模型查询失败不中断同步。
 */
export async function syncCliproxyAuthAccounts(
  instanceId: string
): Promise<CliproxyAuthAccountSyncResult> {
  const target = await resolveManagementTarget(instanceId);
  const files = await listAuthFiles(target);

  const existing = await listCliproxyAuthAccounts(instanceId);
  const existingByName = new Map(existing.map((row) => [row.authFileName, row]));

  let added = 0;
  let updated = 0;
  const now = new Date();

  for (const entry of files) {
    const authFileName = entry.name;
    if (!authFileName) {
      continue;
    }
    const prior = existingByName.get(authFileName);

    // 模型数量为非关键字段，查询失败时回退到上次值或 0，不中断整体同步。
    let modelCount = prior?.modelCount ?? 0;
    try {
      const models = await getAuthFileModels(target, authFileName);
      modelCount = models.length;
    } catch (err) {
      log.warn(
        { instanceId, authFileName, err: err instanceof Error ? err.message : String(err) },
        "failed to query auth-file models during sync"
      );
    }

    const values = {
      instanceId,
      authFileName,
      provider: normalizeProvider(entry),
      email: entry.email ?? null,
      status: entry.status ?? null,
      disabled: entry.disabled ?? false,
      // prefix / priority / note 由账号字段管理写入，同步时仅在条目提供时更新。
      prefix: entry.prefix ?? prior?.prefix ?? null,
      priority: entry.priority ?? prior?.priority ?? null,
      note: entry.note ?? prior?.note ?? null,
      modelCount,
      rawMetadata: buildRawMetadata(entry),
      lastSyncedAt: now,
      updatedAt: now,
    };

    if (prior) {
      await db
        .update(cliproxyAuthAccounts)
        .set(values)
        .where(eq(cliproxyAuthAccounts.id, prior.id));
      updated += 1;
    } else {
      await db.insert(cliproxyAuthAccounts).values({ ...values, createdAt: now });
      added += 1;
    }
  }

  // 移除 CLIProxyAPI 侧已不存在的本地缓存条目。
  const liveNames = new Set(files.map((entry) => entry.name).filter(Boolean));
  let removed = 0;
  for (const row of existing) {
    if (!liveNames.has(row.authFileName)) {
      await db.delete(cliproxyAuthAccounts).where(eq(cliproxyAuthAccounts.id, row.id));
      removed += 1;
    }
  }

  log.info({ instanceId, added, updated, removed }, "synced CLIProxyAPI auth accounts");
  return { added, updated, removed, total: files.length };
}

/** 启停某个 OAuth 账号：先调用 CLIProxyAPI，再更新本地缓存。 */
export async function setCliproxyAuthAccountStatus(
  instanceId: string,
  authFileName: string,
  disabled: boolean
): Promise<CliproxyAuthAccount> {
  const target = await resolveManagementTarget(instanceId);
  const account = await getCliproxyAuthAccount(instanceId, authFileName);
  if (!account) {
    throw new CliproxyAuthAccountNotFoundError(instanceId, authFileName);
  }

  await patchAuthFileStatus(target, authFileName, disabled);

  const [row] = await db
    .update(cliproxyAuthAccounts)
    .set({ disabled, updatedAt: new Date() })
    .where(eq(cliproxyAuthAccounts.id, account.id))
    .returning();
  log.info({ instanceId, authFileName, disabled }, "updated CLIProxyAPI auth account status");
  return row;
}

/** 更新某个 OAuth 账号的字段：先调用 CLIProxyAPI，再更新本地缓存。 */
export async function updateCliproxyAuthAccountFields(
  instanceId: string,
  authFileName: string,
  fields: CliproxyAuthAccountFieldsInput
): Promise<CliproxyAuthAccount> {
  const target = await resolveManagementTarget(instanceId);
  const account = await getCliproxyAuthAccount(instanceId, authFileName);
  if (!account) {
    throw new CliproxyAuthAccountNotFoundError(instanceId, authFileName);
  }

  await patchAuthFileFields(target, {
    name: authFileName,
    prefix: fields.prefix,
    proxy_url: fields.proxyUrl,
    priority: fields.priority,
    note: fields.note,
  });

  // proxy_url 为 CLIProxyAPI 侧设置，不进入本地缓存。
  const cacheUpdate: Partial<typeof cliproxyAuthAccounts.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (fields.prefix !== undefined) cacheUpdate.prefix = fields.prefix;
  if (fields.priority !== undefined) cacheUpdate.priority = fields.priority;
  if (fields.note !== undefined) cacheUpdate.note = fields.note;

  const [row] = await db
    .update(cliproxyAuthAccounts)
    .set(cacheUpdate)
    .where(eq(cliproxyAuthAccounts.id, account.id))
    .returning();
  log.info({ instanceId, authFileName }, "updated CLIProxyAPI auth account fields");
  return row;
}
