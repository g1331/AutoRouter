import { eq } from "drizzle-orm";
import { db, circuitBreakerStates, type CircuitBreakerState } from "../db";

/**
 * Circuit breaker states
 */
export enum CircuitBreakerStateEnum {
  CLOSED = "closed",
  OPEN = "open",
  HALF_OPEN = "half_open",
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  openDuration: number; // seconds
  probeInterval: number; // seconds
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  openDuration: 30,
  probeInterval: 10,
};

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitBreakerOpenError extends Error {
  constructor(
    public readonly upstreamId: string,
    public readonly remainingSeconds: number
  ) {
    super(`Circuit breaker is OPEN for upstream ${upstreamId}. Retry after ${remainingSeconds}s`);
    this.name = "CircuitBreakerOpenError";
  }
}

/**
 * Get circuit breaker state for an upstream
 */
export async function getCircuitBreakerState(
  upstreamId: string
): Promise<CircuitBreakerState | null> {
  const state = await db.query.circuitBreakerStates.findFirst({
    where: eq(circuitBreakerStates.upstreamId, upstreamId),
  });
  return state ?? null;
}

/**
 * Get or create circuit breaker state for an upstream
 */
export async function getOrCreateCircuitBreakerState(
  upstreamId: string
): Promise<CircuitBreakerState> {
  const existing = await getCircuitBreakerState(upstreamId);
  if (existing) {
    return existing;
  }

  // Create new state with defaults
  const [created] = await db
    .insert(circuitBreakerStates)
    .values({
      upstreamId,
      state: CircuitBreakerStateEnum.CLOSED,
      failureCount: 0,
      successCount: 0,
    })
    .returning();

  return created;
}

/**
 * Get effective config (merge defaults with stored config)
 */
function getEffectiveConfig(storedConfig: CircuitBreakerState["config"]): CircuitBreakerConfig {
  return {
    ...DEFAULT_CONFIG,
    ...(storedConfig ?? {}),
  };
}

/**
 * Check if request can pass through circuit breaker
 */
export async function canRequestPass(upstreamId: string): Promise<boolean> {
  const state = await getOrCreateCircuitBreakerState(upstreamId);

  // CLOSED: allow all requests
  if (state.state === CircuitBreakerStateEnum.CLOSED) {
    return true;
  }

  // OPEN: check if open duration has elapsed
  if (state.state === CircuitBreakerStateEnum.OPEN) {
    const config = getEffectiveConfig(state.config);
    const openedAt = state.openedAt;

    if (!openedAt) {
      // Should not happen, but treat as expired
      return true;
    }

    const elapsedSeconds = (Date.now() - openedAt.getTime()) / 1000;

    if (elapsedSeconds >= config.openDuration) {
      // Transition to half-open
      await transitionToHalfOpen(upstreamId);
      return true;
    }

    return false;
  }

  // HALF_OPEN: check probe interval
  if (state.state === CircuitBreakerStateEnum.HALF_OPEN) {
    const config = getEffectiveConfig(state.config);
    const lastProbeAt = state.lastProbeAt;

    if (!lastProbeAt) {
      // First probe
      await updateLastProbeAt(upstreamId);
      return true;
    }

    const elapsedSeconds = (Date.now() - lastProbeAt.getTime()) / 1000;

    if (elapsedSeconds >= config.probeInterval) {
      await updateLastProbeAt(upstreamId);
      return true;
    }

    return false;
  }

  return true;
}

/**
 * Record a successful request
 */
export async function recordSuccess(upstreamId: string): Promise<void> {
  const state = await getOrCreateCircuitBreakerState(upstreamId);
  const config = getEffectiveConfig(state.config);

  if (state.state === CircuitBreakerStateEnum.HALF_OPEN) {
    const newSuccessCount = state.successCount + 1;

    if (newSuccessCount >= config.successThreshold) {
      // Transition to closed
      await db
        .update(circuitBreakerStates)
        .set({
          state: CircuitBreakerStateEnum.CLOSED,
          failureCount: 0,
          successCount: 0,
          updatedAt: new Date(),
        })
        .where(eq(circuitBreakerStates.upstreamId, upstreamId));
    } else {
      // Increment success count
      await db
        .update(circuitBreakerStates)
        .set({
          successCount: newSuccessCount,
          updatedAt: new Date(),
        })
        .where(eq(circuitBreakerStates.upstreamId, upstreamId));
    }
  }
  // In CLOSED state, we don't track successes to avoid unnecessary DB writes
}

