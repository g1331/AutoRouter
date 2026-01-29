import { eq, and, gte, lte, sql, count, avg } from "drizzle-orm";
import { db, upstreams, upstreamGroups, upstreamHealth, requestLogs } from "../db";
import { decrypt } from "../utils/encryption";
import { testUpstreamConnection, type TestUpstreamResult } from "./upstream-connection-tester";
import { UpstreamNotFoundError, UpstreamGroupNotFoundError } from "./upstream-crud";
import {
  getCircuitBreakerState,
  CircuitBreakerStateEnum,
  type CircuitBreakerConfig,
  DEFAULT_CONFIG as CB_DEFAULT_CONFIG,
} from "./circuit-breaker";

// Re-export for backward compatibility
export { UpstreamNotFoundError, UpstreamGroupNotFoundError };
export { CircuitBreakerStateEnum } from "./circuit-breaker";

/**
 * Circuit breaker status for an upstream.
 */
export interface CircuitBreakerStatus {
  /** Current state: closed, open, half_open */
  state: string;
  /** Consecutive failure count */
  failureCount: number;
  /** Success count in half_open state */
  successCount: number;
  /** When the circuit opened (if applicable) */
  openedAt: Date | null;
  /** Last failure timestamp */
  lastFailureAt: Date | null;
  /** Remaining seconds until circuit allows requests (if open) */
  remainingOpenSeconds: number;
  /** Circuit breaker configuration */
  config: CircuitBreakerConfig;
}

/**
 * Health status response for an upstream.
 */
export interface HealthStatus {
  /** Upstream ID */
  upstreamId: string;
  /** Upstream name for display */
  upstreamName: string;
  /** Whether the upstream is currently healthy */
  isHealthy: boolean;
  /** Last health check timestamp */
  lastCheckAt: Date | null;
  /** Last successful health check timestamp */
  lastSuccessAt: Date | null;
  /** Consecutive failure count */
  failureCount: number;
  /** Latest latency in milliseconds */
  latencyMs: number | null;
  /** Error message from last failed check */
  errorMessage: string | null;
  /** Circuit breaker status (optional, populated when requested) */
  circuitBreaker?: CircuitBreakerStatus;
}

/**
 * Health metrics for an upstream over a time period.
 */
export interface HealthMetrics {
  /** Upstream ID */
  upstreamId: string;
  /** Time range start */
  startTime: Date;
  /** Time range end */
  endTime: Date;
  /** Total requests */
  totalRequests: number;
  /** Successful requests (2xx) */
  successfulRequests: number;
  /** Failed requests (5xx or network errors) */
  failedRequests: number;
  /** Availability percentage (0-100) */
  availability: number;
  /** Average latency in milliseconds */
  avgLatencyMs: number | null;
  /** P50 latency in milliseconds */
  p50LatencyMs: number | null;
  /** P95 latency in milliseconds */
  p95LatencyMs: number | null;
  /** P99 latency in milliseconds */
  p99LatencyMs: number | null;
}

/**
 * Result of a health check operation.
 */
export interface HealthCheckResult {
  /** Upstream ID that was checked */
  upstreamId: string;
  /** Whether the check was successful */
  success: boolean;
  /** Response latency in milliseconds */
  latencyMs: number | null;
  /** Error message if check failed */
  errorMessage: string | null;
  /** Timestamp when the check was performed */
  checkedAt: Date;
  /** Updated health status */
  healthStatus: HealthStatus;
}

/**
 * Get the current health status for an upstream.
 *
 * @param upstreamId - The upstream ID to get health status for
 * @returns The health status or null if no health record exists
 */
export async function getHealthStatus(upstreamId: string): Promise<HealthStatus | null> {
  const upstream = await db.query.upstreams.findFirst({
    where: eq(upstreams.id, upstreamId),
    with: {
      health: true,
    },
  });

  if (!upstream) {
    return null;
  }

  const health = upstream.health;

  return {
    upstreamId: upstream.id,
    upstreamName: upstream.name,
    isHealthy: health?.isHealthy ?? true, // Default to healthy if no record exists
    lastCheckAt: health?.lastCheckAt ?? null,
    lastSuccessAt: health?.lastSuccessAt ?? null,
    failureCount: health?.failureCount ?? 0,
    latencyMs: health?.latencyMs ?? null,
    errorMessage: health?.errorMessage ?? null,
  };
}

