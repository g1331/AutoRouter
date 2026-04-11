import { eq, desc, count, inArray, max } from "drizzle-orm";
import { db, upstreams, circuitBreakerStates, requestLogs, type Upstream } from "../db";
import { encrypt, decrypt } from "../utils/encryption";
import { createLogger } from "../utils/logger";
import { CircuitBreakerStateEnum } from "./circuit-breaker";
import { getConnectionCountsSnapshot } from "./load-balancer";
import {
  normalizeRouteCapabilities,
  resolveRouteCapabilities,
  type RouteCapability,
} from "@/lib/route-capabilities";
import { ensureRouteCapabilityMigration } from "./route-capability-migration";
import {
  normalizeModelDiscoveryConfig,
  parseUpstreamModelCatalog,
  parseUpstreamModelRules,
  resolveStoredUpstreamModelRules,
  type UpstreamModelCatalogEntry,
  type UpstreamModelCatalogFetchStatus,
  type UpstreamModelDiscoveryConfig,
  type UpstreamModelRule,
} from "./upstream-model-rules";
import {
  refreshUpstreamModelCatalog as refreshUpstreamModelCatalogPatch,
  type UpstreamModelCatalogRefreshResult,
} from "./upstream-model-discovery";

const log = createLogger("upstream-crud");

const MIN_KEY_LENGTH_FOR_MASKING = 7;

type SpendingRuleItem = {
  period_type: "daily" | "monthly" | "rolling";
  limit: number;
  period_hours?: number;
};
type SpendingRules = SpendingRuleItem[] | null;

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
  officialWebsiteUrl?: string | null;
  apiKey: string;
  isDefault?: boolean;
  timeout?: number;
  config?: string | null;
  maxConcurrency?: number | null;
  weight?: number;
  priority?: number;
  routeCapabilities?: RouteCapability[] | null;
  allowedModels?: string[] | null;
  modelRedirects?: Record<string, string> | null;
  modelDiscovery?: UpstreamModelDiscoveryConfig | null;
  modelCatalog?: UpstreamModelCatalogEntry[] | null;
  modelCatalogUpdatedAt?: Date | null;
  modelCatalogLastStatus?: UpstreamModelCatalogFetchStatus | null;
  modelCatalogLastError?: string | null;
  modelRules?: UpstreamModelRule[] | null;
  circuitBreakerConfig?: {
    failureThreshold?: number;
    successThreshold?: number;
    openDuration?: number;
    probeInterval?: number;
  } | null;
  affinityMigration?: {
    enabled: boolean;
    metric: "tokens" | "length";
    threshold: number;
  } | null;
  billingInputMultiplier?: number;
  billingOutputMultiplier?: number;
  spendingRules?:
    | { period_type: "daily" | "monthly" | "rolling"; limit: number; period_hours?: number }[]
    | null;
}

export interface UpstreamUpdateInput {
  name?: string;
  baseUrl?: string;
  officialWebsiteUrl?: string | null;
  apiKey?: string;
  isDefault?: boolean;
  timeout?: number;
  isActive?: boolean;
  config?: string | null;
  maxConcurrency?: number | null;
  weight?: number;
  priority?: number;
  routeCapabilities?: RouteCapability[] | null;
  allowedModels?: string[] | null;
  modelRedirects?: Record<string, string> | null;
  modelDiscovery?: UpstreamModelDiscoveryConfig | null;
  modelCatalog?: UpstreamModelCatalogEntry[] | null;
  modelCatalogUpdatedAt?: Date | null;
  modelCatalogLastStatus?: UpstreamModelCatalogFetchStatus | null;
  modelCatalogLastError?: string | null;
  modelRules?: UpstreamModelRule[] | null;
  circuitBreakerConfig?: {
    failureThreshold?: number;
    successThreshold?: number;
    openDuration?: number;
    probeInterval?: number;
  } | null;
  affinityMigration?: {
    enabled: boolean;
    metric: "tokens" | "length";
    threshold: number;
  } | null;
  billingInputMultiplier?: number;
  billingOutputMultiplier?: number;
  spendingRules?:
    | { period_type: "daily" | "monthly" | "rolling"; limit: number; period_hours?: number }[]
    | null;
}

