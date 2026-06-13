/**
 * In-memory password-change failure rate limiter.
 *
 * Guards `PUT /api/user/password` against an attacker who already holds a valid
 * session token but not the password: the current-password check is a step-up
 * confirmation, so without a limit such an attacker could brute-force the
 * current password online by replaying the endpoint. Wrong-current-password
 * failures are counted per userId over a sliding window; once the threshold is
 * reached, further attempts are rejected until the oldest in-window failure ages
 * out, at which point the counter recovers automatically.
 *
 * This is the authenticated-user sibling of `login-rate-limiter.ts`: because the
 * principal is already resolved, a single stable userId dimension replaces the
 * username+IP pair the unauthenticated login path uses, and it keeps a separate
 * key space so a change-password lockout never spills into login (and vice
 * versa). The same bounded-memory discipline applies — a hard key cap with
 * oldest-first eviction and a periodic, `unref`-ed cleanup timer.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/** Upper bound on distinct tracked userIds before oldest-first eviction kicks in. */
export const MAX_TRACKED_KEYS = 10_000;

interface FailureRecord {
  timestamps: number[];
}

const failures = new Map<string, FailureRecord>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Result of a rate-limit check.
 */
export interface PasswordChangeRateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may retry, present only when `allowed` is false. */
  retryAfterSeconds?: number;
}

/**
 * Drop out-of-window timestamps for a userId and return the surviving ones.
 *
 * @param userId - The tracked user id
 * @param now - The current epoch milliseconds
 * @returns The in-window failure timestamps, oldest first
 */
function pruneRecent(userId: string, now: number): number[] {
  const record = failures.get(userId);
  if (!record) {
    return [];
  }
  const cutoff = now - WINDOW_MS;
  const recent = record.timestamps.filter((timestamp) => timestamp > cutoff);
  if (recent.length === 0) {
    failures.delete(userId);
    return [];
  }
  record.timestamps = recent;
  return recent;
}

/**
 * Return the remaining lock time in milliseconds for a userId, or 0 when not
 * locked.
 *
 * @param userId - The tracked user id
 * @param now - The current epoch milliseconds
 * @returns Remaining lock time in ms, or 0 when not locked
 */
function lockRemainingMs(userId: string, now: number): number {
  const recent = pruneRecent(userId, now);
  if (recent.length < MAX_FAILURES) {
    return 0;
  }
  const oldest = recent[0];
  return Math.max(0, oldest + WINDOW_MS - now);
}

/**
 * Evict the userId whose most recent failure is oldest. Such a key is closest to
 * ageing out anyway, so dropping it under pressure costs the least protection.
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
 * Append a failure timestamp for a userId, enforcing the key-count bound.
 *
 * @param userId - The tracked user id
 * @param now - The current epoch milliseconds
 */
function appendFailure(userId: string, now: number): void {
  const record = failures.get(userId);
  if (record) {
    record.timestamps.push(now);
    return;
  }
  failures.set(userId, { timestamps: [now] });
  if (failures.size > MAX_TRACKED_KEYS) {
    evictOldest();
  }
}

/**
 * Remove every userId whose entire window has elapsed. Invoked periodically by
 * the cleanup timer; also exported for direct invocation in tests.
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
 * Check whether a password-change attempt is allowed for the given user.
 *
 * @param userId - The authenticated user's id
 * @returns Whether the attempt is allowed, plus retry timing when locked
 */
export function checkPasswordChangeRateLimit(userId: string): PasswordChangeRateLimitResult {
  const remaining = lockRemainingMs(userId, Date.now());
  if (remaining > 0) {
    return { allowed: false, retryAfterSeconds: Math.ceil(remaining / 1000) };
  }
  return { allowed: true };
}

/**
 * Record a wrong-current-password failure for a user.
 *
 * @param userId - The authenticated user's id
 */
export function recordPasswordChangeFailure(userId: string): void {
  ensureCleanupTimer();
  appendFailure(userId, Date.now());
}

/**
 * Clear the failure counter after a successful password change.
 *
 * @param userId - The authenticated user's id
 */
export function recordPasswordChangeSuccess(userId: string): void {
  failures.delete(userId);
}

/**
 * Reset all rate-limiter state and stop the cleanup timer. Intended for tests.
 */
export function resetPasswordChangeRateLimiter(): void {
  failures.clear();
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * Current number of distinct tracked userIds. Intended for tests and diagnostics.
 */
export function getTrackedKeyCount(): number {
  return failures.size;
}
