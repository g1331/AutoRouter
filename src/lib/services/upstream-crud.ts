import { eq, desc, count } from "drizzle-orm";
import { db, upstreams, circuitBreakerStates, type Upstream } from "../db";
import { encrypt, decrypt } from "../utils/encryption";
import { createLogger } from "../utils/logger";
import { CircuitBreakerStateEnum } from "./circuit-breaker";

const log = createLogger("upstream-crud");

const MIN_KEY_LENGTH_FOR_MASKING = 7;

/**
 * Circuit breaker status for upstream response
 */
export interface UpstreamCircuitBreakerStatus {
  state: "closed" | "open" | "half_open";
  failureCount: number;
  successCount: number;
  lastFailureAt: Date | null;
  openedAt: Date | null;
}

/**
 * Error thrown when an upstream is not found in the database.
 */
export class UpstreamNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamNotFoundError";
  }
}

export interface UpstreamCreateInput {
  name: string;
  baseUrl: string;
  apiKey: string;
  isDefault?: boolean;
  timeout?: number;
  config?: string | null;
  weight?: number;
  priority?: number;
  providerType?: string;
  allowedModels?: string[] | null;
  modelRedirects?: Record<string, string> | null;
  circuitBreakerConfig?: {
    failureThreshold?: number;
    successThreshold?: number;
    openDuration?: number;
    probeInterval?: number;
  } | null;
}

export interface UpstreamUpdateInput {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  isDefault?: boolean;
  timeout?: number;
  isActive?: boolean;
  config?: string | null;
  weight?: number;
  priority?: number;
  providerType?: string;
  allowedModels?: string[] | null;
  modelRedirects?: Record<string, string> | null;
  circuitBreakerConfig?: {
    failureThreshold?: number;
    successThreshold?: number;
    openDuration?: number;
    probeInterval?: number;
  } | null;
}

export interface UpstreamResponse {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyMasked: string;
  isDefault: boolean;
  timeout: number;
  isActive: boolean;
  config: string | null;
  weight: number;
  priority: number;
  providerType: string;
  allowedModels: string[] | null;
  modelRedirects: Record<string, string> | null;
  createdAt: Date;
  updatedAt: Date;
  circuitBreaker?: UpstreamCircuitBreakerStatus | null;
}

export interface PaginatedUpstreams {
  items: UpstreamResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Mask an API key for display (e.g., 'sk-***1234').
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= MIN_KEY_LENGTH_FOR_MASKING) {
    return "***";
  }

  const prefix = apiKey.startsWith("sk-") ? apiKey.slice(0, 3) : apiKey.slice(0, 2);
  const suffix = apiKey.slice(-4);
  return `${prefix}***${suffix}`;
}

/**
 * Create a new upstream with encrypted API key.
 */
