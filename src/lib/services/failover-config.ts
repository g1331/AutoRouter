/**
 * Failover configuration types and defaults.
 *
 * This module defines the configuration for the failover mechanism,
 * including retry strategies and error handling options.
 */

/**
 * Failover strategy types.
 * - exhaust_all: Try all available upstreams until one succeeds or all fail
 * - max_attempts: Stop after a fixed number of attempts
 */
export type FailoverStrategy = "exhaust_all" | "max_attempts";

/**
 * Failover configuration interface.
 */
export interface FailoverConfig {
  /**
   * The retry strategy to use.
   * - exhaust_all: Try all available upstreams (default)
   * - max_attempts: Stop after maxAttempts failures
   */
  strategy: FailoverStrategy;

  /**
   * Maximum number of failover attempts when strategy is "max_attempts".
   * Ignored when strategy is "exhaust_all".
   */
  maxAttempts?: number;

  /**
   * HTTP status codes that should NOT trigger failover.
   * These responses will be returned directly to downstream.
   * Example: [400] to skip failover for bad request errors.
   */
  excludeStatusCodes?: number[];
}

/**
 * Default failover configuration.
 * Uses exhaust_all strategy to maximize success rate.
 */
export const DEFAULT_FAILOVER_CONFIG: FailoverConfig = {
  strategy: "exhaust_all",
  maxAttempts: 10, // Fallback limit for max_attempts strategy
  excludeStatusCodes: [], // By default, all non-2xx trigger failover
};

/**
 * Check if a status code should trigger failover based on configuration.
 *
 * @param statusCode - The HTTP status code from upstream
 * @param config - The failover configuration
 * @returns true if failover should be triggered, false otherwise
 */
export function shouldTriggerFailover(
  statusCode: number,
  config: FailoverConfig = DEFAULT_FAILOVER_CONFIG
): boolean {
  // 2xx responses are successful, no failover needed
  if (statusCode >= 200 && statusCode < 300) {
    return false;
  }

  // Check if this status code is excluded from failover
  if (config.excludeStatusCodes?.includes(statusCode)) {
    return false;
  }

  // All other non-2xx responses trigger failover
  return true;
}

/**
 * Check if we should continue trying more upstreams.
 *
 * @param attemptCount - Number of attempts made so far
 * @param hasMoreUpstreams - Whether there are more upstreams to try
 * @param config - The failover configuration
 * @param isAborted - Whether the downstream client has disconnected
 * @returns true if we should continue, false otherwise
 */
export function shouldContinueFailover(
  attemptCount: number,
  hasMoreUpstreams: boolean,
  config: FailoverConfig = DEFAULT_FAILOVER_CONFIG,
  isAborted: boolean = false
): boolean {
  // Stop if downstream client disconnected
  if (isAborted) {
    return false;
  }

  // Stop if no more upstreams available
  if (!hasMoreUpstreams) {
    return false;
  }

  // For exhaust_all strategy, continue as long as there are upstreams
  if (config.strategy === "exhaust_all") {
    return true;
  }

  // For max_attempts strategy, check the limit
  const maxAttempts = config.maxAttempts ?? DEFAULT_FAILOVER_CONFIG.maxAttempts ?? 10;
  return attemptCount < maxAttempts;
}