/**
 * Record a failed request
 */
export async function recordFailure(upstreamId: string, _errorType?: string): Promise<void> {
  const state = await getOrCreateCircuitBreakerState(upstreamId);
  const config = getEffectiveConfig(state.config);

  const newFailureCount = state.failureCount + 1;

  if (
    state.state === CircuitBreakerStateEnum.CLOSED &&
    newFailureCount >= config.failureThreshold
  ) {
    // Transition to open
    await db
      .update(circuitBreakerStates)
      .set({
        state: CircuitBreakerStateEnum.OPEN,
        failureCount: newFailureCount,
        openedAt: new Date(),
        lastFailureAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(circuitBreakerStates.upstreamId, upstreamId));
  } else if (state.state === CircuitBreakerStateEnum.HALF_OPEN) {
    // Any failure in half-open goes back to open
    await db
      .update(circuitBreakerStates)
      .set({
        state: CircuitBreakerStateEnum.OPEN,
        failureCount: newFailureCount,
        openedAt: new Date(),
        lastFailureAt: new Date(),
        successCount: 0,
        updatedAt: new Date(),
      })
      .where(eq(circuitBreakerStates.upstreamId, upstreamId));
  } else {
    // Just increment failure count
    await db
      .update(circuitBreakerStates)
      .set({
        failureCount: newFailureCount,
        lastFailureAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(circuitBreakerStates.upstreamId, upstreamId));
  }
}

/**
 * Force circuit breaker to OPEN state (admin control)
 */
export async function forceOpen(upstreamId: string): Promise<void> {
  await getOrCreateCircuitBreakerState(upstreamId);

  await db
    .update(circuitBreakerStates)
    .set({
      state: CircuitBreakerStateEnum.OPEN,
      openedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(circuitBreakerStates.upstreamId, upstreamId));
}

/**
 * Force circuit breaker to CLOSED state (admin control)
 */
export async function forceClose(upstreamId: string): Promise<void> {
  await getOrCreateCircuitBreakerState(upstreamId);

  await db
    .update(circuitBreakerStates)
    .set({
      state: CircuitBreakerStateEnum.CLOSED,
      failureCount: 0,
      successCount: 0,
      updatedAt: new Date(),
    })
    .where(eq(circuitBreakerStates.upstreamId, upstreamId));
}

/**
 * Update circuit breaker configuration
 */
export async function updateCircuitBreakerConfig(
  upstreamId: string,
  config: Partial<CircuitBreakerConfig>
): Promise<void> {
  const state = await getOrCreateCircuitBreakerState(upstreamId);

  const newConfig = {
    ...(state.config ?? {}),
    ...config,
  };

  await db
    .update(circuitBreakerStates)
    .set({
      config: newConfig,
      updatedAt: new Date(),
    })
    .where(eq(circuitBreakerStates.upstreamId, upstreamId));
}

/**
 * Get remaining seconds until circuit breaker allows requests
 */
export async function getRemainingOpenSeconds(upstreamId: string): Promise<number> {
  const state = await getCircuitBreakerState(upstreamId);

  if (!state || state.state !== CircuitBreakerStateEnum.OPEN || !state.openedAt) {
    return 0;
  }

  const config = getEffectiveConfig(state.config);
  const elapsedSeconds = (Date.now() - state.openedAt.getTime()) / 1000;
  const remaining = Math.max(0, config.openDuration - elapsedSeconds);

  return Math.ceil(remaining);
}

/**
 * Transition to half-open state
 */
async function transitionToHalfOpen(upstreamId: string): Promise<void> {
  await db
    .update(circuitBreakerStates)
    .set({
      state: CircuitBreakerStateEnum.HALF_OPEN,
      successCount: 0,
      lastProbeAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(circuitBreakerStates.upstreamId, upstreamId));
}

/**
 * Update last probe timestamp
 */
async function updateLastProbeAt(upstreamId: string): Promise<void> {
  await db
    .update(circuitBreakerStates)
    .set({
      lastProbeAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(circuitBreakerStates.upstreamId, upstreamId));
}
