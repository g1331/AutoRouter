import { eq, desc, inArray, count } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db, apiKeys, apiKeyUpstreams, upstreams, type ApiKey } from "../db";
import { hashApiKey, verifyApiKey } from "../utils/auth";
import { encrypt, decrypt, EncryptionError } from "../utils/encryption";
import { createLogger } from "../utils/logger";
import { apiKeyQuotaTracker } from "@/lib/services/api-key-quota-tracker";
import { parseSpendingRules } from "@/lib/services/spending-rules";
import { normalizeApiKeyAllowedModels } from "@/lib/api-key-models";
import type { SpendingRule } from "@/lib/services/upstream-quota-tracker";

const log = createLogger("key-manager");

export type ApiKeyAccessMode = "unrestricted" | "restricted";

/**
 * Raised when an API key lookup cannot find a persisted key record.
 */
export class ApiKeyNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiKeyNotFoundError";
  }
}

/**
 * Raised when an operation encounters a legacy API key without recoverable plaintext.
 */
export class LegacyApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegacyApiKeyError";
  }
}

export interface ApiKeyCreateInput {
  name: string;
  upstreamIds: string[];
  accessMode?: ApiKeyAccessMode;
  description?: string | null;
  expiresAt?: Date | null;
  spendingRules?: SpendingRule[] | null;
  allowedModels?: string[] | null;
}

export interface ApiKeySpendingRuleStatus {
  periodType: SpendingRule["period_type"];
  periodHours: number | null;
  currentSpending: number;
  spendingLimit: number;
  percentUsed: number;
  isExceeded: boolean;
  resetsAt: Date | null;
  estimatedRecoveryAt: Date | null;
}

