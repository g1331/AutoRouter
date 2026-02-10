import { eq, and } from "drizzle-orm";
import { db, upstreams, type Upstream, type CircuitBreakerState } from "../db";
import {
  acquireCircuitBreakerPermit,
  CircuitBreakerOpenError,
  DEFAULT_CONFIG as CB_DEFAULT_CONFIG,
  getCircuitBreakerState,
  CircuitBreakerStateEnum,
} from "./circuit-breaker";
import { VALID_PROVIDER_TYPES, type ProviderType } from "./model-router";
import { affinityStore, shouldMigrate, type AffinityMigrationConfig } from "./session-affinity";

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
export interface ProviderTypeSelectionResult {
  upstream: Upstream;
  providerType: ProviderType;
  selectedTier: number;
  circuitBreakerFiltered: number;
  totalCandidates: number;
  affinityHit?: boolean; // Whether session affinity was used
  affinityMigrated?: boolean; // Whether session was migrated to higher priority upstream
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
  const providerTypeUpstreams = await db.query.upstreams.findMany({
    where: and(eq(upstreams.providerType, providerType), eq(upstreams.isActive, true)),
    with: {
      health: true,
    },
  });

  return Promise.all(
    providerTypeUpstreams.map(async (upstream) => {
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
 *    b. If hit but upstream unavailable → reselect and update cache
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
  }
): Promise<ProviderTypeSelectionResult> {
  if (!VALID_PROVIDER_TYPES.includes(providerType)) {
    throw new Error(`Invalid provider type: ${providerType}`);
  }

  const allUpstreams = await getUpstreamsByProviderType(providerType);

  // Filter by allowed upstream IDs (API key authorization)
  let filteredUpstreams = allUpstreams;
  if (allowedUpstreamIds && allowedUpstreamIds.length > 0) {
    const allowedSet = new Set(allowedUpstreamIds);
    filteredUpstreams = allUpstreams.filter((u) => allowedSet.has(u.upstream.id));
  }

  const totalCandidates = filteredUpstreams.length;

  if (totalCandidates === 0) {
    throw new NoHealthyUpstreamsError(
      `No authorized upstreams found for provider type: ${providerType}`
    );
  }

  // Check session affinity if context provided
  if (affinityContext) {
    const { apiKeyId, sessionId, contentLength } = affinityContext;
    const affinityEntry = affinityStore.get(apiKeyId, providerType, sessionId);

    if (affinityEntry) {
      // Check if bound upstream is still available
      const boundUpstream = filteredUpstreams.find(
        (u) => u.upstream.id === affinityEntry.upstreamId
      );

      if (boundUpstream && isUpstreamAvailable(boundUpstream)) {
        // Check if we should migrate to higher priority upstream
        const migrationTarget = evaluateMigration(
          boundUpstream,
          filteredUpstreams,
          contentLength,
          affinityEntry.cumulativeTokens
        );

        if (migrationTarget && migrationTarget.upstream.id !== boundUpstream.upstream.id) {
          // Migrate to higher priority upstream
          try {
            await acquireCircuitBreakerPermit(migrationTarget.upstream.id);
            affinityStore.set(
              apiKeyId,
              providerType,
              sessionId,
              migrationTarget.upstream.id,
              contentLength
            );

            return {
              upstream: migrationTarget.upstream,
              providerType,
              selectedTier: migrationTarget.upstream.priority,
              circuitBreakerFiltered: 0,
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
            providerType,
            selectedTier: boundUpstream.upstream.priority,
            circuitBreakerFiltered: 0,
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

      // Bound upstream unavailable, need to reselect and update cache
      const result = await performTieredSelection(
        filteredUpstreams,
        providerType,
        excludeIds,
        totalCandidates
      );

      // Update affinity cache with new selection
      affinityStore.set(apiKeyId, providerType, sessionId, result.upstream.id, contentLength);

      return {
        ...result,
        affinityHit: false,
        affinityMigrated: false,
      };
    }
  }

  // No affinity or cache miss - perform normal tiered selection
  const result = await performTieredSelection(
    filteredUpstreams,
    providerType,
    excludeIds,
    totalCandidates
  );

  // Update affinity cache if context provided
  if (affinityContext) {
    const { apiKeyId, sessionId, contentLength } = affinityContext;
    affinityStore.set(apiKeyId, providerType, sessionId, result.upstream.id, contentLength);
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
  providerType: ProviderType,
  excludeIds: string[] | undefined,
  totalCandidates: number
): Promise<Omit<ProviderTypeSelectionResult, "affinityHit" | "affinityMigrated">> {
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

  // Try each tier in priority order
  for (const [tier, tierUpstreams] of sortedTiers) {
    // Filter by circuit breaker
    const afterCircuitBreaker = filterByCircuitBreaker(tierUpstreams);
    totalCircuitBreakerFiltered += afterCircuitBreaker.excludedCount;

    // Filter by exclusion list (health status is display-only, not used for routing)
    const afterExclusions = filterByExclusions(afterCircuitBreaker.allowed, excludeIds);

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
            providerType,
            selectedTier: tier,
            circuitBreakerFiltered: totalCircuitBreakerFiltered,
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
    `No healthy upstreams available for provider type: ${providerType}` +
      ` across all priority tiers` +
      (excludeIds?.length ? ` (excluded: ${excludeIds.length})` : "")
  );
}
