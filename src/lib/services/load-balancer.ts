import { eq, and } from "drizzle-orm";
import { db, upstreams, type Upstream, type CircuitBreakerState } from "../db";
import { getCircuitBreakerState, CircuitBreakerStateEnum } from "./circuit-breaker";
import { VALID_PROVIDER_TYPES, type ProviderType } from "./model-router";

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
  isCircuitClosed: boolean;
}

/**
 * Selection result with metadata for observability.
 */
export interface ProviderTypeSelectionResult {
  upstream: Upstream;
  providerType: ProviderType;
  selectedTier: number;
  circuitBreakerFiltered: number;
  healthFiltered: number;
  totalCandidates: number;
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
 * Filter upstreams by circuit breaker state (only CLOSED or HALF_OPEN allowed).
 */
export function filterByCircuitBreaker(upstreamList: UpstreamWithCircuitBreaker[]): {
  allowed: UpstreamWithCircuitBreaker[];
  excludedCount: number;
} {
  const allowed: UpstreamWithCircuitBreaker[] = [];
  let excludedCount = 0;

  for (const u of upstreamList) {
    if (u.isCircuitClosed) {
      allowed.push(u);
    } else {
      excludedCount++;
    }
  }

  return { allowed, excludedCount };
}

/**
 * Filter upstreams by health status and optional exclusion list.
 */
export function filterByHealth(
  upstreamList: UpstreamWithCircuitBreaker[],
  excludeIds?: string[]
): {
  allowed: UpstreamWithCircuitBreaker[];
  excludedCount: number;
} {
  const allowed = upstreamList.filter(
    (u) => u.isHealthy && (!excludeIds || !excludeIds.includes(u.upstream.id))
  );
  const excludedCount = upstreamList.length - allowed.length;

  return { allowed, excludedCount };
}

/**
 * Select upstream using weighted strategy with health score consideration.
 */
function selectWeightedWithHealthScore(
  upstreamList: UpstreamWithCircuitBreaker[]
): UpstreamWithCircuitBreaker {
  if (upstreamList.length === 0) {
    throw new NoHealthyUpstreamsError("No healthy upstreams available for weighted selection");
  }

  const scoredUpstreams = upstreamList.map((u) => {
    let healthScore = 1.0;

    if (u.latencyMs !== null && u.latencyMs > 0) {
      const latencyPenalty = Math.min(u.latencyMs / 500, 0.5);
      healthScore -= latencyPenalty;
    }

    if (!u.isHealthy) {
      healthScore -= 0.5;
    }

    healthScore = Math.max(healthScore, 0.1);

    const effectiveWeight = u.upstream.weight * healthScore;

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
      const isCircuitClosed = !circuitState || circuitState === CircuitBreakerStateEnum.CLOSED;

      return {
        upstream,
        isHealthy,
        latencyMs: upstream.health?.latencyMs ?? null,
        circuitState,
        isCircuitClosed,
      };
    })
  );
}

/**
 * Select upstream from a provider type using tiered priority routing.
 *
 * Algorithm:
 * 1. Fetch all active upstreams matching providerType (with circuit breaker state)
 * 2. Filter by allowedUpstreamIds (API key authorization)
 * 3. Group by priority (ascending — lower number = higher priority)
 * 4. For each tier (starting from highest priority):
 *    a. Filter out excluded IDs and circuit-breaker-OPEN upstreams
 *    b. If available upstreams remain → select by weighted random → return
 *    c. If none available → proceed to next tier
 * 5. All tiers exhausted → throw NoHealthyUpstreamsError
 */
export async function selectFromProviderType(
  providerType: ProviderType,
  excludeIds?: string[],
  allowedUpstreamIds?: string[]
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

  // Group by priority (ascending)
  const tierMap = new Map<number, UpstreamWithCircuitBreaker[]>();
  for (const u of filteredUpstreams) {
    const priority = u.upstream.priority;
    if (!tierMap.has(priority)) {
      tierMap.set(priority, []);
    }
    tierMap.get(priority)!.push(u);
  }

  // Sort tiers by priority ascending (lower number = higher priority)
  const sortedTiers = [...tierMap.entries()].sort((a, b) => a[0] - b[0]);

  let totalCircuitBreakerFiltered = 0;
  let totalHealthFiltered = 0;

  // Try each tier in priority order
  for (const [tier, tierUpstreams] of sortedTiers) {
    // Filter by circuit breaker
    const afterCircuitBreaker = filterByCircuitBreaker(tierUpstreams);
    totalCircuitBreakerFiltered += afterCircuitBreaker.excludedCount;

    // Filter by health and exclusions
    const afterHealth = filterByHealth(afterCircuitBreaker.allowed, excludeIds);
    totalHealthFiltered += afterHealth.excludedCount;

    if (afterHealth.allowed.length > 0) {
      // Select from this tier using weighted strategy
      const selected = selectWeightedWithHealthScore(afterHealth.allowed);

      return {
        upstream: selected.upstream,
        providerType,
        selectedTier: tier,
        circuitBreakerFiltered: totalCircuitBreakerFiltered,
        healthFiltered: totalHealthFiltered,
        totalCandidates,
      };
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
