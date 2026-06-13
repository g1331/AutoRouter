// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkPasswordChangeRateLimit,
  recordPasswordChangeFailure,
  recordPasswordChangeSuccess,
  resetPasswordChangeRateLimiter,
  cleanupExpiredFailures,
  getTrackedKeyCount,
  MAX_TRACKED_KEYS,
} from "@/lib/services/password-change-rate-limiter";

const WINDOW_MS = 15 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

describe("password-change-rate-limiter", () => {
  beforeEach(() => {
    resetPasswordChangeRateLimiter();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    resetPasswordChangeRateLimiter();
    vi.useRealTimers();
  });

  it("allows attempts below the failure threshold", () => {
    for (let i = 0; i < 4; i += 1) {
      recordPasswordChangeFailure("user-1");
    }
    expect(checkPasswordChangeRateLimit("user-1").allowed).toBe(true);
  });

  it("locks a user after reaching the failure threshold", () => {
    for (let i = 0; i < 5; i += 1) {
      recordPasswordChangeFailure("user-1");
    }
    const result = checkPasswordChangeRateLimit("user-1");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("isolates the counter per user", () => {
    for (let i = 0; i < 5; i += 1) {
      recordPasswordChangeFailure("user-1");
    }
    // A different user is unaffected by user-1's lockout.
    expect(checkPasswordChangeRateLimit("user-2").allowed).toBe(true);
  });

  it("recovers after the sliding window elapses", () => {
    for (let i = 0; i < 5; i += 1) {
      recordPasswordChangeFailure("user-1");
    }
    expect(checkPasswordChangeRateLimit("user-1").allowed).toBe(false);
    vi.advanceTimersByTime(WINDOW_MS + 1);
    expect(checkPasswordChangeRateLimit("user-1").allowed).toBe(true);
  });

  it("clears the counter on a successful change", () => {
    for (let i = 0; i < 5; i += 1) {
      recordPasswordChangeFailure("user-1");
    }
    recordPasswordChangeSuccess("user-1");
    expect(checkPasswordChangeRateLimit("user-1").allowed).toBe(true);
  });

  it("bounds the number of tracked keys under a flood of unique users", () => {
    const total = MAX_TRACKED_KEYS + 10;
    for (let i = 0; i < total; i += 1) {
      recordPasswordChangeFailure(`user-${i}`);
    }
    expect(getTrackedKeyCount()).toBeLessThanOrEqual(MAX_TRACKED_KEYS);
  });

  it("reclaims expired keys via the periodic cleanup timer", () => {
    recordPasswordChangeFailure("user-1");
    expect(getTrackedKeyCount()).toBe(1);
    vi.advanceTimersByTime(WINDOW_MS + CLEANUP_INTERVAL_MS);
    expect(getTrackedKeyCount()).toBe(0);
  });

  it("cleanupExpiredFailures removes only fully-expired keys", () => {
    recordPasswordChangeFailure("user-1");
    expect(cleanupExpiredFailures()).toBe(0);
    expect(getTrackedKeyCount()).toBe(1);
    vi.setSystemTime(new Date("2024-01-01T00:16:00.000Z"));
    expect(cleanupExpiredFailures()).toBe(1);
    expect(getTrackedKeyCount()).toBe(0);
  });
});
