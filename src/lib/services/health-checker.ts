import { eq, and } from "drizzle-orm";
import {
  db,
  upstreams,
  upstreamGroups,
  upstreamHealth,
  type Upstream,
  type UpstreamHealth,
} from "../db";
import { decrypt } from "../utils/encryption";
import { testUpstreamConnection, type TestUpstreamResult } from "./upstream-connection-tester";

/**
 * Error thrown when an upstream is not found.
 */
export class UpstreamNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamNotFoundError";
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
 * Default failure threshold before marking upstream as unhealthy.
 * Can be overridden via group configuration.
 */
const DEFAULT_FAILURE_THRESHOLD = 3;

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
  } catch {
    // Cannot decrypt API key - mark as unhealthy
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
