import { eq, and } from "drizzle-orm";
import {
  db,
  upstreams,
  upstreamGroups,
  type Upstream,
  type UpstreamGroup,
  type CircuitBreakerState,
} from "../db";
import { UpstreamGroupNotFoundError } from "./upstream-crud";
import { getCircuitBreakerState, CircuitBreakerStateEnum } from "./circuit-breaker";
import { VALID_PROVIDER_TYPES, type ProviderType } from "./model-router";

// Re-export for backward compatibility and convenience
export { UpstreamGroupNotFoundError };
export { VALID_PROVIDER_TYPES };
export type { ProviderType };

/**
 * Load balancing strategies for upstream selection.
 */
export enum LoadBalancerStrategy {
  ROUND_ROBIN = "round_robin",
  WEIGHTED = "weighted",
  LEAST_CONNECTIONS = "least_connections",
}

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
 * Result of upstream selection.
 */
export interface SelectedUpstream {
  upstream: Upstream;
  strategy: LoadBalancerStrategy;
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
  strategy: LoadBalancerStrategy;
  providerType: ProviderType;
  routingType: "provider_type" | "group";
  groupName: string | null;
  circuitBreakerFiltered: number;
  healthFiltered: number;
  totalCandidates: number;
}

// In-memory state for load balancing (per-instance, not distributed)
// In production with multiple instances, consider using Redis for shared state

/**
 * Round-robin index tracking per group.
 */
const roundRobinIndex = new Map<string, number>();

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
 * Reset all round-robin indices (useful for testing).
 */
export function resetRoundRobinIndices(): void {
  roundRobinIndex.clear();
}

/**
 * Get all upstreams in a group with their health status.
 * Only returns active upstreams.
 */
