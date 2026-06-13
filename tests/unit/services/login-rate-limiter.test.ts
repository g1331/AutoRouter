// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkLoginRateLimit,
  recordLoginFailure,
  recordLoginSuccess,
  resetLoginRateLimiter,
  cleanupExpiredFailures,
  getTrackedKeyCount,
  MAX_TRACKED_KEYS,
} from "@/lib/services/login-rate-limiter";

const WINDOW_MS = 15 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

describe("login-rate-limiter", () => {
  beforeEach(() => {
    resetLoginRateLimiter();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    resetLoginRateLimiter();
    vi.useRealTimers();
  });

  it("allows attempts below the username threshold", () => {
    for (let i = 0; i < 4; i += 1) {
      recordLoginFailure("alice", "1.1.1.1");
    }
    expect(checkLoginRateLimit("alice", "1.1.1.1").allowed).toBe(true);
  });

  it("locks a username after reaching the failure threshold", () => {
    for (let i = 0; i < 5; i += 1) {
      recordLoginFailure("alice", "1.1.1.1");
    }
    const result = checkLoginRateLimit("alice", "1.1.1.1");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("blocks any IP for a username once its dimension trips", () => {
    for (let i = 0; i < 5; i += 1) {
      recordLoginFailure("alice", `10.0.0.${i}`);
    }
    // The username accrued 5 failures across distinct IPs; a fresh IP for the
    // same username is still blocked because the username dimension is locked.
    expect(checkLoginRateLimit("alice", "9.9.9.9").allowed).toBe(false);
  });

  it("locks an IP after many failures spread across usernames", () => {
    for (let i = 0; i < 30; i += 1) {
      recordLoginFailure(`user${i}`, "2.2.2.2");
    }
    // Each username has only one failure, but the shared IP reached its threshold.
    expect(checkLoginRateLimit("fresh-user", "2.2.2.2").allowed).toBe(false);
  });

  it("recovers after the sliding window elapses", () => {
    for (let i = 0; i < 5; i += 1) {
      recordLoginFailure("alice", "1.1.1.1");
    }
    expect(checkLoginRateLimit("alice", "1.1.1.1").allowed).toBe(false);
    vi.advanceTimersByTime(WINDOW_MS + 1);
    expect(checkLoginRateLimit("alice", "1.1.1.1").allowed).toBe(true);
  });

  it("clears the username counter on a successful login", () => {
    for (let i = 0; i < 5; i += 1) {
      recordLoginFailure("alice", "1.1.1.1");
    }
    recordLoginSuccess("alice");
    expect(checkLoginRateLimit("alice", "1.1.1.1").allowed).toBe(true);
  });

  it("does not reset the shared IP counter on a successful login", () => {
    // Drive the shared IP dimension to its threshold across many usernames.
    for (let i = 0; i < 30; i += 1) {
      recordLoginFailure(`user${i}`, "2.2.2.2");
    }
    expect(checkLoginRateLimit("fresh", "2.2.2.2").allowed).toBe(false);
    // A successful login on one account must not wipe the IP-wide lockout,
    // otherwise an attacker holding one valid account could reset it at will.
    recordLoginSuccess("user0");
    expect(checkLoginRateLimit("fresh", "2.2.2.2").allowed).toBe(false);
  });

  it("bounds the number of tracked keys under a flood of unique pairs", () => {
    // Each call adds two distinct keys (user + ip); push well past the cap.
    const pairs = Math.ceil(MAX_TRACKED_KEYS / 2) + 10;
    for (let i = 0; i < pairs; i += 1) {
      recordLoginFailure(`user-${i}`, `ip-${i}`);
    }
    expect(getTrackedKeyCount()).toBeLessThanOrEqual(MAX_TRACKED_KEYS);
  });

  it("reclaims expired keys via the periodic cleanup timer", () => {
    recordLoginFailure("alice", "1.1.1.1");
    expect(getTrackedKeyCount()).toBe(2);
    // Advancing past the window plus a cleanup tick lets the timer sweep them.
    vi.advanceTimersByTime(WINDOW_MS + CLEANUP_INTERVAL_MS);
    expect(getTrackedKeyCount()).toBe(0);
  });

  it("cleanupExpiredFailures removes only fully-expired keys", () => {
    recordLoginFailure("alice", "1.1.1.1");
    expect(cleanupExpiredFailures()).toBe(0);
    expect(getTrackedKeyCount()).toBe(2);
    vi.setSystemTime(new Date("2024-01-01T00:16:00.000Z"));
    expect(cleanupExpiredFailures()).toBe(2);
    expect(getTrackedKeyCount()).toBe(0);
  });
});
