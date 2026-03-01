import { eq, and, inArray } from "drizzle-orm";
import { db, upstreams, type Upstream, type CircuitBreakerState } from "../db";
import {
  acquireCircuitBreakerPermit,
  CircuitBreakerOpenError,
  DEFAULT_CONFIG as CB_DEFAULT_CONFIG,
  getCircuitBreakerState,
  CircuitBreakerStateEnum,
} from "./circuit-breaker";
import { VALID_PROVIDER_TYPES, type ProviderType } from "./model-router";
import {
  affinityStore,
  shouldMigrate,
  type AffinityMigrationConfig,
  type AffinityScope,
} from "./session-affinity";
import { getPrimaryProviderByCapabilities } from "@/lib/route-capabilities";
import { quotaTracker } from "./upstream-quota-tracker";

// Re-export for convenience
export { VALID_PROVIDER_TYPES };
export type { ProviderType };

/**
 * Error thrown when no healthy upstreams are available.
 */
export class NoHealthyUpstreamsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoHealthyUpstreamsError";
  }
}

/**
 * Error thrown when API key has no authorized upstreams for provider type.
 */
export class NoAuthorizedUpstreamsError extends NoHealthyUpstreamsError {
  constructor(message: string = "No authorized upstreams found for current route capability") {
    super(message);
    this.name = "NoAuthorizedUpstreamsError";
  }
}

/**
 * Upstream with health information for load balancing decisions.
 */
export interface UpstreamWithHealth {
  upstream: Upstream;
  isHealthy: boolean;
  latencyMs: number | null;
}

/**
 * Upstream with health and circuit breaker information.
 */
export interface UpstreamWithCircuitBreaker {
  upstream: Upstream;
  isHealthy: boolean;
  latencyMs: number | null;
  circuitState: CircuitBreakerState["state"] | null;
  circuitBreaker: CircuitBreakerState | null;
}

/**
 * Selection result with metadata for observability.
 */
export interface UpstreamSelectionResult {
  upstream: Upstream;
  selectedTier: number;
  circuitBreakerFiltered: number;
  quotaFiltered: number;
  totalCandidates: number;
  affinityHit?: boolean; // Whether session affinity was used
  affinityMigrated?: boolean; // Whether session was migrated to higher priority upstream
}

export type ProviderTypeSelectionResult = UpstreamSelectionResult;

export interface SelectFromProviderOptions {
  candidateUpstreamIds?: string[];
  affinityScope?: AffinityScope;
}

// In-memory state for load balancing (per-instance, not distributed)

/**
 * Active connection counts per upstream.
 */
const connectionCounts = new Map<string, number>();

/**
 * Get current active connections for an upstream.
 */
export function getConnectionCount(upstreamId: string): number {
  return connectionCounts.get(upstreamId) ?? 0;
}

/**
 * Record a new connection to an upstream (increment counter).
 */
export function recordConnection(upstreamId: string): void {
  const current = connectionCounts.get(upstreamId) ?? 0;
  connectionCounts.set(upstreamId, current + 1);
}

/**
 * Release a connection from an upstream (decrement counter).
 */
export function releaseConnection(upstreamId: string): void {
  const current = connectionCounts.get(upstreamId) ?? 0;
  connectionCounts.set(upstreamId, Math.max(0, current - 1));
}

/**
 * Reset all connection counts (useful for testing).
 */
export function resetConnectionCounts(): void {
  connectionCounts.clear();
}

/**
 * Get healthy upstreams from a list, optionally excluding specific IDs.
 */
export function filterHealthyUpstreams(
  upstreamsWithHealth: UpstreamWithHealth[],
  excludeIds?: string[]
): UpstreamWithHealth[] {
  return upstreamsWithHealth.filter(
    (u) => u.isHealthy && (!excludeIds || !excludeIds.includes(u.upstream.id))
  );
}

/**
 * Filter upstreams by circuit breaker state and timing.
 *
 * Rules:
 * - CLOSED: allow
 * - OPEN: allow only when openDuration has elapsed (eligible to probe)
 * - HALF_OPEN: allow only when probeInterval has elapsed since lastProbeAt (eligible to probe)
 */