export async function createUpstream(input: UpstreamCreateInput): Promise<UpstreamResponse> {
  const {
    name,
    baseUrl,
    apiKey,
    isDefault = false,
    timeout = 60,
    config,
    weight = 1,
    priority = 0,
    providerType = "openai",
    allowedModels,
    modelRedirects,
  } = input;

  // Check if name already exists
  const existing = await db.query.upstreams.findFirst({
    where: eq(upstreams.name, name),
  });

  if (existing) {
    throw new Error(`Upstream with name '${name}' already exists`);
  }

  // Encrypt the API key
  const apiKeyEncrypted = encrypt(apiKey);

  const now = new Date();

  // Create upstream record
  const [newUpstream] = await db
    .insert(upstreams)
    .values({
      name,
      baseUrl,
      apiKeyEncrypted,
      isDefault,
      timeout,
      isActive: true,
      config: config ?? null,
      weight,
      priority,
      providerType,
      allowedModels: allowedModels ?? null,
      modelRedirects: modelRedirects ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  // Create circuit breaker state with custom config if provided
  if (input.circuitBreakerConfig) {
    await db.insert(circuitBreakerStates).values({
      upstreamId: newUpstream.id,
      state: CircuitBreakerStateEnum.CLOSED,
      failureCount: 0,
      successCount: 0,
      config: input.circuitBreakerConfig,
      createdAt: now,
      updatedAt: now,
    });
  }

  return {
    id: newUpstream.id,
    name: newUpstream.name,
    baseUrl: newUpstream.baseUrl,
    apiKeyMasked: maskApiKey(apiKey),
    isDefault: newUpstream.isDefault,
    timeout: newUpstream.timeout,
    isActive: newUpstream.isActive,
    config: newUpstream.config,
    weight: newUpstream.weight,
    priority: newUpstream.priority,
    providerType: newUpstream.providerType,
    allowedModels: newUpstream.allowedModels,
    modelRedirects: newUpstream.modelRedirects,
    createdAt: newUpstream.createdAt,
    updatedAt: newUpstream.updatedAt,
  };
}

/**
 * Update an existing upstream.
 */
export async function updateUpstream(
  upstreamId: string,
  input: UpstreamUpdateInput
): Promise<UpstreamResponse> {
  const existing = await db.query.upstreams.findFirst({
    where: eq(upstreams.id, upstreamId),
  });

  if (!existing) {
    throw new UpstreamNotFoundError(`Upstream not found: ${upstreamId}`);
  }

  // Check name uniqueness if changing name
  if (input.name && input.name !== existing.name) {
    const nameConflict = await db.query.upstreams.findFirst({
      where: eq(upstreams.name, input.name),
    });
    if (nameConflict) {
      throw new Error(`Upstream with name '${input.name}' already exists`);
    }
  }

  // Build update values
  const updateValues: Partial<typeof upstreams.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updateValues.name = input.name;
  if (input.baseUrl !== undefined) updateValues.baseUrl = input.baseUrl;
  if (input.apiKey !== undefined) updateValues.apiKeyEncrypted = encrypt(input.apiKey);
  if (input.isDefault !== undefined) updateValues.isDefault = input.isDefault;
  if (input.timeout !== undefined) updateValues.timeout = input.timeout;
  if (input.isActive !== undefined) updateValues.isActive = input.isActive;
  if (input.config !== undefined) updateValues.config = input.config;
  if (input.weight !== undefined) updateValues.weight = input.weight;
  if (input.priority !== undefined) updateValues.priority = input.priority;
  if (input.providerType !== undefined) updateValues.providerType = input.providerType;
  if (input.allowedModels !== undefined) updateValues.allowedModels = input.allowedModels;
  if (input.modelRedirects !== undefined) updateValues.modelRedirects = input.modelRedirects;

  const [updated] = await db
    .update(upstreams)
    .set(updateValues)
    .where(eq(upstreams.id, upstreamId))
    .returning();

  // Update circuit breaker config if provided
  if (input.circuitBreakerConfig !== undefined) {
    const existingCb = await db.query.circuitBreakerStates.findFirst({
      where: eq(circuitBreakerStates.upstreamId, upstreamId),
    });

    if (existingCb) {
      // Update existing circuit breaker config
      await db
        .update(circuitBreakerStates)
        .set({
          config: input.circuitBreakerConfig,
          updatedAt: new Date(),
        })
        .where(eq(circuitBreakerStates.upstreamId, upstreamId));
    } else if (input.circuitBreakerConfig) {
      // Create new circuit breaker state with config
      await db.insert(circuitBreakerStates).values({
        upstreamId,
        state: CircuitBreakerStateEnum.CLOSED,
        failureCount: 0,
        successCount: 0,
        config: input.circuitBreakerConfig,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  // Decrypt key for masking
  let apiKeyMasked: string;
  try {
    apiKeyMasked = maskApiKey(decrypt(updated.apiKeyEncrypted));
  } catch {
    apiKeyMasked = "***error***";
  }

  return {
    id: updated.id,
    name: updated.name,
    baseUrl: updated.baseUrl,
    apiKeyMasked,
    isDefault: updated.isDefault,
    timeout: updated.timeout,
    isActive: updated.isActive,
    config: updated.config,
    weight: updated.weight,
    priority: updated.priority,
    providerType: updated.providerType,
    allowedModels: updated.allowedModels,
    modelRedirects: updated.modelRedirects,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

/**
 * Delete an upstream from the database.
 */
export async function deleteUpstream(upstreamId: string): Promise<void> {
  const existing = await db.query.upstreams.findFirst({
    where: eq(upstreams.id, upstreamId),
  });

  if (!existing) {
    throw new UpstreamNotFoundError(`Upstream not found: ${upstreamId}`);
  }

  await db.delete(upstreams).where(eq(upstreams.id, upstreamId));
}

/**
 * List all upstreams with pagination and masked API keys.
 */
export async function listUpstreams(
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedUpstreams> {
  // Validate pagination params
  page = Math.max(1, page);
  pageSize = Math.min(100, Math.max(1, pageSize));

  // Count total upstreams
  const [{ value: total }] = await db.select({ value: count() }).from(upstreams);

  // Query paginated results (ordered by created_at desc)
  const offset = (page - 1) * pageSize;
  const upstreamList = await db.query.upstreams.findMany({
    orderBy: [desc(upstreams.createdAt)],
    limit: pageSize,
    offset,
  });

  // Fetch circuit breaker states for all upstreams
  const upstreamIds = upstreamList.map((u) => u.id);
  const cbStates =
    upstreamIds.length > 0
      ? await db.query.circuitBreakerStates.findMany({
          where: (table, { inArray }) => inArray(table.upstreamId, upstreamIds),
        })
      : [];

  const cbStateMap = new Map(cbStates.map((cb) => [cb.upstreamId, cb]));

  // Auto-create circuit breaker states for upstreams that don't have one
  const missingCbUpstreamIds = upstreamIds.filter((id) => !cbStateMap.has(id));
  if (missingCbUpstreamIds.length > 0) {
    const now = new Date();
    const newCbStates = await db
      .insert(circuitBreakerStates)
      .values(
        missingCbUpstreamIds.map((upstreamId) => ({
          upstreamId,
          state: CircuitBreakerStateEnum.CLOSED,
          failureCount: 0,
          successCount: 0,
          createdAt: now,
          updatedAt: now,
        }))
      )
      .returning();

    // Add newly created states to the map
    for (const cb of newCbStates) {
      cbStateMap.set(cb.upstreamId, cb);
    }
  }

  // Build response items with masked API keys
  const items: UpstreamResponse[] = upstreamList.map((upstream) => {
    let maskedKey: string;
    try {
      const decryptedKey = decrypt(upstream.apiKeyEncrypted);
      maskedKey = maskApiKey(decryptedKey);
    } catch (e) {
      log.error({ err: e, upstream: upstream.name }, "failed to decrypt upstream key for masking");
      maskedKey = "***error***";
    }

    const cbState = cbStateMap.get(upstream.id);

    return {
      id: upstream.id,
      name: upstream.name,
      baseUrl: upstream.baseUrl,
      apiKeyMasked: maskedKey,
      isDefault: upstream.isDefault,
      timeout: upstream.timeout,
      isActive: upstream.isActive,
      config: upstream.config,
      weight: upstream.weight,
      priority: upstream.priority,
      providerType: upstream.providerType,
      allowedModels: upstream.allowedModels,
      modelRedirects: upstream.modelRedirects,
      createdAt: upstream.createdAt,
      updatedAt: upstream.updatedAt,
      circuitBreaker: cbState
        ? {
            state: cbState.state as "closed" | "open" | "half_open",
            failureCount: cbState.failureCount,
            successCount: cbState.successCount,
            lastFailureAt: cbState.lastFailureAt,
            openedAt: cbState.openedAt,
          }
        : null,
    };
  });

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
 * Get upstream by ID.
 */
export async function getUpstreamById(upstreamId: string): Promise<UpstreamResponse | null> {
  const upstream = await db.query.upstreams.findFirst({
    where: eq(upstreams.id, upstreamId),
  });

  if (!upstream) {
    return null;
  }

  let maskedKey: string;
  try {
    const decryptedKey = decrypt(upstream.apiKeyEncrypted);
    maskedKey = maskApiKey(decryptedKey);
  } catch {
    maskedKey = "***error***";
  }

  return {
    id: upstream.id,
    name: upstream.name,
    baseUrl: upstream.baseUrl,
    apiKeyMasked: maskedKey,
    isDefault: upstream.isDefault,
    timeout: upstream.timeout,
    isActive: upstream.isActive,
    config: upstream.config,
    weight: upstream.weight,
    priority: upstream.priority,
    providerType: upstream.providerType,
    allowedModels: upstream.allowedModels,
    modelRedirects: upstream.modelRedirects,
    createdAt: upstream.createdAt,
    updatedAt: upstream.updatedAt,
  };
}

/**
 * Load all active upstreams from database.
 */
export async function loadActiveUpstreams(): Promise<Upstream[]> {
  return db.query.upstreams.findMany({
    where: eq(upstreams.isActive, true),
  });
}

/**
 * Get default upstream.
 */
export async function getDefaultUpstream(): Promise<Upstream | null> {
  const upstream = await db.query.upstreams.findFirst({
    where: eq(upstreams.isDefault, true),
  });
  return upstream ?? null;
}

/**
 * Get upstream by name.
 */
export async function getUpstreamByName(name: string): Promise<Upstream | null> {
  const upstream = await db.query.upstreams.findFirst({
    where: eq(upstreams.name, name),
  });
  return upstream ?? null;
}

/**
 * Get decrypted API key for an upstream (used for proxying).
 */
export function getDecryptedApiKey(upstream: Upstream): string {
  return decrypt(upstream.apiKeyEncrypted);
}
