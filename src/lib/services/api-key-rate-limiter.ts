import type { ApiKeyRateLimits } from "./api-key-rate-limits";

export const API_KEY_RATE_LIMIT_WINDOW_MS = 60_000;
const CLEANUP_INTERVAL_MS = 5 * 60_000;

/**
 * The per-process tracker must remain bounded even if a deployment has many
 * valid keys. This is deliberately aligned with the existing login limiter's
 * scale guard rather than turning rate limiting into an unbounded cache.
 */
export const MAX_TRACKED_API_KEYS = 10_000;

export type ApiKeyRateLimitDimension = "rpm" | "tpm";

export type ApiKeyRateLimitCheckResult =
  | { allowed: true }
  | {
      allowed: false;
      limitedBy: ApiKeyRateLimitDimension[];
      retryAfterSeconds: number;
    };

interface TokenUsageEvent {
  timestamp: number;
  tokens: number;
}

interface ApiKeyRateLimitState {
  requestTimestamps: number[];
  tokenEvents: TokenUsageEvent[];
  lastActivityAt: number;
}

const states = new Map<string, ApiKeyRateLimitState>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function pruneState(state: ApiKeyRateLimitState, now: number): void {
  const cutoff = now - API_KEY_RATE_LIMIT_WINDOW_MS;
  state.requestTimestamps = state.requestTimestamps.filter((timestamp) => timestamp > cutoff);
  state.tokenEvents = state.tokenEvents.filter((event) => event.timestamp > cutoff);
}

function hasTrackedEvents(state: ApiKeyRateLimitState): boolean {
  return state.requestTimestamps.length > 0 || state.tokenEvents.length > 0;
}

function evictOldestState(): void {
  let oldestKey: string | null = null;
  let oldestActivityAt = Infinity;

  for (const [key, state] of states) {
    if (state.lastActivityAt < oldestActivityAt) {
      oldestKey = key;
      oldestActivityAt = state.lastActivityAt;
    }
  }

  if (oldestKey !== null) {
    states.delete(oldestKey);
  }
}

function ensureState(apiKeyId: string, now: number): ApiKeyRateLimitState {
  const existing = states.get(apiKeyId);
  if (existing) {
    existing.lastActivityAt = now;
    return existing;
  }

  const state: ApiKeyRateLimitState = {
    requestTimestamps: [],
    tokenEvents: [],
    lastActivityAt: now,
  };
  states.set(apiKeyId, state);

  if (states.size > MAX_TRACKED_API_KEYS) {
    evictOldestState();
  }

  return state;
}

function ensureCleanupTimer(): void {
  if (cleanupTimer) {
    return;
  }

  cleanupTimer = setInterval(cleanupExpiredApiKeyRateLimits, CLEANUP_INTERVAL_MS);
  if (typeof cleanupTimer.unref === "function") {
    cleanupTimer.unref();
  }
}

function toRetryAfterSeconds(expiryTimestamp: number, now: number): number {
  return Math.max(1, Math.ceil((expiryTimestamp - now) / 1_000));
}

function getRpmRetryAfterSeconds(
  requestTimestamps: number[],
  rpmLimit: number,
  now: number
): number | null {
  if (requestTimestamps.length < rpmLimit) {
    return null;
  }

  // If the configured limit was lowered while more requests remain in the
  // window, several timestamps must expire before the count is below limit.
  const expiryTimestamp =
    requestTimestamps[requestTimestamps.length - rpmLimit] + API_KEY_RATE_LIMIT_WINDOW_MS;
  return toRetryAfterSeconds(expiryTimestamp, now);
}

function getTpmRetryAfterSeconds(
  tokenEvents: TokenUsageEvent[],
  tpmLimit: number,
  now: number
): number | null {
  const totalTokens = tokenEvents.reduce((total, event) => total + event.tokens, 0);
  if (totalTokens < tpmLimit) {
    return null;
  }

  let remainingTokens = totalTokens;
  for (const event of tokenEvents) {
    remainingTokens -= event.tokens;
    if (remainingTokens < tpmLimit) {
      return toRetryAfterSeconds(event.timestamp + API_KEY_RATE_LIMIT_WINDOW_MS, now);
    }
  }

  // Token events are positive, so the loop always returns when totalTokens is
  // at or above the limit. Keep a defensive fallback for malformed state.
  return 1;
}

