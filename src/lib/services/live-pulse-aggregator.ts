/**
 * In-process rolling-window aggregator for the live pulse status bar.
 *
 * Samples are taken when a request is finalized (terminal status with known
 * duration and token usage). The window covers the most recent 60 seconds and
 * is kept as per-second buckets so pruning expired samples is cheap. The window
 * is exactly 60 seconds wide, so raw counts over the window equal per-minute
 * rates without any extra scaling.
 *
 * This is intentionally process-local, mirroring the existing in-process
 * request-log live updates: each instance reflects its own traffic.
 */

const WINDOW_SECONDS = 60;
const WINDOW_MS = WINDOW_SECONDS * 1000;

export interface PulseSample {
  /** Terminal HTTP status code; null is treated as a non-2xx (error) sample. */
  statusCode: number | null;
  /** Total processing duration in milliseconds; only counted for successful requests. */
  durationMs: number | null;
  /** Total token usage for the request. */
  totalTokens: number | null;
  /** Epoch milliseconds when the request finalized. Defaults to now. */
  occurredAt?: number;
}

export interface PulseWindowSnapshot {
  /** Requests finalized within the last 60 seconds (equals requests per minute). */
  requestsPerMinute: number;
  /** Share of non-2xx requests within the window, as a percentage (0-100). */
  errorRatePct: number;
  /** Average processing duration of successful requests in the window, in milliseconds. */
  avgLatencyMs: number;
  /** Token usage finalized within the last 60 seconds (equals tokens per minute). */
  tokensPerMinute: number;
  /** Total requests counted in the window (window denominator). */
  sampleCount: number;
  /** Rolling window width in seconds. */
  windowSeconds: number;
}

interface PulseBucket {
  count: number;
  errorCount: number;
  successCount: number;
  successDurationSumMs: number;
  tokenSum: number;
}

const buckets = new Map<number, PulseBucket>();

function isSuccessStatus(statusCode: number | null): boolean {
  return statusCode !== null && statusCode >= 200 && statusCode <= 299;
}

function bucketKeyFor(epochMs: number): number {
  return Math.floor(epochMs / 1000);
}

/**
 * Remove buckets whose second has fallen out of the rolling window relative to now.
 */
function pruneExpiredBuckets(nowMs: number): void {
  const minKey = bucketKeyFor(nowMs - WINDOW_MS);
  for (const key of buckets.keys()) {
    if (key < minKey) {
      buckets.delete(key);
    }
  }
}

/**
 * Record a finalized request as a rolling-window sample.
 */
export function recordPulseSample(sample: PulseSample): void {
  const occurredAt = sample.occurredAt ?? Date.now();
  const key = bucketKeyFor(occurredAt);

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { count: 0, errorCount: 0, successCount: 0, successDurationSumMs: 0, tokenSum: 0 };
    buckets.set(key, bucket);
  }

  bucket.count += 1;

  if (isSuccessStatus(sample.statusCode)) {
    bucket.successCount += 1;
    if (sample.durationMs !== null && sample.durationMs >= 0) {
      bucket.successDurationSumMs += sample.durationMs;
    }
  } else {
    bucket.errorCount += 1;
  }

  if (sample.totalTokens !== null && sample.totalTokens > 0) {
    bucket.tokenSum += sample.totalTokens;
  }

  pruneExpiredBuckets(occurredAt);
}

/**
 * Compute the rolling-window snapshot for the most recent 60 seconds.
 */
export function getPulseWindowSnapshot(nowMs: number = Date.now()): PulseWindowSnapshot {
  pruneExpiredBuckets(nowMs);

  const minKey = bucketKeyFor(nowMs - WINDOW_MS);

  let count = 0;
  let errorCount = 0;
  let successCount = 0;
  let successDurationSumMs = 0;
  let tokenSum = 0;

  for (const [key, bucket] of buckets) {
    if (key < minKey) {
      continue;
    }
    count += bucket.count;
    errorCount += bucket.errorCount;
    successCount += bucket.successCount;
    successDurationSumMs += bucket.successDurationSumMs;
    tokenSum += bucket.tokenSum;
  }

  const errorRatePct = count > 0 ? Math.round((errorCount / count) * 100 * 10) / 10 : 0;
  const avgLatencyMs =
    successCount > 0 ? Math.round((successDurationSumMs / successCount) * 10) / 10 : 0;

  return {
    requestsPerMinute: count,
    errorRatePct,
    avgLatencyMs,
    tokensPerMinute: tokenSum,
    sampleCount: count,
    windowSeconds: WINDOW_SECONDS,
  };
}

/**
 * Clear all rolling-window state. Intended for tests.
 */
export function resetPulseWindow(): void {
  buckets.clear();
}
