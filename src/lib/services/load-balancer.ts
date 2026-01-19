import { eq, and } from "drizzle-orm";
import {
  db,
  upstreams,
  upstreamGroups,
  upstreamHealth,
  type Upstream,
  type UpstreamGroup,
} from "../db";

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
 * Error thrown when an upstream group is not found.
 */
export class UpstreamGroupNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamGroupNotFoundError";
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