/**
 * Get health status for all upstreams in a group.
 *
 * @param groupId - The upstream group ID
 * @returns Array of health statuses for all upstreams in the group
 * @throws {UpstreamGroupNotFoundError} If the group does not exist
 */
export async function getGroupHealthStatus(groupId: string): Promise<HealthStatus[]> {
  // Verify group exists
  const group = await db.query.upstreamGroups.findFirst({
    where: eq(upstreamGroups.id, groupId),
  });

  if (!group) {
    throw new UpstreamGroupNotFoundError(`Upstream group not found: ${groupId}`);
  }

  // Get all upstreams in the group with health status
  const groupUpstreams = await db.query.upstreams.findMany({
    where: eq(upstreams.groupId, groupId),
    with: {
      health: true,
    },
  });

  return groupUpstreams.map((upstream) => ({
    upstreamId: upstream.id,
    upstreamName: upstream.name,
    isHealthy: upstream.health?.isHealthy ?? true,
    lastCheckAt: upstream.health?.lastCheckAt ?? null,
    lastSuccessAt: upstream.health?.lastSuccessAt ?? null,
    failureCount: upstream.health?.failureCount ?? 0,
    latencyMs: upstream.health?.latencyMs ?? null,
    errorMessage: upstream.health?.errorMessage ?? null,
  }));
}

/**
 * Update the health status record for an upstream.
 * Creates a new record if one doesn't exist.
 *
 * @param upstreamId - The upstream ID to update
 * @param isHealthy - Whether the upstream is healthy
 * @param latencyMs - Response latency in milliseconds (null if check failed before timing)
 * @param errorMessage - Error message if unhealthy
 * @returns The updated health status
 * @throws {UpstreamNotFoundError} If the upstream does not exist
 */
export async function updateHealthStatus(
  upstreamId: string,
  isHealthy: boolean,
  latencyMs: number | null,
  errorMessage?: string | null
): Promise<HealthStatus> {
  // Verify upstream exists
  const upstream = await db.query.upstreams.findFirst({
    where: eq(upstreams.id, upstreamId),
    with: {
      health: true,
    },
  });

  if (!upstream) {
    throw new UpstreamNotFoundError(`Upstream not found: ${upstreamId}`);
  }

  const now = new Date();
  const existingHealth = upstream.health;

  if (existingHealth) {
    // Update existing health record
    const updateData: Partial<typeof upstreamHealth.$inferInsert> = {
      isHealthy,
      lastCheckAt: now,
      latencyMs: latencyMs ?? null,
      errorMessage: errorMessage ?? null,
    };

    if (isHealthy) {
      updateData.lastSuccessAt = now;
      updateData.failureCount = 0;
    } else {
      updateData.failureCount = existingHealth.failureCount + 1;
    }

    await db.update(upstreamHealth).set(updateData).where(eq(upstreamHealth.id, existingHealth.id));

    return {
      upstreamId,
      upstreamName: upstream.name,
      isHealthy,
      lastCheckAt: now,
      lastSuccessAt: isHealthy ? now : existingHealth.lastSuccessAt,
      failureCount: isHealthy ? 0 : existingHealth.failureCount + 1,
      latencyMs: latencyMs ?? null,
      errorMessage: errorMessage ?? null,
    };
  } else {
    // Create new health record
    await db.insert(upstreamHealth).values({
      upstreamId,
      isHealthy,
      lastCheckAt: now,
      lastSuccessAt: isHealthy ? now : null,
      failureCount: isHealthy ? 0 : 1,
      latencyMs: latencyMs ?? null,
      errorMessage: errorMessage ?? null,
    });

    return {
      upstreamId,
      upstreamName: upstream.name,
      isHealthy,
      lastCheckAt: now,
      lastSuccessAt: isHealthy ? now : null,
      failureCount: isHealthy ? 0 : 1,
      latencyMs: latencyMs ?? null,
      errorMessage: errorMessage ?? null,
    };
  }
}

/**
 * Mark an upstream as unhealthy with a reason.
 *
 * @param upstreamId - The upstream ID to mark unhealthy
 * @param reason - The reason for marking unhealthy
 * @returns The updated health status
 * @throws {UpstreamNotFoundError} If the upstream does not exist
 */