export interface UpstreamResponse {
  id: string;
  name: string;
  baseUrl: string;
  officialWebsiteUrl: string | null;
  apiKeyMasked: string;
  isDefault: boolean;
  timeout: number;
  isActive: boolean;
  currentConcurrency: number;
  maxConcurrency: number | null;
  config: string | null;
  weight: number;
  priority: number;
  routeCapabilities: RouteCapability[];
  allowedModels: string[] | null;
  modelRedirects: Record<string, string> | null;
  modelDiscovery: UpstreamModelDiscoveryConfig | null;
  modelCatalog: UpstreamModelCatalogEntry[] | null;
  modelCatalogUpdatedAt: Date | null;
  modelCatalogLastStatus: UpstreamModelCatalogFetchStatus | null;
  modelCatalogLastError: string | null;
  modelRules: UpstreamModelRule[] | null;
  affinityMigration: {
    enabled: boolean;
    metric: "tokens" | "length";
    threshold: number;
  } | null;
  billingInputMultiplier?: number;
  billingOutputMultiplier?: number;
  spendingRules:
    | { period_type: "daily" | "monthly" | "rolling"; limit: number; period_hours?: number }[]
    | null;
  lastUsedAt: Date | null;
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

export interface ImportUpstreamCatalogModelsInput {
  models: string[];
}

type UpstreamRecord = typeof upstreams.$inferSelect;

async function getLastUsedAtMap(upstreamIds: string[]): Promise<Map<string, Date | null>> {
  if (upstreamIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      upstreamId: requestLogs.upstreamId,
      lastUsedAt: max(requestLogs.createdAt),
    })
    .from(requestLogs)
    .where(inArray(requestLogs.upstreamId, upstreamIds))
    .groupBy(requestLogs.upstreamId);

  const lastUsedAtByUpstreamId = new Map<string, Date | null>();
  for (const row of rows) {
    if (row.upstreamId) {
      lastUsedAtByUpstreamId.set(row.upstreamId, row.lastUsedAt ?? null);
    }
  }