export async function getGroupUpstreams(groupId: string): Promise<UpstreamWithHealth[]> {
  // Verify group exists
  const group = await db.query.upstreamGroups.findFirst({
    where: eq(upstreamGroups.id, groupId),
  });

  if (!group) {
    throw new UpstreamGroupNotFoundError(`Upstream group not found: ${groupId}`);
  }

  // Get all active upstreams in the group with their health status
  const groupUpstreams = await db.query.upstreams.findMany({
    where: and(eq(upstreams.groupId, groupId), eq(upstreams.isActive, true)),
    with: {
      health: true,
    },
  });

  return groupUpstreams.map((upstream) => ({
    upstream,
    // Default to healthy if no health record exists yet
    isHealthy: upstream.health?.isHealthy ?? true,
    latencyMs: upstream.health?.latencyMs ?? null,
  }));
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
 * Select an upstream using round-robin strategy.
 * Cycles through healthy upstreams in order.
 */
function selectRoundRobin(
  groupId: string,
  healthyUpstreams: UpstreamWithHealth[]
): UpstreamWithHealth {
  if (healthyUpstreams.length === 0) {
    throw new NoHealthyUpstreamsError("No healthy upstreams available for round-robin selection");
  }

  // Sort by ID to ensure consistent ordering
  const sorted = [...healthyUpstreams].sort((a, b) => a.upstream.id.localeCompare(b.upstream.id));

  // Get current index and advance
  const currentIndex = roundRobinIndex.get(groupId) ?? 0;
  const selectedIndex = currentIndex % sorted.length;
  roundRobinIndex.set(groupId, currentIndex + 1);

  return sorted[selectedIndex];
}

/**
 * Select an upstream using weighted random strategy.
 * Selection probability proportional to weight.
 */
function selectWeighted(healthyUpstreams: UpstreamWithHealth[]): UpstreamWithHealth {
  if (healthyUpstreams.length === 0) {
    throw new NoHealthyUpstreamsError("No healthy upstreams available for weighted selection");
  }

  // Calculate total weight
  const totalWeight = healthyUpstreams.reduce((sum, u) => sum + u.upstream.weight, 0);

  if (totalWeight === 0) {
    // If all weights are 0, fall back to random selection
    const randomIndex = Math.floor(Math.random() * healthyUpstreams.length);
    return healthyUpstreams[randomIndex];
  }

  // Random number in [0, totalWeight)
  let random = Math.random() * totalWeight;

  // Find the upstream that corresponds to this random value
  for (const u of healthyUpstreams) {
    random -= u.upstream.weight;
    if (random <= 0) {
      return u;
    }
  }

  // Fallback (should not happen)
  return healthyUpstreams[healthyUpstreams.length - 1];
}

/**
 * Select an upstream using least-connections strategy.
 * Selects the upstream with the fewest active connections.
 * Ties are broken by weight (higher weight preferred).
 */
function selectLeastConnections(healthyUpstreams: UpstreamWithHealth[]): UpstreamWithHealth {
  if (healthyUpstreams.length === 0) {
    throw new NoHealthyUpstreamsError(
      "No healthy upstreams available for least-connections selection"
    );
  }

  // Sort by connection count (ascending), then by weight (descending)
  const sorted = [...healthyUpstreams].sort((a, b) => {
    const connA = getConnectionCount(a.upstream.id);
    const connB = getConnectionCount(b.upstream.id);

    if (connA !== connB) {
      return connA - connB; // Fewer connections first
    }

    // Tie-breaker: higher weight first
    return b.upstream.weight - a.upstream.weight;
  });

  return sorted[0];
}

/**
 * Select the best upstream from a group based on the given strategy.
 *
 * @param groupId - The upstream group ID
 * @param strategy - The load balancing strategy to use (defaults to group's configured strategy)
 * @param excludeIds - Optional array of upstream IDs to exclude (for failover)
 * @returns The selected upstream
 * @throws {UpstreamGroupNotFoundError} If the group does not exist
 * @throws {NoHealthyUpstreamsError} If no healthy upstreams are available
 */
export async function selectUpstream(
  groupId: string,
  strategy?: LoadBalancerStrategy,
  excludeIds?: string[]
): Promise<SelectedUpstream> {
  // Get group to determine strategy if not provided
  const group = await db.query.upstreamGroups.findFirst({
    where: eq(upstreamGroups.id, groupId),
  });

  if (!group) {
    throw new UpstreamGroupNotFoundError(`Upstream group not found: ${groupId}`);
  }

  // Use provided strategy or group's default
  const effectiveStrategy = strategy ?? (group.strategy as LoadBalancerStrategy);

  // Get all upstreams with health status
  const allUpstreams = await getGroupUpstreams(groupId);

  // Filter to healthy upstreams, excluding specified IDs
  const healthyUpstreams = filterHealthyUpstreams(allUpstreams, excludeIds);

  if (healthyUpstreams.length === 0) {
    throw new NoHealthyUpstreamsError(
      `No healthy upstreams available in group: ${groupId}${
        excludeIds?.length ? ` (excluded: ${excludeIds.length})` : ""
      }`
    );
  }

  // Select based on strategy
  let selected: UpstreamWithHealth;

  switch (effectiveStrategy) {
    case LoadBalancerStrategy.ROUND_ROBIN:
      selected = selectRoundRobin(groupId, healthyUpstreams);
      break;
    case LoadBalancerStrategy.WEIGHTED:
      selected = selectWeighted(healthyUpstreams);
      break;
    case LoadBalancerStrategy.LEAST_CONNECTIONS:
      selected = selectLeastConnections(healthyUpstreams);
      break;
    default:
      // Default to round-robin if strategy is unknown
      selected = selectRoundRobin(groupId, healthyUpstreams);
  }

  return {
    upstream: selected.upstream,
    strategy: effectiveStrategy,
  };
}

/**
 * Get upstream group by ID.
 */
export async function getUpstreamGroupById(groupId: string): Promise<UpstreamGroup | null> {
  const group = await db.query.upstreamGroups.findFirst({
    where: eq(upstreamGroups.id, groupId),
  });
  return group ?? null;
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

/**
 * Check if a strategy string is valid.
 */
export function isValidStrategy(strategy: string): strategy is LoadBalancerStrategy {
  return Object.values(LoadBalancerStrategy).includes(strategy as LoadBalancerStrategy);
}

// ============================================================================
// Provider Type Based Selection (Model-Based Routing)
// ============================================================================

/**
 * Get all upstreams by provider type with circuit breaker status.
 * Tries provider_type field first, falls back to group-based routing.
 */
export async function getUpstreamsByProviderType(providerType: ProviderType): Promise<{
  upstreamsWithCircuitBreaker: UpstreamWithCircuitBreaker[];
  groupName: string | null;
  routingType: "provider_type" | "group";
}> {
  // First, try to find upstreams with matching provider_type field
  const providerTypeUpstreams = await db.query.upstreams.findMany({
    where: and(eq(upstreams.providerType, providerType), eq(upstreams.isActive, true)),
    with: {
      health: true,
    },
  });

  if (providerTypeUpstreams.length > 0) {
    const upstreamsWithCircuitBreaker = await Promise.all(
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

    return {
      upstreamsWithCircuitBreaker,
      groupName: null,
      routingType: "provider_type",
    };
  }

  // Fallback: find upstreams by group name
  const group = await db.query.upstreamGroups.findFirst({
    where: eq(upstreamGroups.name, providerType),
  });

  if (group) {
    const groupUpstreams = await db.query.upstreams.findMany({
      where: and(eq(upstreams.groupId, group.id), eq(upstreams.isActive, true)),
      with: {
        health: true,
      },
    });

    const upstreamsWithCircuitBreaker = await Promise.all(
      groupUpstreams.map(async (upstream) => {
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

    return {
      upstreamsWithCircuitBreaker,
      groupName: group.name,
      routingType: "group",
    };
  }

  return {
    upstreamsWithCircuitBreaker: [],
    groupName: null,
    routingType: "provider_type",
  };
}

/**
 * Filter upstreams by circuit breaker state (only CLOSED allowed for selection).
 * Returns the filtered list and count of excluded upstreams.
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
 * Higher health scores (lower latency, better availability) get increased weight.
 */
function selectWeightedWithHealthScore(
  upstreamList: UpstreamWithCircuitBreaker[]
): UpstreamWithCircuitBreaker {
  if (upstreamList.length === 0) {
    throw new NoHealthyUpstreamsError("No healthy upstreams available for weighted selection");
  }

  // Calculate effective weights with health score multiplier
  // Health score: 1.0 = perfect health, 0.0 = unhealthy
  // We boost weight by up to 50% for healthy upstreams with low latency
  const scoredUpstreams = upstreamList.map((u) => {
    let healthScore = 1.0;

    // Reduce score for high latency (assuming 500ms is "high")
    if (u.latencyMs !== null && u.latencyMs > 0) {
      const latencyPenalty = Math.min(u.latencyMs / 500, 0.5);
      healthScore -= latencyPenalty;
    }

    // Reduce score for unhealthy status
    if (!u.isHealthy) {
      healthScore -= 0.5;
    }

    // Ensure minimum score
    healthScore = Math.max(healthScore, 0.1);

    // Calculate effective weight
    const effectiveWeight = u.upstream.weight * healthScore;

    return { ...u, effectiveWeight };
  });

  const totalWeight = scoredUpstreams.reduce((sum, u) => sum + u.effectiveWeight, 0);

  if (totalWeight === 0) {
    // Fallback to random selection
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
 * Select upstream from a provider type using specified strategy.
 * Integrates circuit breaker filtering and health-based selection.
 *
 * @param providerType - The provider type (anthropic, openai, google, custom)
 * @param strategy - The load balancing strategy to use
 * @param excludeIds - Optional array of upstream IDs to exclude (for failover)
 * @param allowedUpstreamIds - Optional array of upstream IDs that are allowed (for API key authorization)
 * @returns Selection result with metadata
 * @throws {NoHealthyUpstreamsError} If no healthy upstreams available
 */
export async function selectFromProviderType(
  providerType: ProviderType,
  strategy: LoadBalancerStrategy = LoadBalancerStrategy.WEIGHTED,
  excludeIds?: string[],
  allowedUpstreamIds?: string[]
): Promise<ProviderTypeSelectionResult> {
  // Validate provider type
  if (!VALID_PROVIDER_TYPES.includes(providerType)) {
    throw new Error(`Invalid provider type: ${providerType}`);
  }

  // Get upstreams by provider type (with fallback to group-based)
  const { upstreamsWithCircuitBreaker, groupName, routingType } =
    await getUpstreamsByProviderType(providerType);

  // Filter by allowed upstream IDs (API key authorization)
  let filteredUpstreams = upstreamsWithCircuitBreaker;
  if (allowedUpstreamIds && allowedUpstreamIds.length > 0) {
    const allowedSet = new Set(allowedUpstreamIds);
    filteredUpstreams = upstreamsWithCircuitBreaker.filter((u) => allowedSet.has(u.upstream.id));
  }

  const totalCandidates = filteredUpstreams.length;

  if (totalCandidates === 0) {
    throw new NoHealthyUpstreamsError(
      `No authorized upstreams found for provider type: ${providerType}`
    );
  }

  // Filter by circuit breaker (exclude OPEN state)
  const afterCircuitBreaker = filterByCircuitBreaker(filteredUpstreams);

  // Filter by health and exclusions
  const afterHealth = filterByHealth(afterCircuitBreaker.allowed, excludeIds);

  if (afterHealth.allowed.length === 0) {
    throw new NoHealthyUpstreamsError(
      `No healthy upstreams available for provider type: ${providerType}` +
        (excludeIds?.length ? ` (excluded: ${excludeIds.length})` : "")
    );
  }

  // Select based on strategy
  let selected: UpstreamWithCircuitBreaker;

  switch (strategy) {
    case LoadBalancerStrategy.ROUND_ROBIN:
      selected = selectRoundRobinFromList(providerType, afterHealth.allowed);
      break;
    case LoadBalancerStrategy.WEIGHTED:
      selected = selectWeightedWithHealthScore(afterHealth.allowed);
      break;
    case LoadBalancerStrategy.LEAST_CONNECTIONS:
      selected = selectLeastConnectionsFromList(afterHealth.allowed);
      break;
    default:
      selected = selectWeightedWithHealthScore(afterHealth.allowed);
  }

  return {
    upstream: selected.upstream,
    strategy,
    providerType,
    routingType,
    groupName,
    circuitBreakerFiltered: afterCircuitBreaker.excludedCount,
    healthFiltered: afterHealth.excludedCount,
    totalCandidates,
  };
}

/**
 * Round-robin selection from a list (no group required).
 */
function selectRoundRobinFromList(
  key: string,
  upstreamList: UpstreamWithCircuitBreaker[]
): UpstreamWithCircuitBreaker {
  if (upstreamList.length === 0) {
    throw new NoHealthyUpstreamsError("No healthy upstreams available for round-robin selection");
  }

  // Sort by ID for consistent ordering
  const sorted = [...upstreamList].sort((a, b) => a.upstream.id.localeCompare(b.upstream.id));

  // Get current index and advance
  const currentIndex = roundRobinIndex.get(key) ?? 0;
  const selectedIndex = currentIndex % sorted.length;
  roundRobinIndex.set(key, currentIndex + 1);

  return sorted[selectedIndex];
}

/**
 * Least connections selection from a list (no group required).
 */
function selectLeastConnectionsFromList(
  upstreamList: UpstreamWithCircuitBreaker[]
): UpstreamWithCircuitBreaker {
  if (upstreamList.length === 0) {
    throw new NoHealthyUpstreamsError(
      "No healthy upstreams available for least-connections selection"
    );
  }

  // Sort by connection count (ascending), then by weight (descending)
  const sorted = [...upstreamList].sort((a, b) => {
    const connA = getConnectionCount(a.upstream.id);
    const connB = getConnectionCount(b.upstream.id);

    if (connA !== connB) {
      return connA - connB;
    }

    return b.upstream.weight - a.upstream.weight;
  });

  return sorted[0];
}