export async function markUnhealthy(upstreamId: string, reason: string): Promise<HealthStatus> {
  return updateHealthStatus(upstreamId, false, null, reason);
}

/**
 * Mark an upstream as healthy with latency measurement.
 *
 * @param upstreamId - The upstream ID to mark healthy
 * @param latencyMs - The response latency in milliseconds
 * @returns The updated health status
 * @throws {UpstreamNotFoundError} If the upstream does not exist
 */
export async function markHealthy(upstreamId: string, latencyMs: number): Promise<HealthStatus> {
  return updateHealthStatus(upstreamId, true, latencyMs, null);
}

/**
 * Perform a health check on an upstream and update its status.
 *
 * Uses the upstream-connection-tester to make a lightweight API call to verify
 * connectivity and authentication. Updates the health status based on the result.
 *
 * @param upstreamId - The upstream ID to check
 * @param timeout - Optional timeout in seconds (defaults to upstream's configured timeout)
 * @returns The health check result
 * @throws {UpstreamNotFoundError} If the upstream does not exist
 */
export async function checkUpstreamHealth(
  upstreamId: string,
  timeout?: number
): Promise<HealthCheckResult> {
  // Get upstream configuration
  const upstream = await db.query.upstreams.findFirst({
    where: eq(upstreams.id, upstreamId),
    with: {
      health: true,
      group: true,
    },
  });

  if (!upstream) {
    throw new UpstreamNotFoundError(`Upstream not found: ${upstreamId}`);
  }

  // Decrypt API key for testing
  let apiKey: string;
  try {
    apiKey = decrypt(upstream.apiKeyEncrypted);
  } catch (error) {
    // Cannot decrypt API key - mark as unhealthy
    console.error(`Failed to decrypt API key for upstream ${upstreamId}:`, error);
    const healthStatus = await markUnhealthy(upstreamId, "Failed to decrypt API key");
    return {
      upstreamId,
      success: false,
      latencyMs: null,
      errorMessage: "Failed to decrypt API key",
      checkedAt: new Date(),
      healthStatus,
    };
  }

  // Use group's health check timeout if available, otherwise upstream timeout
  const effectiveTimeout = timeout ?? upstream.group?.healthCheckTimeout ?? upstream.timeout ?? 10;

  // Perform the health check
  const result: TestUpstreamResult = await testUpstreamConnection({
    provider: upstream.provider,
    baseUrl: upstream.baseUrl,
    apiKey,
    timeout: effectiveTimeout,
  });

  // Update health status based on result
  const healthStatus = await updateHealthStatus(
    upstreamId,
    result.success,
    result.latencyMs,
    result.success ? null : result.message
  );

  return {
    upstreamId,
    success: result.success,
    latencyMs: result.latencyMs,
    errorMessage: result.success ? null : result.message,
    checkedAt: result.testedAt,
    healthStatus,
  };
}

/**
 * Check health for all upstreams in a group.
 *
 * @param groupId - The upstream group ID
 * @returns Array of health check results
 * @throws {UpstreamGroupNotFoundError} If the group does not exist
 */
export async function checkGroupHealth(groupId: string): Promise<HealthCheckResult[]> {
  // Verify group exists and get configuration
  const group = await db.query.upstreamGroups.findFirst({
    where: eq(upstreamGroups.id, groupId),
  });

  if (!group) {
    throw new UpstreamGroupNotFoundError(`Upstream group not found: ${groupId}`);
  }

  // Get all active upstreams in the group
  const groupUpstreams = await db.query.upstreams.findMany({
    where: and(eq(upstreams.groupId, groupId), eq(upstreams.isActive, true)),
  });

  // Check all upstreams in parallel
  // NOTE: No concurrency limit is applied here. For production environments with
  // large groups, consider using p-limit (e.g., limit of 5-10 concurrent checks)
  // to avoid overwhelming the system or upstream providers.
  const results = await Promise.all(
    groupUpstreams.map((upstream) => checkUpstreamHealth(upstream.id, group.healthCheckTimeout))
  );

  return results;
}

/**
 * Get all health statuses across all upstreams.
 *
 * @param activeOnly - If true, only return health for active upstreams
 * @returns Array of health statuses
 */