export function filterByCircuitBreaker(upstreamList: UpstreamWithCircuitBreaker[]): {
  allowed: UpstreamWithCircuitBreaker[];
  excludedCount: number;
} {
  const allowed: UpstreamWithCircuitBreaker[] = [];
  let excludedCount = 0;

  const nowMs = Date.now();

  for (const u of upstreamList) {
    const cb = u.circuitBreaker;
    if (!cb) {
      allowed.push(u);
      continue;
    }

    const config = { ...CB_DEFAULT_CONFIG, ...(cb.config ?? {}) };

    if (cb.state === CircuitBreakerStateEnum.CLOSED) {
      allowed.push(u);
      continue;
    }

    if (cb.state === CircuitBreakerStateEnum.OPEN) {
      if (!cb.openedAt) {
        allowed.push(u);
        continue;
      }

      const elapsedMs = nowMs - cb.openedAt.getTime();
      if (elapsedMs >= config.openDuration) {
        allowed.push(u);
        continue;
      }

      excludedCount++;
      continue;
    }

    if (cb.state === CircuitBreakerStateEnum.HALF_OPEN) {
      if (!cb.lastProbeAt) {
        allowed.push(u);
        continue;
      }

      const elapsedMs = nowMs - cb.lastProbeAt.getTime();
      if (elapsedMs >= config.probeInterval) {
        allowed.push(u);
        continue;
      }

      excludedCount++;
      continue;
    }

    // Unknown state: be permissive
    allowed.push(u);
  }

  return { allowed, excludedCount };
}

/**
 * Filter upstreams by exclusion list only.
 * Health status is NOT used for routing decisions — only circuit breaker state matters.
 */
export function filterByExclusions(
  upstreamList: UpstreamWithCircuitBreaker[],
  excludeIds?: string[]
): {
  allowed: UpstreamWithCircuitBreaker[];
  excludedCount: number;
} {
  const allowed = upstreamList.filter((u) => !excludeIds || !excludeIds.includes(u.upstream.id));
  const excludedCount = upstreamList.length - allowed.length;

  return { allowed, excludedCount };
}

/**
 * Filter upstreams that have exceeded their spending quota.
 */
export function filterBySpendingQuota(upstreamList: UpstreamWithCircuitBreaker[]): {
  allowed: UpstreamWithCircuitBreaker[];
  excludedCount: number;
} {
  const allowed: UpstreamWithCircuitBreaker[] = [];
  let excludedCount = 0;

  for (const u of upstreamList) {
    if (quotaTracker.isWithinQuota(u.upstream.id)) {
      allowed.push(u);
    } else {
      excludedCount++;
    }
  }

  return { allowed, excludedCount };
}

/**
 * Select upstream using weighted strategy with latency-based scoring.
 */
function selectWeightedWithHealthScore(
  upstreamList: UpstreamWithCircuitBreaker[]
): UpstreamWithCircuitBreaker {
  if (upstreamList.length === 0) {
    throw new NoHealthyUpstreamsError("No healthy upstreams available for weighted selection");
  }

  const scoredUpstreams = upstreamList.map((u) => {
    let score = 1.0;

    if (u.latencyMs !== null && u.latencyMs > 0) {
      const latencyPenalty = Math.min(u.latencyMs / 500, 0.5);
      score -= latencyPenalty;
    }

    score = Math.max(score, 0.1);

    const effectiveWeight = u.upstream.weight * score;

    return { ...u, effectiveWeight };
  });

  const totalWeight = scoredUpstreams.reduce((sum, u) => sum + u.effectiveWeight, 0);

  if (totalWeight === 0) {
    const randomIndex = Math.floor(Math.random() * upstreamList.length);
    return upstreamList[randomIndex];
  }

  let random = Math.random() * totalWeight;

  for (const u of scoredUpstreams) {
    random -= u.effectiveWeight;
    if (random <= 0) {
      return u;
    }
  }

  return upstreamList[upstreamList.length - 1];
}

/**
 * Get all upstreams by provider type with circuit breaker status.
 */
export async function getUpstreamsByProviderType(
  providerType: ProviderType
): Promise<UpstreamWithCircuitBreaker[]> {
  const activeUpstreams = await db.query.upstreams.findMany({
    where: eq(upstreams.isActive, true),
    with: {
      health: true,
    },
  });

  return Promise.all(
    activeUpstreams
      .filter(
        (upstream) => getPrimaryProviderByCapabilities(upstream.routeCapabilities) === providerType
      )
      .map(async (upstream) => {
        const cbState = await getCircuitBreakerState(upstream.id);
        const isHealthy = upstream.health?.isHealthy ?? true;
        const circuitState = cbState?.state ?? null;

        return {
          upstream,
          isHealthy,
          latencyMs: upstream.health?.latencyMs ?? null,
          circuitState,
          circuitBreaker: cbState,
        };
      })
  );
}

/**
 * Get active upstreams by explicit upstream IDs with circuit breaker status.
 */
