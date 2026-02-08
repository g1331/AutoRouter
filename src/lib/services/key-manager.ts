import { eq, desc, inArray, count } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db, apiKeys, apiKeyUpstreams, upstreams, type ApiKey } from "../db";
import { hashApiKey, verifyApiKey } from "../utils/auth";
import { encrypt, decrypt, EncryptionError } from "../utils/encryption";
import { createLogger } from "../utils/logger";

const log = createLogger("key-manager");

export class ApiKeyNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiKeyNotFoundError";
  }
}

export class LegacyApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegacyApiKeyError";
  }
}

export interface ApiKeyCreateInput {
  name: string;
  upstreamIds: string[];
  description?: string | null;
  expiresAt?: Date | null;
}

export interface ApiKeyCreateResult {
  id: string;
  keyValue: string; // Full key - only returned on creation
  keyPrefix: string;
  name: string;
  description: string | null;
  upstreamIds: string[];
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
  upstreamIds: string[];
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
  expiresAt?: Date | null;
  upstreamIds?: string[];
}

/**
 * Generate a random API key with format: sk-auto-{base64-random}
 */
export function generateApiKey(): string {
  const randomPart = randomBytes(32).toString("base64url");
  return `sk-auto-${randomPart}`;
}

/**
 * Create a new API key with permissions for specified upstreams.
 */
export async function createApiKey(input: ApiKeyCreateInput): Promise<ApiKeyCreateResult> {
  const { name, upstreamIds, description, expiresAt } = input;

  if (!upstreamIds.length) {
    throw new Error("At least one upstream must be specified");
  }

  // Validate all upstreams exist
  const validUpstreams = await db.query.upstreams.findMany({
    where: inArray(upstreams.id, upstreamIds),
  });

  if (validUpstreams.length !== upstreamIds.length) {
    const validIds = new Set(validUpstreams.map((u) => u.id));
    const invalidIds = upstreamIds.filter((id) => !validIds.has(id));
    throw new Error(`Invalid upstream IDs: ${invalidIds.join(", ")}`);
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
      isActive: true,
      expiresAt: expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  // Create permission entries in join table
  if (upstreamIds.length > 0) {
    await db.insert(apiKeyUpstreams).values(
      upstreamIds.map((upstreamId) => ({
        apiKeyId: newKey.id,
        upstreamId,
        createdAt: now,
      }))
    );
  }

  log.info({ keyPrefix, name, upstreams: upstreamIds.length }, "created API key");

  return {
    id: newKey.id,
    keyValue, // Full key - ONLY returned here
    keyPrefix: newKey.keyPrefix,
    name: newKey.name,
    description: newKey.description,
    upstreamIds,
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

  // For each API key, fetch authorized upstream IDs
  const items: ApiKeyListItem[] = await Promise.all(
    keys.map(async (key) => {
      const upstreamLinks = await db.query.apiKeyUpstreams.findMany({
        where: eq(apiKeyUpstreams.apiKeyId, key.id),
      });
      const upstreamIds = upstreamLinks.map((link) => link.upstreamId);

      return {
        id: key.id,
        keyPrefix: key.keyPrefix,
        name: key.name,
        description: key.description,
        upstreamIds,
        isActive: key.isActive,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
      };
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

  return {
    id: apiKey.id,
    keyPrefix: apiKey.keyPrefix,
    name: apiKey.name,
    description: apiKey.description,
    upstreamIds,
    isActive: apiKey.isActive,
    expiresAt: apiKey.expiresAt,
    createdAt: apiKey.createdAt,
    updatedAt: apiKey.updatedAt,
  };
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
  const { name, description, isActive, expiresAt, upstreamIds } = input;
  const now = new Date();

  return db.transaction(async (tx) => {
    // Check if key exists
    const existing = await tx.query.apiKeys.findFirst({
      where: eq(apiKeys.id, keyId),
    });

    if (!existing) {
      throw new ApiKeyNotFoundError(`API key not found: ${keyId}`);
    }

    let normalizedUpstreamIds: string[] | undefined;

    // If upstreamIds provided, validate them (and guard against duplicates)
    if (upstreamIds !== undefined) {
      normalizedUpstreamIds = Array.from(new Set(upstreamIds));

      if (normalizedUpstreamIds.length === 0) {
        throw new Error("At least one upstream must be specified");
      }

      const validUpstreams = await tx.query.upstreams.findMany({
        where: inArray(upstreams.id, normalizedUpstreamIds),
      });

      if (validUpstreams.length !== normalizedUpstreamIds.length) {
        const validIds = new Set(validUpstreams.map((u) => u.id));
        const invalidIds = normalizedUpstreamIds.filter((id) => !validIds.has(id));
        throw new Error(`Invalid upstream IDs: ${invalidIds.join(", ")}`);
      }
    }

    // Build update object with only provided fields
    const updateData: Partial<{
      name: string;
      description: string | null;
      isActive: boolean;
      expiresAt: Date | null;
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
    if (expiresAt !== undefined) {
      updateData.expiresAt = expiresAt;
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

    let currentUpstreamIds: string[];

    if (normalizedUpstreamIds !== undefined) {
      // Avoid churning join-table rows (and their createdAt) if upstreamIds didn't actually change.
      const existingLinks = await tx.query.apiKeyUpstreams.findMany({
        where: eq(apiKeyUpstreams.apiKeyId, keyId),
      });
      const existingIds = existingLinks.map((link) => link.upstreamId);
      const existingSet = new Set(existingIds);
      const isSame =
        existingIds.length === normalizedUpstreamIds.length &&
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

        currentUpstreamIds = normalizedUpstreamIds;
      } else {
        currentUpstreamIds = existingIds;
      }
    } else {
      const upstreamLinks = await tx.query.apiKeyUpstreams.findMany({
        where: eq(apiKeyUpstreams.apiKeyId, keyId),
      });
      currentUpstreamIds = upstreamLinks.map((link) => link.upstreamId);
    }

    log.info({ keyPrefix: updatedKey.keyPrefix, name: updatedKey.name }, "updated API key");

    return {
      id: updatedKey.id,
      keyPrefix: updatedKey.keyPrefix,
      name: updatedKey.name,
      description: updatedKey.description,
      upstreamIds: currentUpstreamIds,
      isActive: updatedKey.isActive,
      expiresAt: updatedKey.expiresAt,
      createdAt: updatedKey.createdAt,
      updatedAt: updatedKey.updatedAt,
    };
  });
}