export async function getAllHealthStatus(activeOnly: boolean = true): Promise<HealthStatus[]> {
  const whereClause = activeOnly ? eq(upstreams.isActive, true) : undefined;

  const allUpstreams = await db.query.upstreams.findMany({
    where: whereClause,
    with: {
      health: true,
    },
  });

  return allUpstreams.map((upstream) => ({
    upstreamId: upstream.id,
    upstreamName: upstream.name,
    isHealthy: upstream.health?.isHealthy ?? true,
    lastCheckAt: upstream.health?.lastCheckAt ?? null,
    lastSuccessAt: upstream.health?.lastSuccessAt ?? null,
    failureCount: upstream.health?.failureCount ?? 0,
    latencyMs: upstream.health?.latencyMs ?? null,
    errorMessage: upstream.health?.errorMessage ?? null,
  }));
}

/**
 * Initialize health record for an upstream if it doesn't exist.
 * Used when creating new upstreams or when upgrading existing upstreams.
 *
 * @param upstreamId - The upstream ID to initialize health for
 * @returns The created or existing health status
 */
export async function initializeHealthRecord(upstreamId: string): Promise<HealthStatus> {
  const existing = await getHealthStatus(upstreamId);

  if (existing) {
    return existing;
  }

  // Create a default healthy record
  return updateHealthStatus(upstreamId, true, null, null);
}

/**
 * Delete health record for an upstream.
 * Called automatically when upstream is deleted due to cascade,
 * but can be called manually if needed.
 *
 * @param upstreamId - The upstream ID to delete health record for
 */
export async function deleteHealthRecord(upstreamId: string): Promise<void> {
  await db.delete(upstreamHealth).where(eq(upstreamHealth.upstreamId, upstreamId));
}

/**
 * Formats a HealthStatus for API response (converts camelCase to snake_case).
 */
export function formatHealthStatusResponse(status: HealthStatus) {
  return {
    upstream_id: status.upstreamId,
    upstream_name: status.upstreamName,
    is_healthy: status.isHealthy,
    last_check_at: status.lastCheckAt?.toISOString() ?? null,
    last_success_at: status.lastSuccessAt?.toISOString() ?? null,
    failure_count: status.failureCount,
    latency_ms: status.latencyMs,
    error_message: status.errorMessage,
  };
}

/**
 * Formats a HealthCheckResult for API response (converts camelCase to snake_case).
 */
export function formatHealthCheckResultResponse(result: HealthCheckResult) {
  return {
    upstream_id: result.upstreamId,
    success: result.success,
    latency_ms: result.latencyMs,
    error_message: result.errorMessage,
    checked_at: result.checkedAt.toISOString(),
    health_status: formatHealthStatusResponse(result.healthStatus),
  };
}

/**
 * Get circuit breaker status for an upstream.
 *
 * @param upstreamId - The upstream ID to get circuit breaker status for
 * @returns The circuit breaker status or null if no state exists
 */
export async function getCircuitBreakerStatus(
  upstreamId: string
): Promise<CircuitBreakerStatus | null> {
  const cbState = await getCircuitBreakerState(upstreamId);

  if (!cbState) {
    return null;
  }

  // Calculate remaining open seconds
  let remainingOpenSeconds = 0;
  if (cbState.state === CircuitBreakerStateEnum.OPEN && cbState.openedAt) {
    const config = { ...CB_DEFAULT_CONFIG, ...(cbState.config ?? {}) };
    const elapsedSeconds = (Date.now() - cbState.openedAt.getTime()) / 1000;
    remainingOpenSeconds = Math.max(0, Math.ceil(config.openDuration - elapsedSeconds));
  }

  return {
    state: cbState.state,
    failureCount: cbState.failureCount,
    successCount: cbState.successCount,
    openedAt: cbState.openedAt,
    lastFailureAt: cbState.lastFailureAt,
    remainingOpenSeconds,
    config: { ...CB_DEFAULT_CONFIG, ...(cbState.config ?? {}) },
  };
}

/**
 * Get health status with circuit breaker information for an upstream.
 *
 * @param upstreamId - The upstream ID to get health status for
 * @param includeCircuitBreaker - Whether to include circuit breaker status
 * @returns The health status or null if no health record exists
 */