async function getUpstreamsByIds(upstreamIds: string[]): Promise<UpstreamWithCircuitBreaker[]> {
  if (upstreamIds.length === 0) {
    return [];
  }

  const idSet = new Set(upstreamIds);
  const matchedUpstreams = await db.query.upstreams.findMany({
    where: and(eq(upstreams.isActive, true), inArray(upstreams.id, upstreamIds)),
    with: {
      health: true,
    },
  });

  const sortedUpstreams = matchedUpstreams.sort((a, b) => {
    const aIndex = upstreamIds.indexOf(a.id);
    const bIndex = upstreamIds.indexOf(b.id);
    return aIndex - bIndex;
  });

  return Promise.all(
    sortedUpstreams
      .filter((upstream) => idSet.has(upstream.id))
      .map(async (upstream) => {
        const cbState = await getCircuitBreakerState(upstream.id);
        const isHealthy = upstream.health?.isHealthy ?? true;
        const circuitState = cbState?.state ?? null;

        return {
          upstream,
          isHealthy,
          latencyMs: upstream.health?.latencyMs ?? null,
          circuitState,
          circuitBreaker: cbState,
        };
      })
  );
}

/**
 * Check if an upstream is available (circuit breaker allows traffic).
 */
function isUpstreamAvailable(u: UpstreamWithCircuitBreaker): boolean {
  const cb = u.circuitBreaker;
  if (!cb) return true;

  const config = { ...CB_DEFAULT_CONFIG, ...(cb.config ?? {}) };

  if (cb.state === CircuitBreakerStateEnum.CLOSED) return true;

  if (cb.state === CircuitBreakerStateEnum.OPEN) {
    if (!cb.openedAt) return true;
    const elapsedMs = Date.now() - cb.openedAt.getTime();
    return elapsedMs >= config.openDuration;
  }

  if (cb.state === CircuitBreakerStateEnum.HALF_OPEN) {
    if (!cb.lastProbeAt) return true;
    const elapsedMs = Date.now() - cb.lastProbeAt.getTime();
    return elapsedMs >= config.probeInterval;
  }

  return true;
}

/**
 * Select upstream from a provider type using tiered priority routing.
 *
 * Algorithm:
 * 1. Check session affinity cache (if sessionId provided)
 *    a. If hit and upstream available → check migration → return
 *    b. If hit but upstream unavailable → reselect without mutating affinity cache
 * 2. Fetch all active upstreams matching providerType (with circuit breaker state)
 * 3. Filter by allowedUpstreamIds (API key authorization)
 * 4. Group by priority (ascending — lower number = higher priority)
 * 5. For each tier (starting from highest priority):
 *    a. Filter out excluded IDs and circuit-breaker-OPEN upstreams
 *    b. If available upstreams remain → select by weighted random → return
 *    c. If none available → proceed to next tier
 * 6. All tiers exhausted → throw NoHealthyUpstreamsError
 */
export async function selectFromProviderType(
  providerType: ProviderType,
  excludeIds?: string[],
  allowedUpstreamIds?: string[],
  affinityContext?: {
    apiKeyId: string;
    sessionId: string;
    contentLength: number;
    affinityScope?: AffinityScope;
  },
  options?: SelectFromProviderOptions
): Promise<ProviderTypeSelectionResult> {
  if (!VALID_PROVIDER_TYPES.includes(providerType)) {
    throw new Error(`Invalid provider type: ${providerType}`);
  }

  const allUpstreams = options?.candidateUpstreamIds
    ? await getUpstreamsByIds(options.candidateUpstreamIds)
    : await getUpstreamsByProviderType(providerType);

  return selectFromUpstreamPool(
    allUpstreams,
    excludeIds,
    allowedUpstreamIds,
    affinityContext,
    options?.affinityScope
  );
}

export async function selectFromUpstreamCandidates(
  candidateUpstreamIds: string[],
  excludeIds?: string[],
  affinityContext?: {
    apiKeyId: string;
    sessionId: string;
    contentLength: number;
    affinityScope?: AffinityScope;
  }
): Promise<UpstreamSelectionResult> {
  const allUpstreams = await getUpstreamsByIds(candidateUpstreamIds);
  return selectFromUpstreamPool(
    allUpstreams,
    excludeIds,
    undefined,
    affinityContext,
    affinityContext?.affinityScope
  );
}

