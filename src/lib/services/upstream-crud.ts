import { eq, desc, count, isNull, and, inArray } from "drizzle-orm";
import {
  db,
  upstreams,
  upstreamGroups,
  circuitBreakerStates,
  type Upstream,
  type UpstreamGroup,
} from "../db";
import { encrypt, decrypt } from "../utils/encryption";
import { CircuitBreakerStateEnum } from "./circuit-breaker";

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

/**
 * Error thrown when an upstream group is not found in the database.
 */
export class UpstreamGroupNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamGroupNotFoundError";
  }
}

export interface UpstreamCreateInput {
  name: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  isDefault?: boolean;
  timeout?: number;
  config?: string | null;
  groupId?: string | null;
  weight?: number;
  providerType?: string | null;
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
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  isDefault?: boolean;
  timeout?: number;
  isActive?: boolean;
  config?: string | null;
  groupId?: string | null;
  weight?: number;
  providerType?: string | null;
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
  provider: string;
  baseUrl: string;
  apiKeyMasked: string;
  isDefault: boolean;
  timeout: number;
  isActive: boolean;
  config: string | null;
  groupId: string | null;
  weight: number;
  groupName: string | null;
  providerType: string | null;
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

export interface UpstreamGroupCreateInput {
  name: string;
  provider: string;
  strategy?: string;
  healthCheckInterval?: number;
  healthCheckTimeout?: number;
  config?: string | null;
}

export interface UpstreamGroupUpdateInput {
  name?: string;
  provider?: string;
  strategy?: string;
  healthCheckInterval?: number;
  healthCheckTimeout?: number;
  isActive?: boolean;
  config?: string | null;
}

export interface UpstreamGroupResponse {
  id: string;
  name: string;
  provider: string;
  strategy: string;
  healthCheckInterval: number;
  healthCheckTimeout: number;
  isActive: boolean;
  config: string | null;
  upstreamCount?: number;
  healthyCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedUpstreamGroups {
  items: UpstreamGroupResponse[];
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
    provider,
    baseUrl,
    apiKey,
    isDefault = false,
    timeout = 60,
    config,
    groupId,
    weight = 1,
    providerType,
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

  // Validate groupId if provided
  let groupName: string | null = null;
  if (groupId) {
    const group = await db.query.upstreamGroups.findFirst({
      where: eq(upstreamGroups.id, groupId),
    });
    if (!group) {
      throw new UpstreamGroupNotFoundError(`Upstream group not found: ${groupId}`);
    }
    // Validate provider consistency
    if (group.provider !== provider) {
      throw new Error(
        `Upstream provider '${provider}' does not match group provider '${group.provider}'`
      );
    }
    groupName = group.name;
  }

  // Encrypt the API key
  const apiKeyEncrypted = encrypt(apiKey);

  const now = new Date();

  // Create upstream record
  const [newUpstream] = await db
    .insert(upstreams)
    .values({
      name,
      provider,
      baseUrl,
      apiKeyEncrypted,
      isDefault,
      timeout,
      isActive: true,
      config: config ?? null,
      groupId: groupId ?? null,
      weight,
      providerType: providerType ?? null,
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
    provider: newUpstream.provider,
    baseUrl: newUpstream.baseUrl,
    apiKeyMasked: maskApiKey(apiKey),
    isDefault: newUpstream.isDefault,
    timeout: newUpstream.timeout,
    isActive: newUpstream.isActive,
    config: newUpstream.config,
    groupId: newUpstream.groupId,
    weight: newUpstream.weight,
    groupName,
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

  // Validate groupId if provided
  if (input.groupId !== undefined && input.groupId !== null) {
    const group = await db.query.upstreamGroups.findFirst({
      where: eq(upstreamGroups.id, input.groupId),
    });
    if (!group) {
      throw new UpstreamGroupNotFoundError(`Upstream group not found: ${input.groupId}`);
    }

    // Validate provider consistency if group has provider defined
    if (group.provider) {
      const effectiveProvider = input.provider ?? existing.provider;
      if (group.provider !== effectiveProvider) {
        throw new Error(
          `Upstream provider '${effectiveProvider}' does not match group provider '${group.provider}'`
        );
      }
    }
  }

  // Build update values
  const updateValues: Partial<typeof upstreams.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updateValues.name = input.name;
  if (input.provider !== undefined) updateValues.provider = input.provider;
  if (input.baseUrl !== undefined) updateValues.baseUrl = input.baseUrl;
  if (input.apiKey !== undefined) updateValues.apiKeyEncrypted = encrypt(input.apiKey);
  if (input.isDefault !== undefined) updateValues.isDefault = input.isDefault;
  if (input.timeout !== undefined) updateValues.timeout = input.timeout;
  if (input.isActive !== undefined) updateValues.isActive = input.isActive;
  if (input.config !== undefined) updateValues.config = input.config;
  if (input.groupId !== undefined) updateValues.groupId = input.groupId;
  if (input.weight !== undefined) updateValues.weight = input.weight;
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

  // Get group name if upstream is in a group
  let groupName: string | null = null;
  if (updated.groupId) {
    const group = await db.query.upstreamGroups.findFirst({
      where: eq(upstreamGroups.id, updated.groupId),
    });
    groupName = group?.name ?? null;
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
    provider: updated.provider,
    baseUrl: updated.baseUrl,
    apiKeyMasked,
    isDefault: updated.isDefault,
    timeout: updated.timeout,
    isActive: updated.isActive,
    config: updated.config,
    groupId: updated.groupId,
    weight: updated.weight,
    groupName,
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

  // Query paginated results with group relation (ordered by created_at desc)
  const offset = (page - 1) * pageSize;
  const upstreamList = await db.query.upstreams.findMany({
    orderBy: [desc(upstreams.createdAt)],
    limit: pageSize,
    offset,
    with: {
      group: true,
    },
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
      console.error(`Failed to decrypt upstream key for masking: ${upstream.name}, error: ${e}`);
      maskedKey = "***error***";
    }

    const cbState = cbStateMap.get(upstream.id);

    return {
      id: upstream.id,
      name: upstream.name,
      provider: upstream.provider,
      baseUrl: upstream.baseUrl,
      apiKeyMasked: maskedKey,
      isDefault: upstream.isDefault,
      timeout: upstream.timeout,
      isActive: upstream.isActive,
      config: upstream.config,
      groupId: upstream.groupId,
      weight: upstream.weight,
      groupName: upstream.group?.name ?? null,
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
    with: {
      group: true,
    },
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
    provider: upstream.provider,
    baseUrl: upstream.baseUrl,
    apiKeyMasked: maskedKey,
    isDefault: upstream.isDefault,
    timeout: upstream.timeout,
    isActive: upstream.isActive,
    config: upstream.config,
    groupId: upstream.groupId,
    weight: upstream.weight,
    groupName: upstream.group?.name ?? null,
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

// ========================================
// Upstream Group CRUD Functions
// ========================================

/**
 * Create a new upstream group.
 */
export async function createUpstreamGroup(
  input: UpstreamGroupCreateInput
): Promise<UpstreamGroupResponse> {
  const {
    name,
    provider,
    strategy = "round_robin",
    healthCheckInterval = 30,
    healthCheckTimeout = 10,
    config,
  } = input;

  // Check if name already exists
  const existing = await db.query.upstreamGroups.findFirst({
    where: eq(upstreamGroups.name, name),
  });

  if (existing) {
    throw new Error(`Upstream group with name '${name}' already exists`);
  }

  const now = new Date();

  // Create upstream group record
  const [newGroup] = await db
    .insert(upstreamGroups)
    .values({
      name,
      provider,
      strategy,
      healthCheckInterval,
      healthCheckTimeout,
      isActive: true,
      config: config ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return {
    id: newGroup.id,
    name: newGroup.name,
    provider: newGroup.provider,
    strategy: newGroup.strategy,
    healthCheckInterval: newGroup.healthCheckInterval,
    healthCheckTimeout: newGroup.healthCheckTimeout,
    isActive: newGroup.isActive,
    config: newGroup.config,
    createdAt: newGroup.createdAt,
    updatedAt: newGroup.updatedAt,
  };
}

/**
 * Update an existing upstream group.
 */
export async function updateUpstreamGroup(
  groupId: string,
  input: UpstreamGroupUpdateInput
): Promise<UpstreamGroupResponse> {
  const existing = await db.query.upstreamGroups.findFirst({
    where: eq(upstreamGroups.id, groupId),
  });

  if (!existing) {
    throw new UpstreamGroupNotFoundError(`Upstream group not found: ${groupId}`);
  }

  // Check name uniqueness if changing name
  if (input.name && input.name !== existing.name) {
    const nameConflict = await db.query.upstreamGroups.findFirst({
      where: eq(upstreamGroups.name, input.name),
    });
    if (nameConflict) {
      throw new Error(`Upstream group with name '${input.name}' already exists`);
    }
  }

  // Validate provider change doesn't conflict with existing upstreams
  if (input.provider && input.provider !== existing.provider) {
    const existingUpstreams = await db.query.upstreams.findMany({
      where: eq(upstreams.groupId, groupId),
      columns: { id: true, provider: true },
    });

    const incompatible = existingUpstreams.filter((u) => u.provider !== input.provider);
    if (incompatible.length > 0) {
      throw new Error(
        `Cannot change group provider: ${incompatible.length} upstream(s) have incompatible provider`
      );
    }
  }

  // Build update values
  const updateValues: Partial<typeof upstreamGroups.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updateValues.name = input.name;
  if (input.provider !== undefined) updateValues.provider = input.provider;
  if (input.strategy !== undefined) updateValues.strategy = input.strategy;
  if (input.healthCheckInterval !== undefined)
    updateValues.healthCheckInterval = input.healthCheckInterval;
  if (input.healthCheckTimeout !== undefined)
    updateValues.healthCheckTimeout = input.healthCheckTimeout;
  if (input.isActive !== undefined) updateValues.isActive = input.isActive;
  if (input.config !== undefined) updateValues.config = input.config;

  const [updated] = await db
    .update(upstreamGroups)
    .set(updateValues)
    .where(eq(upstreamGroups.id, groupId))
    .returning();

  return {
    id: updated.id,
    name: updated.name,
    provider: updated.provider,
    strategy: updated.strategy,
    healthCheckInterval: updated.healthCheckInterval,
    healthCheckTimeout: updated.healthCheckTimeout,
    isActive: updated.isActive,
    config: updated.config,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

/**
 * Delete an upstream group from the database.
 * Note: Upstreams in the group will have their groupId set to null (cascade).
 */
export async function deleteUpstreamGroup(groupId: string): Promise<void> {
  const existing = await db.query.upstreamGroups.findFirst({
    where: eq(upstreamGroups.id, groupId),
  });

  if (!existing) {
    throw new UpstreamGroupNotFoundError(`Upstream group not found: ${groupId}`);
  }

  await db.delete(upstreamGroups).where(eq(upstreamGroups.id, groupId));
}

/**
 * List all upstream groups with pagination.
 */
export async function listUpstreamGroups(
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedUpstreamGroups> {
  // Validate pagination params
  page = Math.max(1, page);
  pageSize = Math.min(100, Math.max(1, pageSize));

  // Count total groups
  const [{ value: total }] = await db.select({ value: count() }).from(upstreamGroups);

  // Query paginated results (ordered by created_at desc)
  const offset = (page - 1) * pageSize;
  const groupList = await db.query.upstreamGroups.findMany({
    orderBy: [desc(upstreamGroups.createdAt)],
    limit: pageSize,
    offset,
  });

  // Get all group IDs from the current page
  const groupIds = groupList.map((g) => g.id);

  // Query all active upstreams for these groups with health status
  const upstreamsWithHealth =
    groupIds.length > 0
      ? await db.query.upstreams.findMany({
          where: and(inArray(upstreams.groupId, groupIds), eq(upstreams.isActive, true)),
          with: {
            health: true,
          },
        })
      : [];

  // Build a map of group ID -> { upstreamCount, healthyCount }
  const groupStats = new Map<string, { upstreamCount: number; healthyCount: number }>();
  for (const groupId of groupIds) {
    groupStats.set(groupId, { upstreamCount: 0, healthyCount: 0 });
  }
  for (const upstream of upstreamsWithHealth) {
    if (upstream.groupId) {
      const stats = groupStats.get(upstream.groupId);
      if (stats) {
        stats.upstreamCount++;
        // Upstream is healthy if health record is null (not checked yet) or isHealthy is true
        if (!upstream.health || upstream.health.isHealthy) {
          stats.healthyCount++;
        }
      }
    }
  }

  // Build response items
  const items: UpstreamGroupResponse[] = groupList.map((group) => {
    const stats = groupStats.get(group.id) || { upstreamCount: 0, healthyCount: 0 };
    return {
      id: group.id,
      name: group.name,
      provider: group.provider,
      strategy: group.strategy,
      healthCheckInterval: group.healthCheckInterval,
      healthCheckTimeout: group.healthCheckTimeout,
      isActive: group.isActive,
      config: group.config,
      upstreamCount: stats.upstreamCount,
      healthyCount: stats.healthyCount,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
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
 * Get upstream group by ID.
 */
export async function getUpstreamGroupById(groupId: string): Promise<UpstreamGroupResponse | null> {
  const group = await db.query.upstreamGroups.findFirst({
    where: eq(upstreamGroups.id, groupId),
  });

  if (!group) {
    return null;
  }

  return {
    id: group.id,
    name: group.name,
    provider: group.provider,
    strategy: group.strategy,
    healthCheckInterval: group.healthCheckInterval,
    healthCheckTimeout: group.healthCheckTimeout,
    isActive: group.isActive,
    config: group.config,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

/**
 * Get upstream group by name.
 */
export async function getUpstreamGroupByName(name: string): Promise<UpstreamGroup | null> {
  const group = await db.query.upstreamGroups.findFirst({
    where: eq(upstreamGroups.name, name),
  });
  return group ?? null;
}

// ========================================
// Upstream Group Membership Functions
// ========================================

/**
 * Add an upstream to a group with optional weight.
 */
export async function addUpstreamToGroup(
  upstreamId: string,
  groupId: string,
  weight: number = 1
): Promise<UpstreamResponse> {
  // Validate upstream exists
  const upstream = await db.query.upstreams.findFirst({
    where: eq(upstreams.id, upstreamId),
  });

  if (!upstream) {
    throw new UpstreamNotFoundError(`Upstream not found: ${upstreamId}`);
  }

  // Validate group exists
  const group = await db.query.upstreamGroups.findFirst({
    where: eq(upstreamGroups.id, groupId),
  });

  if (!group) {
    throw new UpstreamGroupNotFoundError(`Upstream group not found: ${groupId}`);
  }

  // Validate provider consistency
  if (upstream.provider !== group.provider) {
    throw new Error(
      `Upstream provider '${upstream.provider}' does not match group provider '${group.provider}'`
    );
  }

  // Update upstream with group and weight
  const [updated] = await db
    .update(upstreams)
    .set({
      groupId,
      weight,
      updatedAt: new Date(),
    })
    .where(eq(upstreams.id, upstreamId))
    .returning();

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
    provider: updated.provider,
    baseUrl: updated.baseUrl,
    apiKeyMasked,
    isDefault: updated.isDefault,
    timeout: updated.timeout,
    isActive: updated.isActive,
    config: updated.config,
    groupId: updated.groupId,
    weight: updated.weight,
    groupName: group.name,
    providerType: updated.providerType,
    allowedModels: updated.allowedModels,
    modelRedirects: updated.modelRedirects,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

/**
 * Remove an upstream from its group.
 */
export async function removeUpstreamFromGroup(upstreamId: string): Promise<UpstreamResponse> {
  // Validate upstream exists
  const upstream = await db.query.upstreams.findFirst({
    where: eq(upstreams.id, upstreamId),
  });

  if (!upstream) {
    throw new UpstreamNotFoundError(`Upstream not found: ${upstreamId}`);
  }

  // Update upstream to remove group and reset weight
  const [updated] = await db
    .update(upstreams)
    .set({
      groupId: null,
      weight: 1,
      updatedAt: new Date(),
    })
    .where(eq(upstreams.id, upstreamId))
    .returning();

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
    provider: updated.provider,
    baseUrl: updated.baseUrl,
    apiKeyMasked,
    isDefault: updated.isDefault,
    timeout: updated.timeout,
    isActive: updated.isActive,
    config: updated.config,
    groupId: updated.groupId,
    weight: updated.weight,
    groupName: null,
    providerType: updated.providerType,
    allowedModels: updated.allowedModels,
    modelRedirects: updated.modelRedirects,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

/**
 * Get all upstreams in a specific group.
 */
export async function getUpstreamsInGroup(groupId: string): Promise<UpstreamResponse[]> {
  // Validate group exists
  const group = await db.query.upstreamGroups.findFirst({
    where: eq(upstreamGroups.id, groupId),
  });

  if (!group) {
    throw new UpstreamGroupNotFoundError(`Upstream group not found: ${groupId}`);
  }

  // Query upstreams in this group
  const upstreamList = await db.query.upstreams.findMany({
    where: eq(upstreams.groupId, groupId),
    orderBy: [desc(upstreams.weight), desc(upstreams.createdAt)],
  });

  // Build response items with masked API keys
  return upstreamList.map((upstream) => {
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
      provider: upstream.provider,
      baseUrl: upstream.baseUrl,
      apiKeyMasked: maskedKey,
      isDefault: upstream.isDefault,
      timeout: upstream.timeout,
      isActive: upstream.isActive,
      config: upstream.config,
      groupId: upstream.groupId,
      weight: upstream.weight,
      groupName: group.name,
      providerType: upstream.providerType,
      allowedModels: upstream.allowedModels,
      modelRedirects: upstream.modelRedirects,
      createdAt: upstream.createdAt,
      updatedAt: upstream.updatedAt,
    };
  });
}

/**
 * Get all upstreams without a group (standalone upstreams).
 */
export async function getStandaloneUpstreams(): Promise<UpstreamResponse[]> {
  // Query upstreams without a group
  const upstreamList = await db.query.upstreams.findMany({
    where: isNull(upstreams.groupId),
    orderBy: [desc(upstreams.createdAt)],
  });

  // Build response items with masked API keys
  return upstreamList.map((upstream) => {
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
      provider: upstream.provider,
      baseUrl: upstream.baseUrl,
      apiKeyMasked: maskedKey,
      isDefault: upstream.isDefault,
      timeout: upstream.timeout,
      isActive: upstream.isActive,
      config: upstream.config,
      groupId: upstream.groupId,
      weight: upstream.weight,
      groupName: null,
      providerType: upstream.providerType,
      allowedModels: upstream.allowedModels,
      modelRedirects: upstream.modelRedirects,
      createdAt: upstream.createdAt,
      updatedAt: upstream.updatedAt,
    };
  });
}