export interface ApiKeyCreateResult {
  id: string;
  keyValue: string; // Full key - only returned on creation
  keyPrefix: string;
  name: string;
  description: string | null;
  accessMode: ApiKeyAccessMode;
  upstreamIds: string[];
  allowedModels: string[] | null;
  spendingRules: SpendingRule[] | null;
  spendingRuleStatuses: ApiKeySpendingRuleStatus[];
  isQuotaExceeded: boolean;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKeyListItem {
  id: string;
  keyPrefix: string;
  name: string;
  description: string | null;
  accessMode: ApiKeyAccessMode;
  upstreamIds: string[];
  allowedModels: string[] | null;
  spendingRules: SpendingRule[] | null;
  spendingRuleStatuses: ApiKeySpendingRuleStatus[];
  isQuotaExceeded: boolean;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedApiKeys {
  items: ApiKeyListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiKeyRevealResult {
  id: string;
  keyValue: string;
  keyPrefix: string;
  name: string;
}

export interface ApiKeyUpdateInput {
  name?: string;
  description?: string | null;
  isActive?: boolean;
  accessMode?: ApiKeyAccessMode;
  expiresAt?: Date | null;
  upstreamIds?: string[];
  spendingRules?: SpendingRule[] | null;
  allowedModels?: string[] | null;
}

function normalizeAccessMode(
  accessMode: string | null | undefined,
  upstreamIds: string[]
): ApiKeyAccessMode {
  if (accessMode === "restricted" || accessMode === "unrestricted") {
    return accessMode;
  }

  return upstreamIds.length > 0 ? "restricted" : "unrestricted";
}

function buildFallbackQuotaState(spendingRules: SpendingRule[] | null): {
  spendingRuleStatuses: ApiKeySpendingRuleStatus[];
  isQuotaExceeded: boolean;
} {
  return {
    spendingRuleStatuses:
      spendingRules?.map((rule) => ({
        periodType: rule.period_type,
        periodHours: rule.period_hours ?? null,
        currentSpending: 0,
        spendingLimit: rule.limit,
        percentUsed: 0,
        isExceeded: false,
        resetsAt: null,
        estimatedRecoveryAt: null,
      })) ?? [],
    isQuotaExceeded: false,
  };
}

async function syncApiKeyQuotaStateBestEffort(
  apiKeyId: string,
  apiKeyName: string,
  spendingRules: SpendingRule[] | null
): Promise<void> {
  try {
    await apiKeyQuotaTracker.syncApiKeyFromDb(apiKeyId, apiKeyName, spendingRules);
  } catch (error) {
    log.error(
      { err: error, apiKeyId, apiKeyName },
      "failed to sync API key quota tracker after persisted mutation"
    );
  }
}

async function resolveSpendingRuleStatuses(
  apiKeyId: string,
  spendingRules: SpendingRule[] | null
): Promise<{
  spendingRuleStatuses: ApiKeySpendingRuleStatus[];
  isQuotaExceeded: boolean;
}> {
  if (!spendingRules || spendingRules.length === 0) {
    return buildFallbackQuotaState(spendingRules);
  }

  try {
    await apiKeyQuotaTracker.initialize();
    const status = apiKeyQuotaTracker.getQuotaStatus(apiKeyId);
    if (!status) {
      return buildFallbackQuotaState(spendingRules);
    }

    const spendingRuleStatuses = await Promise.all(
      status.rules.map(async (rule) => ({
        periodType: rule.periodType,
        periodHours: rule.periodHours,
        currentSpending: rule.currentSpending,
        spendingLimit: rule.spendingLimit,
        percentUsed: rule.percentUsed,
        isExceeded: rule.isExceeded,
        resetsAt: rule.resetsAt,
        estimatedRecoveryAt:
          rule.periodType === "rolling" && rule.isExceeded
            ? await apiKeyQuotaTracker.estimateRecoveryTime(apiKeyId, {
                period_type: "rolling",
                limit: rule.spendingLimit,
                ...(rule.periodHours != null ? { period_hours: rule.periodHours } : {}),
              })
            : null,
      }))
    );

    return {
      spendingRuleStatuses,
      isQuotaExceeded: status.isExceeded,
    };
  } catch (error) {
    log.error({ err: error, apiKeyId }, "failed to resolve API key quota statuses");
    return buildFallbackQuotaState(spendingRules);
  }
}

async function buildApiKeyListItem(
  key: Pick<
    ApiKey,
    | "id"
    | "keyPrefix"
    | "name"
    | "description"
    | "accessMode"
    | "allowedModels"
    | "spendingRules"
    | "isActive"
    | "expiresAt"
    | "createdAt"
    | "updatedAt"
  >,
  upstreamIds: string[]
): Promise<ApiKeyListItem> {
  const accessMode = normalizeAccessMode(key.accessMode, upstreamIds);
  const spendingRules = parseSpendingRules(key.spendingRules);
  const quotaState = await resolveSpendingRuleStatuses(key.id, spendingRules);

  return {
    id: key.id,
    keyPrefix: key.keyPrefix,
    name: key.name,
    description: key.description,
    accessMode,
    upstreamIds: accessMode === "restricted" ? upstreamIds : [],
    allowedModels: normalizeApiKeyAllowedModels(key.allowedModels),
    spendingRules,
    spendingRuleStatuses: quotaState.spendingRuleStatuses,
    isQuotaExceeded: quotaState.isQuotaExceeded,
    isActive: key.isActive,
    expiresAt: key.expiresAt,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  };
}

/**
 * Generate a random API key using the `sk-auto-[base64-random]` format.
 */
export function generateApiKey(): string {
  const randomPart = randomBytes(32).toString("base64url");
  return `sk-auto-${randomPart}`;
}

/**
 * Create a new API key with permissions for specified upstreams.
 */
export async function createApiKey(input: ApiKeyCreateInput): Promise<ApiKeyCreateResult> {
  const { name, upstreamIds, accessMode, description, expiresAt } = input;
  const normalizedUpstreamIds = Array.from(new Set(upstreamIds));
  const normalizedAccessMode = normalizeAccessMode(accessMode, normalizedUpstreamIds);
  const spendingRules = parseSpendingRules(input.spendingRules);
  const allowedModels = normalizeApiKeyAllowedModels(input.allowedModels);

  if (normalizedAccessMode === "restricted" && normalizedUpstreamIds.length === 0) {
    throw new Error("At least one upstream must be specified");
  }

  if (normalizedAccessMode === "restricted") {
    const validUpstreams = await db.query.upstreams.findMany({
      where: inArray(upstreams.id, normalizedUpstreamIds),
    });

    if (validUpstreams.length !== normalizedUpstreamIds.length) {
      const validIds = new Set(validUpstreams.map((u) => u.id));
      const invalidIds = normalizedUpstreamIds.filter((id) => !validIds.has(id));
      throw new Error(`Invalid upstream IDs: ${invalidIds.join(", ")}`);
    }
  }

  // Generate API key
  const keyValue = generateApiKey();
  const keyPrefix = keyValue.slice(0, 12); // 'sk-auto-xxxx'

  // Hash the key with bcrypt
  const keyHash = await hashApiKey(keyValue);

  // Encrypt the key with Fernet (for reveal functionality)
  const keyValueEncrypted = encrypt(keyValue);

  const now = new Date();

  // Create API key record
  const [newKey] = await db
    .insert(apiKeys)
    .values({
      keyHash,
      keyValueEncrypted,
      keyPrefix,
      name,
      description: description ?? null,
      accessMode: normalizedAccessMode,
      allowedModels,
      spendingRules,
      isActive: true,
      expiresAt: expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  // Create permission entries in join table
  if (normalizedAccessMode === "restricted" && normalizedUpstreamIds.length > 0) {
    await db.insert(apiKeyUpstreams).values(
      normalizedUpstreamIds.map((upstreamId) => ({
        apiKeyId: newKey.id,
        upstreamId,
        createdAt: now,
      }))
    );
  }

  log.info(
    {
      keyPrefix,
      name,
      accessMode: normalizedAccessMode,
      upstreams: normalizedUpstreamIds.length,
      allowedModels: allowedModels?.length ?? 0,
      spendingRules: spendingRules?.length ?? 0,
    },
    "created API key"
  );

  await syncApiKeyQuotaStateBestEffort(newKey.id, newKey.name, spendingRules);
  const quotaState = await resolveSpendingRuleStatuses(newKey.id, spendingRules);

  return {
    id: newKey.id,
    keyValue, // Full key - ONLY returned here
    keyPrefix: newKey.keyPrefix,
    name: newKey.name,
    description: newKey.description,
    accessMode: normalizeAccessMode(newKey.accessMode, normalizedUpstreamIds),
    upstreamIds: normalizedAccessMode === "restricted" ? normalizedUpstreamIds : [],
    allowedModels: normalizeApiKeyAllowedModels(newKey.allowedModels),
    spendingRules,
    spendingRuleStatuses: quotaState.spendingRuleStatuses,
    isQuotaExceeded: quotaState.isQuotaExceeded,
    isActive: newKey.isActive,
    expiresAt: newKey.expiresAt,
    createdAt: newKey.createdAt,
    updatedAt: newKey.updatedAt,
  };
}

/**
 * Delete an API key from the database.
 */
export async function deleteApiKey(keyId: string): Promise<void> {
  const existing = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.id, keyId),
  });

  if (!existing) {
    throw new ApiKeyNotFoundError(`API key not found: ${keyId}`);
  }

  await db.delete(apiKeys).where(eq(apiKeys.id, keyId));
  await syncApiKeyQuotaStateBestEffort(keyId, existing.name, null);

  log.info({ keyPrefix: existing.keyPrefix, name: existing.name }, "deleted API key");
}

/**
 * List all API keys with pagination.
 */
export async function listApiKeys(
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedApiKeys> {
  // Validate pagination params
  page = Math.max(1, page);
  pageSize = Math.min(100, Math.max(1, pageSize));

  // Count total keys
  const [{ value: total }] = await db.select({ value: count() }).from(apiKeys);

  // Query paginated results (ordered by created_at desc)
  const offset = (page - 1) * pageSize;
  const keys = await db.query.apiKeys.findMany({
    orderBy: [desc(apiKeys.createdAt)],
    limit: pageSize,
    offset,
  });
  await apiKeyQuotaTracker.initialize();

  // For each API key, fetch authorized upstream IDs
  const items: ApiKeyListItem[] = await Promise.all(
    keys.map(async (key) => {
      const upstreamLinks = await db.query.apiKeyUpstreams.findMany({
        where: eq(apiKeyUpstreams.apiKeyId, key.id),
      });
      const upstreamIds = upstreamLinks.map((link) => link.upstreamId);
      return buildApiKeyListItem(key, upstreamIds);
    })
  );

  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Reveal the full decrypted API key value.
 */
export async function revealApiKey(keyId: string): Promise<ApiKeyRevealResult> {
  const apiKey = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.id, keyId),
  });

  if (!apiKey) {
    throw new ApiKeyNotFoundError(`API key not found: ${keyId}`);
  }

  if (!apiKey.keyValueEncrypted) {
    throw new LegacyApiKeyError(
      `Legacy API key cannot be revealed (key_prefix=${apiKey.keyPrefix}). ` +
        "Please regenerate this key to enable reveal functionality."
    );
  }

  const decryptedKey = decrypt(apiKey.keyValueEncrypted);

  // Verify decrypted key matches stored hash
  const isValid = await verifyApiKey(decryptedKey, apiKey.keyHash);
  if (!isValid) {
    throw new EncryptionError("Decrypted API key does not match stored hash");
  }

  // Note: Intentionally not logging key details to avoid security warnings

  return {
    id: apiKey.id,
    keyValue: decryptedKey,
    keyPrefix: apiKey.keyPrefix,
    name: apiKey.name,
  };
}

/**
 * Get API key by ID.
 */
export async function getApiKeyById(keyId: string): Promise<ApiKeyListItem | null> {
  const apiKey = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.id, keyId),
  });

  if (!apiKey) {
    return null;
  }

  const upstreamLinks = await db.query.apiKeyUpstreams.findMany({
    where: eq(apiKeyUpstreams.apiKeyId, apiKey.id),
  });
  const upstreamIds = upstreamLinks.map((link) => link.upstreamId);
  await apiKeyQuotaTracker.initialize();
  return buildApiKeyListItem(apiKey, upstreamIds);
}