export async function getHealthStatusWithCircuitBreaker(
  upstreamId: string,
  includeCircuitBreaker: boolean = false
): Promise<HealthStatus | null> {
  const upstream = await db.query.upstreams.findFirst({
    where: eq(upstreams.id, upstreamId),
    with: {
      health: true,
    },
  });

  if (!upstream) {
    return null;
  }

  const health = upstream.health;

  const healthStatus: HealthStatus = {
    upstreamId: upstream.id,
    upstreamName: upstream.name,
    isHealthy: health?.isHealthy ?? true,
    lastCheckAt: health?.lastCheckAt ?? null,
    lastSuccessAt: health?.lastSuccessAt ?? null,
    failureCount: health?.failureCount ?? 0,
    latencyMs: health?.latencyMs ?? null,
    errorMessage: health?.errorMessage ?? null,
  };

  if (includeCircuitBreaker) {
    const cbStatus = await getCircuitBreakerStatus(upstreamId);
    if (cbStatus) {
      healthStatus.circuitBreaker = cbStatus;
    }
  }

  return healthStatus;
}

/**
 * Get all health statuses with optional circuit breaker information.
 *
 * @param activeOnly - If true, only return health for active upstreams
 * @param includeCircuitBreaker - Whether to include circuit breaker status
 * @returns Array of health statuses
 */
export async function getAllHealthStatusWithCircuitBreaker(
  activeOnly: boolean = true,
  includeCircuitBreaker: boolean = false
): Promise<HealthStatus[]> {
  const whereClause = activeOnly ? eq(upstreams.isActive, true) : undefined;

  const allUpstreams = await db.query.upstreams.findMany({
    where: whereClause,
    with: {
      health: true,
    },
  });

  const healthStatuses: HealthStatus[] = [];

  for (const upstream of allUpstreams) {
    const healthStatus: HealthStatus = {
      upstreamId: upstream.id,
      upstreamName: upstream.name,
      isHealthy: upstream.health?.isHealthy ?? true,
      lastCheckAt: upstream.health?.lastCheckAt ?? null,
      lastSuccessAt: upstream.health?.lastSuccessAt ?? null,
      failureCount: upstream.health?.failureCount ?? 0,
      latencyMs: upstream.health?.latencyMs ?? null,
      errorMessage: upstream.health?.errorMessage ?? null,
    };

    if (includeCircuitBreaker) {
      const cbStatus = await getCircuitBreakerStatus(upstream.id);
      if (cbStatus) {
        healthStatus.circuitBreaker = cbStatus;
      }
    }

    healthStatuses.push(healthStatus);
  }

  return healthStatuses;
}

/**
 * Probe an upstream to verify it's working (used for half-open state verification).
 * Makes a lightweight health check call without affecting circuit breaker state directly.
 *
 * @param upstreamId - The upstream ID to probe
 * @returns True if probe succeeded, false otherwise
 */
export async function probeUpstream(upstreamId: string): Promise<boolean> {
  try {
    const upstream = await db.query.upstreams.findFirst({
      where: eq(upstreams.id, upstreamId),
    });

    if (!upstream || !upstream.isActive) {
      return false;
    }

    // Decrypt API key for probing
    let apiKey: string;
    try {
      apiKey = decrypt(upstream.apiKeyEncrypted);
    } catch (error) {
      console.error(`Failed to decrypt API key for upstream ${upstreamId}:`, error);
      return false;
    }

    // Perform a lightweight health check
    const result: TestUpstreamResult = await testUpstreamConnection({
      provider: upstream.provider as "openai" | "anthropic",
      baseUrl: upstream.baseUrl,
      apiKey,
      timeout: 5, // Short timeout for probes
    });

    return result.success;
  } catch (error) {
    console.error(`Probe failed for upstream ${upstreamId}:`, error);
    return false;
  }
}

/**
 * Calculate health metrics for an upstream over a time period.
 *
 * @param upstreamId - The upstream ID to calculate metrics for
 * @param hours - Number of hours to look back (default: 24)
 * @returns Health metrics or null if upstream not found
 */
