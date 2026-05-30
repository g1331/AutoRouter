/**
 * Assembles the complete live pulse snapshot: the rolling-window traffic metrics
 * combined with AutoRouter's gateway-specific health signals (healthy upstream
 * ratio and open circuit breaker count).
 */

import { CircuitBreakerStateEnum } from "./circuit-breaker";
import { getAllHealthStatusWithCircuitBreaker, type HealthStatus } from "./health-checker";
import { getPulseWindowSnapshot, type PulseWindowSnapshot } from "./live-pulse-aggregator";

export interface LivePulseGatewayHealth {
  /** Number of upstreams currently marked healthy. */
  healthyUpstreams: number;
  /** Total number of upstreams counted (active upstreams). */
  totalUpstreams: number;
  /** Number of upstreams whose circuit breaker is currently open. */
  openCircuitBreakers: number;
}

export interface LivePulseSnapshot extends PulseWindowSnapshot {
  /** ISO timestamp when this snapshot was assembled. */
  generatedAt: string;
  /** Gateway-specific health signals. */
  gateway: LivePulseGatewayHealth;
}

const EMPTY_GATEWAY_HEALTH: LivePulseGatewayHealth = {
  healthyUpstreams: 0,
  totalUpstreams: 0,
  openCircuitBreakers: 0,
};

// Reading gateway health hits the database once per upstream. The pulse bar is
// pinned on every page, so many open dashboards would each poll it every couple
// of seconds. A short shared cache keeps those reads bounded regardless of how
// many connections are open.
const GATEWAY_CACHE_TTL_MS = 2000;
// Cache the failed lookup briefly too, so a database outage with many open
// connections does not bypass the cache and amplify into a query per connection.
const GATEWAY_CACHE_ERROR_TTL_MS = 1000;
let gatewayCache: { value: LivePulseGatewayHealth; expiresAt: number } | null = null;

async function loadGatewayHealth(nowMs: number): Promise<LivePulseGatewayHealth> {
  if (gatewayCache && gatewayCache.expiresAt > nowMs) {
    return gatewayCache.value;
  }

  try {
    const statuses = await getAllHealthStatusWithCircuitBreaker(true, true);
    const value = summarizeGatewayHealth(statuses);
    gatewayCache = { value, expiresAt: nowMs + GATEWAY_CACHE_TTL_MS };
    return value;
  } catch {
    gatewayCache = { value: EMPTY_GATEWAY_HEALTH, expiresAt: nowMs + GATEWAY_CACHE_ERROR_TTL_MS };
    return EMPTY_GATEWAY_HEALTH;
  }
}

/**
 * Clear the cached gateway health. Intended for tests.
 */
export function resetLivePulseCache(): void {
  gatewayCache = null;
}

/**
 * Reduce a list of upstream health statuses into gateway health counters.
 * Open and half-open circuit breakers are never counted as closed.
 */
export function summarizeGatewayHealth(statuses: HealthStatus[]): LivePulseGatewayHealth {
  let healthyUpstreams = 0;
  let openCircuitBreakers = 0;

  for (const status of statuses) {
    if (status.isHealthy) {
      healthyUpstreams += 1;
    }
    if (status.circuitBreaker?.state === CircuitBreakerStateEnum.OPEN) {
      openCircuitBreakers += 1;
    }
  }

  return {
    healthyUpstreams,
    totalUpstreams: statuses.length,
    openCircuitBreakers,
  };
}

/**
 * Build the full live pulse snapshot for the current moment.
 * Window metrics are always returned; if the gateway health lookup fails the
 * snapshot degrades to zeroed gateway counters rather than failing the request.
 */
export async function getLivePulseSnapshot(nowMs: number = Date.now()): Promise<LivePulseSnapshot> {
  const window = getPulseWindowSnapshot(nowMs);
  // loadGatewayHealth never throws: on failure it returns (and briefly caches)
  // zeroed gateway health so window metrics stay usable.
  const gateway = await loadGatewayHealth(nowMs);

  return {
    ...window,
    generatedAt: new Date(nowMs).toISOString(),
    gateway,
  };
}