  return lastUsedAtByUpstreamId;
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

function mapUpstreamRecordToResponse(
  upstream: UpstreamRecord,
  options: {
    apiKeyMasked: string;
    currentConcurrency?: number;
    lastUsedAt?: Date | null;
    circuitBreaker?: UpstreamCircuitBreakerStatus | null;
  }
): UpstreamResponse {
  return {
    id: upstream.id,
    name: upstream.name,
    baseUrl: upstream.baseUrl,
    officialWebsiteUrl: upstream.officialWebsiteUrl,
    apiKeyMasked: options.apiKeyMasked,
    isDefault: upstream.isDefault,
    timeout: upstream.timeout,
    isActive: upstream.isActive,
    currentConcurrency: options.currentConcurrency ?? 0,
    maxConcurrency: upstream.maxConcurrency,
    config: upstream.config,
    weight: upstream.weight,
    priority: upstream.priority,
    routeCapabilities: resolveRouteCapabilities(upstream.routeCapabilities),
    allowedModels: upstream.allowedModels,
    modelRedirects: upstream.modelRedirects,
    modelDiscovery: normalizeModelDiscoveryConfig(upstream.modelDiscovery),
    modelCatalog: parseUpstreamModelCatalog(upstream.modelCatalog),
    modelCatalogUpdatedAt: upstream.modelCatalogUpdatedAt ?? null,
    modelCatalogLastStatus: upstream.modelCatalogLastStatus ?? null,
    modelCatalogLastError: upstream.modelCatalogLastError ?? null,
    // Preserve legacy reads by deriving rule objects when the richer column is still empty.
    modelRules: resolveStoredUpstreamModelRules(upstream.modelRules, {
      allowedModels: upstream.allowedModels,
      modelRedirects: upstream.modelRedirects,
    }),
    affinityMigration: upstream.affinityMigration,
    billingInputMultiplier: upstream.billingInputMultiplier,
    billingOutputMultiplier: upstream.billingOutputMultiplier,
    spendingRules: upstream.spendingRules as SpendingRules,
    lastUsedAt: options.lastUsedAt ?? null,
    createdAt: upstream.createdAt,
    updatedAt: upstream.updatedAt,
    circuitBreaker: options.circuitBreaker ?? null,
  };
}

function buildDiscoveryTarget(upstream: UpstreamRecord): {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  routeCapabilities: RouteCapability[];
  modelDiscovery: UpstreamModelDiscoveryConfig | null;
} {
  return {
    id: upstream.id,
    name: upstream.name,
    baseUrl: upstream.baseUrl,
    apiKey: decrypt(upstream.apiKeyEncrypted),
    routeCapabilities: resolveRouteCapabilities(upstream.routeCapabilities),
    modelDiscovery: normalizeModelDiscoveryConfig(upstream.modelDiscovery),
  };
}

function mergeImportedCatalogRules(
  existingRules: UpstreamModelRule[] | null,
  catalog: UpstreamModelCatalogEntry[] | null,
  models: string[]
): UpstreamModelRule[] {
  const catalogEntries = parseUpstreamModelCatalog(catalog) ?? [];
  const catalogByModel = new Map(catalogEntries.map((entry) => [entry.model, entry]));
  const dedupedModels = [...new Set(models.map((model) => model.trim()).filter(Boolean))];
  const missingModels = dedupedModels.filter((model) => !catalogByModel.has(model));

  if (missingModels.length > 0) {
    throw new Error(
      `Requested models are not present in the cached catalog: ${missingModels.join(", ")}`
    );
  }

  const mergedRules = [...(existingRules ?? [])];
  for (const model of dedupedModels) {
    if (mergedRules.some((rule) => rule.type === "exact" && rule.model === model)) {
      continue;
    }

    const catalogEntry = catalogByModel.get(model);
    if (!catalogEntry) {
      continue;
    }

    mergedRules.push({
      type: "exact",
      model: catalogEntry.model,
      source: catalogEntry.source,
    });
  }

  return mergedRules;
}

/**
 * Create a new upstream with encrypted API key.
 */
export async function createUpstream(input: UpstreamCreateInput): Promise<UpstreamResponse> {
  const {
    name,
    baseUrl,
    officialWebsiteUrl = null,
    apiKey,
    isDefault = false,
    timeout = 60,
    config,
    maxConcurrency = null,
    weight = 1,
    priority = 0,
    routeCapabilities,
    allowedModels,
    modelRedirects,
    modelDiscovery,
    modelCatalog,
    modelCatalogUpdatedAt,
    modelCatalogLastStatus,
    modelCatalogLastError,
    modelRules,
    affinityMigration,
    billingInputMultiplier = 1,
    billingOutputMultiplier = 1,
  } = input;
  const { spendingRules = null } = input;

  const normalizedRouteCapabilities = resolveRouteCapabilities(routeCapabilities);
  const normalizedModelDiscovery = normalizeModelDiscoveryConfig(modelDiscovery);
  const normalizedModelCatalog = parseUpstreamModelCatalog(modelCatalog);
  const normalizedModelRules = parseUpstreamModelRules(modelRules);

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
      officialWebsiteUrl,
      apiKeyEncrypted,
      isDefault,
      timeout,
      isActive: true,
      maxConcurrency,
      config: config ?? null,
      weight,
      priority,
      routeCapabilities: normalizedRouteCapabilities,
      allowedModels: allowedModels ?? null,
      modelRedirects: modelRedirects ?? null,
      modelDiscovery: normalizedModelDiscovery,
      modelCatalog: normalizedModelCatalog,
      modelCatalogUpdatedAt: modelCatalogUpdatedAt ?? null,
      modelCatalogLastStatus: modelCatalogLastStatus ?? null,
      modelCatalogLastError: modelCatalogLastError ?? null,
      modelRules: normalizedModelRules,
      affinityMigration: affinityMigration ?? null,
      billingInputMultiplier,
      billingOutputMultiplier,
      spendingRules,
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

  return mapUpstreamRecordToResponse(newUpstream, {
    apiKeyMasked: maskApiKey(apiKey),
    currentConcurrency: getConnectionCountsSnapshot()[newUpstream.id] ?? 0,
  });
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
  if (input.officialWebsiteUrl !== undefined)
    updateValues.officialWebsiteUrl = input.officialWebsiteUrl;
  if (input.apiKey !== undefined) updateValues.apiKeyEncrypted = encrypt(input.apiKey);
  if (input.isDefault !== undefined) updateValues.isDefault = input.isDefault;
  if (input.timeout !== undefined) updateValues.timeout = input.timeout;
  if (input.isActive !== undefined) updateValues.isActive = input.isActive;
  if (input.maxConcurrency !== undefined) updateValues.maxConcurrency = input.maxConcurrency;
  if (input.config !== undefined) updateValues.config = input.config;
  if (input.weight !== undefined) updateValues.weight = input.weight;
  if (input.priority !== undefined) updateValues.priority = input.priority;
  if (input.routeCapabilities !== undefined) {
    updateValues.routeCapabilities = normalizeRouteCapabilities(input.routeCapabilities);
  }
  if (input.allowedModels !== undefined) updateValues.allowedModels = input.allowedModels;
  if (input.modelRedirects !== undefined) updateValues.modelRedirects = input.modelRedirects;
  if (input.modelDiscovery !== undefined) {
    updateValues.modelDiscovery = normalizeModelDiscoveryConfig(input.modelDiscovery);
  }
  if (input.modelCatalog !== undefined) {
    updateValues.modelCatalog = parseUpstreamModelCatalog(input.modelCatalog);
  }
  if (input.modelCatalogUpdatedAt !== undefined) {
    updateValues.modelCatalogUpdatedAt = input.modelCatalogUpdatedAt;
  }
  if (input.modelCatalogLastStatus !== undefined) {
    updateValues.modelCatalogLastStatus = input.modelCatalogLastStatus;
  }
  if (input.modelCatalogLastError !== undefined) {
    updateValues.modelCatalogLastError = input.modelCatalogLastError;
  }
  if (input.modelRules !== undefined) {
    updateValues.modelRules = parseUpstreamModelRules(input.modelRules);
  }
  if (input.affinityMigration !== undefined)
    updateValues.affinityMigration = input.affinityMigration;
  if (input.billingInputMultiplier !== undefined)
    updateValues.billingInputMultiplier = input.billingInputMultiplier;
  if (input.billingOutputMultiplier !== undefined)
    updateValues.billingOutputMultiplier = input.billingOutputMultiplier;
  if (input.spendingRules !== undefined) updateValues.spendingRules = input.spendingRules;

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
  const lastUsedAtByUpstreamId = await getLastUsedAtMap([updated.id]);

  return mapUpstreamRecordToResponse(updated, {
    apiKeyMasked,
    currentConcurrency: getConnectionCountsSnapshot()[updated.id] ?? 0,
    lastUsedAt: lastUsedAtByUpstreamId.get(updated.id) ?? null,
  });
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
  await ensureRouteCapabilityMigration();

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
  const currentConcurrencySnapshot = getConnectionCountsSnapshot();
  const lastUsedAtByUpstreamId = await getLastUsedAtMap(upstreamIds);
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

    return mapUpstreamRecordToResponse(upstream, {
      apiKeyMasked: maskedKey,
      currentConcurrency: currentConcurrencySnapshot[upstream.id] ?? 0,
      lastUsedAt: lastUsedAtByUpstreamId.get(upstream.id) ?? null,
      circuitBreaker: cbState
        ? {
            state: cbState.state as "closed" | "open" | "half_open",
            failureCount: cbState.failureCount,
            successCount: cbState.successCount,
            lastFailureAt: cbState.lastFailureAt,
            openedAt: cbState.openedAt,
          }
        : null,
    });
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
  await ensureRouteCapabilityMigration();

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

  const currentConcurrencySnapshot = getConnectionCountsSnapshot();
  const lastUsedAtByUpstreamId = await getLastUsedAtMap([upstream.id]);

  return mapUpstreamRecordToResponse(upstream, {
    apiKeyMasked: maskedKey,
    currentConcurrency: currentConcurrencySnapshot[upstream.id] ?? 0,
    lastUsedAt: lastUsedAtByUpstreamId.get(upstream.id) ?? null,
  });
}

export async function refreshStoredUpstreamModelCatalog(
  upstreamId: string
): Promise<UpstreamModelCatalogRefreshResult & { upstream: UpstreamResponse }> {
  const upstream = await db.query.upstreams.findFirst({
    where: eq(upstreams.id, upstreamId),
  });

  if (!upstream) {
    throw new UpstreamNotFoundError(`Upstream not found: ${upstreamId}`);
  }

  const refreshResult = await refreshUpstreamModelCatalogPatch(buildDiscoveryTarget(upstream));
  const updated = await updateUpstream(upstreamId, {
    modelCatalog: refreshResult.modelCatalog,
    modelCatalogUpdatedAt: refreshResult.modelCatalogUpdatedAt,
    modelCatalogLastStatus: refreshResult.modelCatalogLastStatus,
    modelCatalogLastError: refreshResult.modelCatalogLastError,
  });

  return {
    ...refreshResult,
    upstream: updated,
  };
}

export async function importStoredUpstreamCatalogModels(
  upstreamId: string,
  input: ImportUpstreamCatalogModelsInput
): Promise<UpstreamResponse> {
  const upstream = await db.query.upstreams.findFirst({
    where: eq(upstreams.id, upstreamId),
  });

  if (!upstream) {
    throw new UpstreamNotFoundError(`Upstream not found: ${upstreamId}`);
  }

  const mergedRules = mergeImportedCatalogRules(
    resolveStoredUpstreamModelRules(upstream.modelRules, {
      allowedModels: upstream.allowedModels,
      modelRedirects: upstream.modelRedirects,
    }),
    upstream.modelCatalog,
    input.models
  );

  return updateUpstream(upstreamId, {
    modelRules: mergedRules,
  });
}

/**
 * Load all active upstreams from database.
 */
export async function loadActiveUpstreams(): Promise<Upstream[]> {
  await ensureRouteCapabilityMigration();

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