export async function calculateHealthMetrics(
  upstreamId: string,
  hours: number = 24
): Promise<HealthMetrics | null> {
  // Verify upstream exists
  const upstream = await db.query.upstreams.findFirst({
    where: eq(upstreams.id, upstreamId),
  });

  if (!upstream) {
    return null;
  }

  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

  // Get basic counts
  const [countResult] = await db
    .select({
      total: count(),
      successful: count(
        sql`CASE WHEN ${requestLogs.statusCode} >= 200 AND ${requestLogs.statusCode} < 300 THEN 1 END`
      ),
      failed: count(
        sql`CASE WHEN ${requestLogs.statusCode} >= 500 OR ${requestLogs.errorMessage} IS NOT NULL THEN 1 END`
      ),
      avgLatency: avg(requestLogs.durationMs),
    })
    .from(requestLogs)
    .where(
      and(
        eq(requestLogs.upstreamId, upstreamId),
        gte(requestLogs.createdAt, startTime),
        lte(requestLogs.createdAt, endTime)
      )
    );

  const totalRequests = Number(countResult?.total ?? 0);
  const successfulRequests = Number(countResult?.successful ?? 0);
  const failedRequests = Number(countResult?.failed ?? 0);
  const availability = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 100;

  // Calculate latency percentiles using raw SQL
  const latencyQuery = sql`
    SELECT
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) as p50,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms) as p99
    FROM ${requestLogs}
    WHERE ${requestLogs.upstreamId} = ${upstreamId}
      AND ${requestLogs.createdAt} >= ${startTime}
      AND ${requestLogs.createdAt} <= ${endTime}
      AND ${requestLogs.durationMs} IS NOT NULL
  `;

  const latencyResult = (await db.execute(latencyQuery)) as unknown as Array<{
    p50: number | null;
    p95: number | null;
    p99: number | null;
  }>;
  const latencyRow = latencyResult[0];

  return {
    upstreamId,
    startTime,
    endTime,
    totalRequests,
    successfulRequests,
    failedRequests,
    availability: Math.round(availability * 100) / 100,
    avgLatencyMs: countResult?.avgLatency ? Math.round(Number(countResult.avgLatency)) : null,
    p50LatencyMs: latencyRow?.p50 ? Math.round(Number(latencyRow.p50)) : null,
    p95LatencyMs: latencyRow?.p95 ? Math.round(Number(latencyRow.p95)) : null,
    p99LatencyMs: latencyRow?.p99 ? Math.round(Number(latencyRow.p99)) : null,
  };
}

/**
 * Get health metrics for all upstreams.
 *
 * @param hours - Number of hours to look back (default: 24)
 * @param activeOnly - If true, only include active upstreams
 * @returns Array of health metrics
 */
export async function getAllHealthMetrics(
  hours: number = 24,
  activeOnly: boolean = true
): Promise<HealthMetrics[]> {
  const whereClause = activeOnly ? eq(upstreams.isActive, true) : undefined;

  const allUpstreams = await db.query.upstreams.findMany({
    where: whereClause,
    columns: {
      id: true,
    },
  });

  const metrics: HealthMetrics[] = [];

  for (const upstream of allUpstreams) {
    const metric = await calculateHealthMetrics(upstream.id, hours);
    if (metric) {
      metrics.push(metric);
    }
  }

  return metrics;
}

/**
 * Formats circuit breaker status for API response.
 */
export function formatCircuitBreakerStatusResponse(status: CircuitBreakerStatus) {
  return {
    state: status.state,
    failure_count: status.failureCount,
    success_count: status.successCount,
    opened_at: status.openedAt?.toISOString() ?? null,
    last_failure_at: status.lastFailureAt?.toISOString() ?? null,
    remaining_open_seconds: status.remainingOpenSeconds,
    config: {
      failure_threshold: status.config.failureThreshold,
      success_threshold: status.config.successThreshold,
      open_duration: status.config.openDuration,
      probe_interval: status.config.probeInterval,
    },
  };
}

/**
 * Formats health metrics for API response.
 */
export function formatHealthMetricsResponse(metrics: HealthMetrics) {
  return {
    upstream_id: metrics.upstreamId,
    start_time: metrics.startTime.toISOString(),
    end_time: metrics.endTime.toISOString(),
    total_requests: metrics.totalRequests,
    successful_requests: metrics.successfulRequests,
    failed_requests: metrics.failedRequests,
    availability: metrics.availability,
    avg_latency_ms: metrics.avgLatencyMs,
    p50_latency_ms: metrics.p50LatencyMs,
    p95_latency_ms: metrics.p95LatencyMs,
    p99_latency_ms: metrics.p99LatencyMs,
  };
}