async function selectFromUpstreamPool(
  allUpstreams: UpstreamWithCircuitBreaker[],
  excludeIds?: string[],
  allowedUpstreamIds?: string[],
  affinityContext?: {
    apiKeyId: string;
    sessionId: string;
    contentLength: number;
    affinityScope?: AffinityScope;
  },
  affinityScopeHint?: AffinityScope
): Promise<UpstreamSelectionResult> {
  await quotaTracker.initialize();

  // Filter by allowed upstream IDs (API key authorization)
  let filteredUpstreams = allUpstreams;
  if (allowedUpstreamIds && allowedUpstreamIds.length > 0) {
    const allowedSet = new Set(allowedUpstreamIds);
    filteredUpstreams = allUpstreams.filter((u) => allowedSet.has(u.upstream.id));
  }

  const totalCandidates = filteredUpstreams.length;

  if (totalCandidates === 0) {
    throw new NoAuthorizedUpstreamsError();
  }

  // Check session affinity if context provided
  if (affinityContext) {
    const { apiKeyId, sessionId, contentLength } = affinityContext;
    const affinityScope = affinityContext.affinityScope ?? affinityScopeHint;
    if (!affinityScope) {
      const result = await performTieredSelection(filteredUpstreams, excludeIds, totalCandidates);
      return {
        ...result,
        affinityHit: false,
        affinityMigrated: false,
      };
    }

    const affinityEntry = affinityStore.get(apiKeyId, affinityScope, sessionId);

    if (affinityEntry) {
      // Check if bound upstream is still available and not excluded
      const boundUpstream = filteredUpstreams.find(
        (u) => u.upstream.id === affinityEntry.upstreamId
      );

      // Respect excludeIds: if bound upstream is excluded, skip affinity and reselect
      const isExcluded = excludeIds?.includes(affinityEntry.upstreamId) ?? false;
      let isWithinQuota = quotaTracker.isWithinQuota(affinityEntry.upstreamId);

      if (!isWithinQuota && boundUpstream) {
        try {
          await quotaTracker.syncUpstreamFromDb(
            boundUpstream.upstream.id,
            boundUpstream.upstream.name,
            boundUpstream.upstream.spendingRules ?? null
          );
          isWithinQuota = quotaTracker.isWithinQuota(affinityEntry.upstreamId);
        } catch {
          // Best-effort quota refresh only; fall back to cached decision.
        }
      }

      if (boundUpstream && isUpstreamAvailable(boundUpstream) && !isExcluded && isWithinQuota) {
        // Check if we should migrate to higher priority upstream
        // Filter out excluded upstreams from migration candidates
        const availableForMigration = filteredUpstreams.filter(
          (u) =>
            !excludeIds?.includes(u.upstream.id) &&
            isUpstreamAvailable(u) &&
            quotaTracker.isWithinQuota(u.upstream.id)
        );
        const migrationTarget = evaluateMigration(
          boundUpstream,
          availableForMigration,
          contentLength,
          affinityEntry.cumulativeTokens
        );

        if (migrationTarget && migrationTarget.upstream.id !== boundUpstream.upstream.id) {
          // Migrate to higher priority upstream
          try {
            await acquireCircuitBreakerPermit(migrationTarget.upstream.id);
            affinityStore.set(
              apiKeyId,
              affinityScope,
              sessionId,
              migrationTarget.upstream.id,
              contentLength
            );

            return {
              upstream: migrationTarget.upstream,
              selectedTier: migrationTarget.upstream.priority,
              circuitBreakerFiltered: 0,
              quotaFiltered: 0,
              totalCandidates,
              affinityHit: true,
              affinityMigrated: true,
            };
          } catch (error) {
            if (!(error instanceof CircuitBreakerOpenError)) {
              throw error;
            }
            // Migration failed, fall through to use bound upstream
          }
        }

        // Use bound upstream (no migration)
        try {
          await acquireCircuitBreakerPermit(boundUpstream.upstream.id);
          return {
            upstream: boundUpstream.upstream,
            selectedTier: boundUpstream.upstream.priority,
            circuitBreakerFiltered: 0,
            quotaFiltered: 0,
            totalCandidates,
            affinityHit: true,
            affinityMigrated: false,
          };
        } catch (error) {
          if (!(error instanceof CircuitBreakerOpenError)) {
            throw error;
          }
          // Bound upstream circuit opened, fall through to reselect
        }
      }

      // Bound upstream unavailable, reselect for this request only.
      // Do not overwrite affinity cache here; keep the stable binding until
      // a normal miss or explicit migration updates it.
      const result = await performTieredSelection(filteredUpstreams, excludeIds, totalCandidates);

      return {
        ...result,
        affinityHit: true,
        affinityMigrated: false,
      };
    }
  }

  // No affinity or cache miss - perform normal tiered selection
  const result = await performTieredSelection(filteredUpstreams, excludeIds, totalCandidates);

  // Update affinity cache if context provided
  if (affinityContext) {
    const { apiKeyId, sessionId, contentLength } = affinityContext;
    const affinityScope = affinityContext.affinityScope ?? affinityScopeHint;
    if (affinityScope) {
      affinityStore.set(apiKeyId, affinityScope, sessionId, result.upstream.id, contentLength);
    }
  }

  return {
    ...result,
    affinityHit: false,
    affinityMigrated: false,
  };
}