/**
 * Find API key by prefix and verify with bcrypt.
 * Used for authentication.
 */
export async function findAndVerifyApiKey(keyValue: string): Promise<ApiKey | null> {
  const keyPrefix = keyValue.slice(0, 12);

  // Find candidates by prefix
  const candidates = await db.query.apiKeys.findMany({
    where: eq(apiKeys.keyPrefix, keyPrefix),
  });

  // Verify with bcrypt (constant-time comparison)
  for (const candidate of candidates) {
    try {
      const isValid = await verifyApiKey(keyValue, candidate.keyHash);
      if (isValid) {
        // Check if key has expired
        if (candidate.expiresAt && candidate.expiresAt <= new Date()) {
          return null;
        }
        return candidate;
      }
    } catch {
      log.warn({ keyPrefix: candidate.keyPrefix }, "bcrypt verification failed");
    }
  }

  return null;
}

/**
 * Update an existing API key.
 */
export async function updateApiKey(
  keyId: string,
  input: ApiKeyUpdateInput
): Promise<ApiKeyListItem> {
  const { name, description, isActive, accessMode, expiresAt, upstreamIds } = input;
  const now = new Date();
  const parsedSpendingRules =
    input.spendingRules !== undefined ? parseSpendingRules(input.spendingRules) : undefined;
  const parsedAllowedModels =
    input.allowedModels !== undefined
      ? normalizeApiKeyAllowedModels(input.allowedModels)
      : undefined;

  const updatedResult = await db.transaction(async (tx) => {
    // Check if key exists
    const existing = await tx.query.apiKeys.findFirst({
      where: eq(apiKeys.id, keyId),
    });

    if (!existing) {
      throw new ApiKeyNotFoundError(`API key not found: ${keyId}`);
    }

    const existingLinks =
      (await tx.query.apiKeyUpstreams.findMany({
        where: eq(apiKeyUpstreams.apiKeyId, keyId),
      })) ?? [];
    const existingUpstreamIds = existingLinks.map((link) => link.upstreamId);
    const currentAccessMode = normalizeAccessMode(existing.accessMode, existingUpstreamIds);
    const shouldUpdateAccess = upstreamIds !== undefined || accessMode !== undefined;
    const nextAccessMode =
      accessMode !== undefined
        ? accessMode
        : upstreamIds !== undefined
          ? "restricted"
          : currentAccessMode;
    let normalizedUpstreamIds: string[] | undefined;

    if (shouldUpdateAccess && upstreamIds !== undefined) {
      normalizedUpstreamIds = Array.from(new Set(upstreamIds));
    }

    if (shouldUpdateAccess && nextAccessMode === "restricted") {
      const idsToValidate = normalizedUpstreamIds ?? existingUpstreamIds;

      if (idsToValidate.length === 0) {
        throw new Error("At least one upstream must be specified");
      }

      const validUpstreams = await tx.query.upstreams.findMany({
        where: inArray(upstreams.id, idsToValidate),
      });

      if (validUpstreams.length !== idsToValidate.length) {
        const validIds = new Set(validUpstreams.map((u) => u.id));
        const invalidIds = idsToValidate.filter((id) => !validIds.has(id));
        throw new Error(`Invalid upstream IDs: ${invalidIds.join(", ")}`);
      }

      normalizedUpstreamIds = idsToValidate;
    }

    // Build update object with only provided fields
    const updateData: Partial<{
      name: string;
      description: string | null;
      isActive: boolean;
      accessMode: ApiKeyAccessMode;
      allowedModels: string[] | null;
      expiresAt: Date | null;
      spendingRules:
        | { period_type: "daily" | "monthly" | "rolling"; limit: number; period_hours?: number }[]
        | null;
      updatedAt: Date;
    }> = { updatedAt: now };

    if (name !== undefined) {
      updateData.name = name;
    }
    if (description !== undefined) {
      updateData.description = description;
    }
    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }
    if (shouldUpdateAccess) {
      updateData.accessMode = nextAccessMode;
    }
    if (parsedAllowedModels !== undefined) {
      updateData.allowedModels = parsedAllowedModels;
    }
    if (expiresAt !== undefined) {
      updateData.expiresAt = expiresAt;
    }
    if (parsedSpendingRules !== undefined) {
      updateData.spendingRules = parsedSpendingRules;
    }

    // Update the API key record
    const [updatedKey] = await tx
      .update(apiKeys)
      .set(updateData)
      .where(eq(apiKeys.id, keyId))
      .returning();

    // Key could be deleted concurrently between the existence check and update
    if (!updatedKey) {
      throw new ApiKeyNotFoundError(`API key not found: ${keyId}`);
    }

    let currentUpstreamIds = currentAccessMode === "restricted" ? existingUpstreamIds : [];

    if (shouldUpdateAccess) {
      if (nextAccessMode === "unrestricted") {
        if (existingUpstreamIds.length > 0) {
          await tx.delete(apiKeyUpstreams).where(eq(apiKeyUpstreams.apiKeyId, keyId));
        }
        currentUpstreamIds = [];
      } else if (normalizedUpstreamIds) {
        const existingSet = new Set(existingUpstreamIds);
        const isSame =
          existingUpstreamIds.length === normalizedUpstreamIds.length &&
          normalizedUpstreamIds.every((id) => existingSet.has(id));

        if (!isSame) {
          await tx.delete(apiKeyUpstreams).where(eq(apiKeyUpstreams.apiKeyId, keyId));

          await tx.insert(apiKeyUpstreams).values(
            normalizedUpstreamIds.map((upstreamId) => ({
              apiKeyId: keyId,
              upstreamId,
              createdAt: now,
            }))
          );
        }

        currentUpstreamIds = normalizedUpstreamIds;
      }
    }

    log.info(
      {
        keyPrefix: updatedKey.keyPrefix,
        name: updatedKey.name,
        allowedModels:
          parsedAllowedModels !== undefined
            ? (parsedAllowedModels?.length ?? 0)
            : (existing.allowedModels?.length ?? 0),
        spendingRules:
          parsedSpendingRules !== undefined
            ? (parsedSpendingRules?.length ?? 0)
            : (existing.spendingRules?.length ?? 0),
      },
      "updated API key"
    );

    const resolvedAccessMode = normalizeAccessMode(updatedKey.accessMode, currentUpstreamIds);

    return {
      id: updatedKey.id,
      keyPrefix: updatedKey.keyPrefix,
      name: updatedKey.name,
      description: updatedKey.description,
      accessMode: resolvedAccessMode,
      upstreamIds: resolvedAccessMode === "restricted" ? currentUpstreamIds : [],
      allowedModels: normalizeApiKeyAllowedModels(updatedKey.allowedModels),
      spendingRules: parseSpendingRules(updatedKey.spendingRules),
      isActive: updatedKey.isActive,
      expiresAt: updatedKey.expiresAt,
      createdAt: updatedKey.createdAt,
      updatedAt: updatedKey.updatedAt,
    };
  });

  await syncApiKeyQuotaStateBestEffort(
    updatedResult.id,
    updatedResult.name,
    updatedResult.spendingRules
  );

  return buildApiKeyListItem(
    {
      id: updatedResult.id,
      keyPrefix: updatedResult.keyPrefix,
      name: updatedResult.name,
      description: updatedResult.description,
      accessMode: updatedResult.accessMode,
      allowedModels: updatedResult.allowedModels,
      spendingRules: updatedResult.spendingRules,
      isActive: updatedResult.isActive,
      expiresAt: updatedResult.expiresAt,
      createdAt: updatedResult.createdAt,
      updatedAt: updatedResult.updatedAt,
    },
    updatedResult.upstreamIds
  );
}
