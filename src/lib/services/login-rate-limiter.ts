/**
 * In-memory login failure rate limiter.
 *
 * Guards `POST /api/auth/login` against online credential stuffing and the CPU
 * amplification of running bcrypt for every attempt. Failures are counted per
 * username and per source IP over a sliding window; once either dimension
 * reaches its threshold, further attempts are rejected until the oldest in-window
 * failure ages out, at which point the dimension recovers automatically.
 *
 * This first implementation is a single-process memory counter, matching the
 * design decision that the codebase has no shared rate-limiting middleware yet.
 * The rate-limiting requirement itself is fixed in the spec as a MUST, so a
 * distributed backend can replace this module later without changing callers.
 *
 * Memory is kept bounded the same way the other long-lived in-memory structures
 * in this repo are (see `session-affinity.ts`): a hard key cap with oldest-first
 * eviction guards against a flood of unique username/IP keys, and a periodic,
 * `unref`-ed cleanup timer reclaims fully-expired keys. Without these, an
 * attacker rotating random usernames and forged `x-forwarded-for` values could
 * inject keys that never trip a threshold yet never get reclaimed.
 */

const WINDOW_MS = 15 * 60 * 1000;
const USERNAME_MAX_FAILURES = 5;
const IP_MAX_FAILURES = 30;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/** Upper bound on distinct tracked keys before oldest-first eviction kicks in. */
export const MAX_TRACKED_KEYS = 10_000;

interface FailureRecord {
  timestamps: number[];
}

const failures = new Map<string, FailureRecord>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Result of a rate-limit check.
 */
export interface LoginRateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may retry, present only when `allowed` is false. */
  retryAfterSeconds?: number;
}

/**
 * Drop out-of-window timestamps for a key and return the surviving ones.
 *
 * @param key - The dimension key (`user:<name>` or `ip:<addr>`)
 * @param now - The current epoch milliseconds
 * @returns The in-window failure timestamps, oldest first
 */
function pruneRecent(key: string, now: number): number[] {
  const record = failures.get(key);
  if (!record) {
    return [];
  }
  const cutoff = now - WINDOW_MS;
  const recent = record.timestamps.filter((timestamp) => timestamp > cutoff);
  if (recent.length === 0) {
    failures.delete(key);
    return [];
  }
  record.timestamps = recent;
  return recent;
}

/**
 * Evaluate one dimension and return the remaining lock time in milliseconds.
 *
 * @param key - The dimension key
 * @param max - The failure threshold for the dimension
 * @param now - The current epoch milliseconds
 * @returns Remaining lock time in ms, or 0 when not locked
 */
function lockRemainingMs(key: string, max: number, now: number): number {
  const recent = pruneRecent(key, now);
  if (recent.length < max) {
    return 0;
  }
  const oldest = recent[0];
  return Math.max(0, oldest + WINDOW_MS - now);
}

/**
 * Evict the key whose most recent failure is oldest. Such a key is the closest
 * to ageing out anyway, so dropping it under pressure costs the least protection.
 */
function evictOldest(): void {
  let oldestKey: string | null = null;
  let oldestTimestamp = Infinity;
  for (const [key, record] of failures) {
    const latest = record.timestamps[record.timestamps.length - 1];
    if (latest < oldestTimestamp) {
      oldestTimestamp = latest;
      oldestKey = key;
    }
  }
  if (oldestKey !== null) {
    failures.delete(oldestKey);
  }
}

/**
 * Append a failure timestamp for a key, enforcing the key-count bound.
 *
 * @param key - The dimension key
 * @param now - The current epoch milliseconds
 */
function appendFailure(key: string, now: number): void {
  const record = failures.get(key);
  if (record) {
    record.timestamps.push(now);
    return;
  }
  failures.set(key, { timestamps: [now] });
  if (failures.size > MAX_TRACKED_KEYS) {
    evictOldest();
  }
}

/**
 * Remove every key whose entire window has elapsed. Invoked periodically by the
 * cleanup timer; also exported for direct invocation in tests and diagnostics.
 *
 * @returns The number of keys removed
 */
export function cleanupExpiredFailures(): number {
  const now = Date.now();
  const before = failures.size;
  for (const key of [...failures.keys()]) {
    pruneRecent(key, now);
  }
  return before - failures.size;
}

/**
 * Lazily start the periodic cleanup timer on first recorded failure. The timer
 * is `unref`-ed so it never keeps the process alive on its own.
 */
function ensureCleanupTimer(): void {
  if (cleanupTimer) {
    return;
  }
  cleanupTimer = setInterval(cleanupExpiredFailures, CLEANUP_INTERVAL_MS);
  if (typeof cleanupTimer.unref === "function") {
    cleanupTimer.unref();
  }
}

/**
 * Check whether a login attempt is allowed for the given username and IP.
 *
 * @param username - The normalized username being attempted
 * @param ip - The source IP of the request
 * @returns Whether the attempt is allowed, plus retry timing when locked
 */
export function checkLoginRateLimit(username: string, ip: string): LoginRateLimitResult {
  const now = Date.now();
  const userLock = lockRemainingMs(`user:${username}`, USERNAME_MAX_FAILURES, now);
  const ipLock = lockRemainingMs(`ip:${ip}`, IP_MAX_FAILURES, now);
  const remaining = Math.max(userLock, ipLock);
  if (remaining > 0) {
    return { allowed: false, retryAfterSeconds: Math.ceil(remaining / 1000) };
  }
  return { allowed: true };
}

/**
 * Record a failed login attempt against both the username and IP dimensions.
 *
 * @param username - The normalized username that failed
 * @param ip - The source IP of the request
 */
export function recordLoginFailure(username: string, ip: string): void {
  ensureCleanupTimer();
  const now = Date.now();
  appendFailure(`user:${username}`, now);
  appendFailure(`ip:${ip}`, now);
}

/**
 * Clear the failure counters for a username and IP after a successful login.
 *
 * @param username - The normalized username that succeeded
 * @param ip - The source IP of the request
 */
export function recordLoginSuccess(username: string, ip: string): void {
  failures.delete(`user:${username}`);
  failures.delete(`ip:${ip}`);
}

/**
 * Reset all rate-limiter state and stop the cleanup timer. Intended for tests.
 */
export function resetLoginRateLimiter(): void {
  failures.clear();
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * Current number of distinct tracked keys. Intended for tests and diagnostics.
 */
export function getTrackedKeyCount(): number {
  return failures.size;
}