/**
 * Evaluate if session should migrate to a higher priority upstream.
 */
function evaluateMigration(
  currentUpstream: UpstreamWithCircuitBreaker,
  allUpstreams: UpstreamWithCircuitBreaker[],
  contentLength: number,
  cumulativeTokens: number
): UpstreamWithCircuitBreaker | null {
  const candidates = allUpstreams.map((u) => ({
    id: u.upstream.id,
    priority: u.upstream.priority,
    affinityMigration: u.upstream.affinityMigration as AffinityMigrationConfig | null,
  }));

  const current = {
    id: currentUpstream.upstream.id,
    priority: currentUpstream.upstream.priority,
    affinityMigration: currentUpstream.upstream.affinityMigration as AffinityMigrationConfig | null,
  };

  const target = shouldMigrate(current, candidates, contentLength, cumulativeTokens);

  if (!target) return null;

  return allUpstreams.find((u) => u.upstream.id === target.id) ?? null;
}

/**
 * Perform tiered selection without affinity.
 */
async function performTieredSelection(
  upstreams: UpstreamWithCircuitBreaker[],
  excludeIds: string[] | undefined,
  totalCandidates: number
): Promise<Omit<UpstreamSelectionResult, "affinityHit" | "affinityMigrated">> {
  // Group by priority (ascending)
  const tierMap = new Map<number, UpstreamWithCircuitBreaker[]>();
  for (const u of upstreams) {
    const priority = u.upstream.priority;
    if (!tierMap.has(priority)) {
      tierMap.set(priority, []);
    }
    tierMap.get(priority)!.push(u);
  }

  // Sort tiers by priority ascending (lower number = higher priority)
  const sortedTiers = [...tierMap.entries()].sort((a, b) => a[0] - b[0]);

  let totalCircuitBreakerFiltered = 0;
  let totalQuotaFiltered = 0;
  let didResyncQuota = false;

  // Try each tier in priority order
  for (const [tier, tierUpstreams] of sortedTiers) {
    // Filter by circuit breaker
    const afterCircuitBreaker = filterByCircuitBreaker(tierUpstreams);
    totalCircuitBreakerFiltered += afterCircuitBreaker.excludedCount;

    // Filter by spending quota
    let afterQuota = filterBySpendingQuota(afterCircuitBreaker.allowed);

    if (
      afterQuota.allowed.length === 0 &&
      afterCircuitBreaker.allowed.length > 0 &&
      didResyncQuota === false
    ) {
      didResyncQuota = true;
      try {
        await quotaTracker.syncFromDb();
        afterQuota = filterBySpendingQuota(afterCircuitBreaker.allowed);
      } catch {
        // Best-effort resync only; fall back to cached decision.
      }
    }
    totalQuotaFiltered += afterQuota.excludedCount;

    // Filter by exclusion list (health status is display-only, not used for routing)
    const afterExclusions = filterByExclusions(afterQuota.allowed, excludeIds);

    if (afterExclusions.allowed.length > 0) {
      const candidates = [...afterExclusions.allowed];

      while (candidates.length > 0) {
        // Select from this tier using weighted strategy
        const selected = selectWeightedWithHealthScore(candidates);

        try {
          // Reserve circuit breaker permit right before returning the selected upstream.
          await acquireCircuitBreakerPermit(selected.upstream.id);

          return {
            upstream: selected.upstream,
            selectedTier: tier,
            circuitBreakerFiltered: totalCircuitBreakerFiltered,
            quotaFiltered: totalQuotaFiltered,
            totalCandidates,
          };
        } catch (error) {
          if (error instanceof CircuitBreakerOpenError) {
            totalCircuitBreakerFiltered += 1;
            const idx = candidates.findIndex((u) => u.upstream.id === selected.upstream.id);
            if (idx >= 0) {
              candidates.splice(idx, 1);
              continue;
            }
          }
          throw error;
        }
      }
    }

    // This tier exhausted, continue to next tier (degradation)
  }

  // All tiers exhausted
  throw new NoHealthyUpstreamsError(
    `No healthy upstreams available across all priority tiers` +
      (excludeIds?.length ? ` (excluded: ${excludeIds.length})` : "")
  );
}
