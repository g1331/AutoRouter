import { afterEach, describe, expect, it } from "vitest";

import {
  API_KEY_RATE_LIMIT_WINDOW_MS,
  checkAndRecordApiKeyRateLimit,
  cleanupExpiredApiKeyRateLimits,
  getTrackedApiKeyRateLimitCount,
  recordApiKeyTokenUsage,
  resetApiKeyRateLimiter,
} from "@/lib/services/api-key-rate-limiter";

afterEach(() => {
  resetApiKeyRateLimiter();
});

describe("api-key-rate-limiter", () => {
  it("records admitted requests and rejects the next request at the RPM limit", () => {
    const limits = { rpmLimit: 2, tpmLimit: null };

    expect(checkAndRecordApiKeyRateLimit("key-1", limits, 0)).toEqual({ allowed: true });
    expect(checkAndRecordApiKeyRateLimit("key-1", limits, 1_000)).toEqual({ allowed: true });
    expect(checkAndRecordApiKeyRateLimit("key-1", limits, 2_000)).toEqual({
      allowed: false,
      limitedBy: ["rpm"],
      retryAfterSeconds: 58,
    });
  });

  it("restores RPM admission when the oldest request leaves the sliding window", () => {
    const limits = { rpmLimit: 1, tpmLimit: null };

    expect(checkAndRecordApiKeyRateLimit("key-1", limits, 0)).toEqual({ allowed: true });
    expect(checkAndRecordApiKeyRateLimit("key-1", limits, API_KEY_RATE_LIMIT_WINDOW_MS)).toEqual({
      allowed: true,
    });
  });

  it("uses measured token usage to reject the next request after TPM is exceeded", () => {
    const limits = { rpmLimit: null, tpmLimit: 1_000 };

    recordApiKeyTokenUsage("key-1", 900, limits.tpmLimit, 0);
    expect(checkAndRecordApiKeyRateLimit("key-1", limits, 1_000)).toEqual({ allowed: true });

    recordApiKeyTokenUsage("key-1", 200, limits.tpmLimit, 2_000);
    expect(checkAndRecordApiKeyRateLimit("key-1", limits, 2_000)).toEqual({
      allowed: false,
      limitedBy: ["tpm"],
      retryAfterSeconds: 58,
    });
  });

  it("uses the later recovery time when RPM and TPM both block a request", () => {
    const limits = { rpmLimit: 1, tpmLimit: 100 };

    expect(checkAndRecordApiKeyRateLimit("key-1", limits, 0)).toEqual({ allowed: true });
    recordApiKeyTokenUsage("key-1", 100, limits.tpmLimit, 10_000);

    expect(checkAndRecordApiKeyRateLimit("key-1", limits, 10_001)).toEqual({
      allowed: false,
      limitedBy: ["rpm", "tpm"],
      retryAfterSeconds: 60,
    });
  });

  it("does not track zero or unknown token usage", () => {
    const limits = { rpmLimit: null, tpmLimit: 1 };

    recordApiKeyTokenUsage("key-1", 0, limits.tpmLimit, 0);
    recordApiKeyTokenUsage("key-1", Number.NaN, limits.tpmLimit, 0);

    expect(getTrackedApiKeyRateLimitCount()).toBe(0);
    expect(checkAndRecordApiKeyRateLimit("key-1", limits, 1)).toEqual({ allowed: true });
  });

  it("removes state for unlimited keys and after expiration", () => {
    const limited = { rpmLimit: 1, tpmLimit: null };

    checkAndRecordApiKeyRateLimit("key-1", limited, 0);
    expect(getTrackedApiKeyRateLimitCount()).toBe(1);

    expect(checkAndRecordApiKeyRateLimit("key-1", { rpmLimit: null, tpmLimit: null }, 1)).toEqual({
      allowed: true,
    });
    expect(getTrackedApiKeyRateLimitCount()).toBe(0);

    recordApiKeyTokenUsage("key-2", 10, 10, 0);
    expect(cleanupExpiredApiKeyRateLimits(API_KEY_RATE_LIMIT_WINDOW_MS)).toBe(1);
  });
});