/**
 * Atomically evaluate a key's currently known token usage and request rate,
 * then append the admitted request to the RPM window. This function is
 * synchronous by design: callers must not insert an await between checking and
 * recording, which preserves in-process admission semantics.
 */
export function checkAndRecordApiKeyRateLimit(
  apiKeyId: string,
  limits: ApiKeyRateLimits,
  now: number = Date.now()
): ApiKeyRateLimitCheckResult {
  let state = states.get(apiKeyId);
  if (state) {
    pruneState(state, now);

    if (limits.rpmLimit == null) {
      state.requestTimestamps = [];
    }
    if (limits.tpmLimit == null) {
      state.tokenEvents = [];
    }

    if (!hasTrackedEvents(state)) {
      states.delete(apiKeyId);
      state = undefined;
    } else {
      state.lastActivityAt = now;
    }
  }

  if (limits.rpmLimit == null && limits.tpmLimit == null) {
    return { allowed: true };
  }

  const limitedBy: ApiKeyRateLimitDimension[] = [];
  const retryAfterSeconds: number[] = [];

  if (limits.rpmLimit != null) {
    const retryAfter = getRpmRetryAfterSeconds(
      state?.requestTimestamps ?? [],
      limits.rpmLimit,
      now
    );
    if (retryAfter !== null) {
      limitedBy.push("rpm");
      retryAfterSeconds.push(retryAfter);
    }
  }

  if (limits.tpmLimit != null) {
    const retryAfter = getTpmRetryAfterSeconds(state?.tokenEvents ?? [], limits.tpmLimit, now);
    if (retryAfter !== null) {
      limitedBy.push("tpm");
      retryAfterSeconds.push(retryAfter);
    }
  }

  if (limitedBy.length > 0) {
    return {
      allowed: false,
      limitedBy,
      retryAfterSeconds: Math.max(...retryAfterSeconds),
    };
  }

  if (limits.rpmLimit != null) {
    state = state ?? ensureState(apiKeyId, now);
    state.requestTimestamps.push(now);
    state.lastActivityAt = now;
    ensureCleanupTimer();
  }

  return { allowed: true };
}

/**
 * Add actual response usage to the TPM window. The proxy calls this only after
 * a response has reported usage; unknown, zero, or malformed totals are not
 * estimated or retained.
 */
export function recordApiKeyTokenUsage(
  apiKeyId: string,
  totalTokens: number,
  tpmLimit: number | null,
  now: number = Date.now()
): void {
  const state = states.get(apiKeyId);

  if (tpmLimit == null) {
    if (!state) {
      return;
    }

    pruneState(state, now);
    state.tokenEvents = [];
    if (!hasTrackedEvents(state)) {
      states.delete(apiKeyId);
    }
    return;
  }

  if (!Number.isSafeInteger(totalTokens) || totalTokens <= 0) {
    return;
  }

  const nextState = state ?? ensureState(apiKeyId, now);
  pruneState(nextState, now);
  nextState.tokenEvents.push({ timestamp: now, tokens: totalTokens });
  nextState.lastActivityAt = now;
  ensureCleanupTimer();
}

/**
 * Remove states whose complete sliding window has expired.
 *
 * @returns Number of API key states removed.
 */
export function cleanupExpiredApiKeyRateLimits(now: number = Date.now()): number {
  const before = states.size;

  for (const [apiKeyId, state] of states) {
    pruneState(state, now);
    if (!hasTrackedEvents(state)) {
      states.delete(apiKeyId);
    }
  }

  return before - states.size;
}

/** Reset all in-memory state and timers. Intended for tests. */
export function resetApiKeyRateLimiter(): void {
  states.clear();
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/** Number of active API Key window states, for tests and diagnostics. */
export function getTrackedApiKeyRateLimitCount(): number {
  return states.size;
}
