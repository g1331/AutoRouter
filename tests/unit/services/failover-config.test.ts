import { describe, it, expect } from "vitest";
import {
  DEFAULT_FAILOVER_CONFIG,
  shouldTriggerFailover,
  shouldContinueFailover,
  type FailoverConfig,
} from "@/lib/services/failover-config";

describe("Failover Config", () => {
  describe("DEFAULT_FAILOVER_CONFIG", () => {
    it("should use exhaust_all strategy by default", () => {
      expect(DEFAULT_FAILOVER_CONFIG.strategy).toBe("exhaust_all");
    });

    it("should have a fallback maxAttempts", () => {
      expect(DEFAULT_FAILOVER_CONFIG.maxAttempts).toBe(10);
    });

    it("should have empty excludeStatusCodes by default", () => {
      expect(DEFAULT_FAILOVER_CONFIG.excludeStatusCodes).toEqual([]);
    });
  });

  describe("shouldTriggerFailover", () => {
    describe("with default config", () => {
      it("should NOT trigger failover for 2xx responses", () => {
        expect(shouldTriggerFailover(200)).toBe(false);
        expect(shouldTriggerFailover(201)).toBe(false);
        expect(shouldTriggerFailover(204)).toBe(false);
        expect(shouldTriggerFailover(299)).toBe(false);
      });

      it("should trigger failover for 4xx responses", () => {
        expect(shouldTriggerFailover(400)).toBe(true);
        expect(shouldTriggerFailover(401)).toBe(true);
        expect(shouldTriggerFailover(403)).toBe(true);
        expect(shouldTriggerFailover(404)).toBe(true);
        expect(shouldTriggerFailover(429)).toBe(true);
      });

      it("should trigger failover for 5xx responses", () => {
        expect(shouldTriggerFailover(500)).toBe(true);
        expect(shouldTriggerFailover(502)).toBe(true);
        expect(shouldTriggerFailover(503)).toBe(true);
        expect(shouldTriggerFailover(504)).toBe(true);
      });

      it("should trigger failover for 3xx responses", () => {
        expect(shouldTriggerFailover(301)).toBe(true);
        expect(shouldTriggerFailover(302)).toBe(true);
      });
    });

    describe("with excludeStatusCodes", () => {
      const configWithExclusions: FailoverConfig = {
        strategy: "exhaust_all",
        excludeStatusCodes: [400, 404],
      };

      it("should NOT trigger failover for excluded status codes", () => {
        expect(shouldTriggerFailover(400, configWithExclusions)).toBe(false);
        expect(shouldTriggerFailover(404, configWithExclusions)).toBe(false);
      });

      it("should still trigger failover for non-excluded error codes", () => {
        expect(shouldTriggerFailover(401, configWithExclusions)).toBe(true);
        expect(shouldTriggerFailover(500, configWithExclusions)).toBe(true);
      });

      it("should still NOT trigger failover for 2xx responses", () => {
        expect(shouldTriggerFailover(200, configWithExclusions)).toBe(false);
      });
    });
  });

  describe("shouldContinueFailover", () => {
    describe("with exhaust_all strategy", () => {
      const exhaustAllConfig: FailoverConfig = {
        strategy: "exhaust_all",
      };

      it("should continue if there are more upstreams", () => {
        expect(shouldContinueFailover(0, true, exhaustAllConfig)).toBe(true);
        expect(shouldContinueFailover(5, true, exhaustAllConfig)).toBe(true);
        expect(shouldContinueFailover(100, true, exhaustAllConfig)).toBe(true);
      });

      it("should stop if no more upstreams available", () => {
        expect(shouldContinueFailover(0, false, exhaustAllConfig)).toBe(false);
        expect(shouldContinueFailover(5, false, exhaustAllConfig)).toBe(false);
      });

      it("should stop if client disconnected", () => {
        expect(shouldContinueFailover(0, true, exhaustAllConfig, true)).toBe(false);
      });
    });

    describe("with max_attempts strategy", () => {
      const maxAttemptsConfig: FailoverConfig = {
        strategy: "max_attempts",
        maxAttempts: 3,
      };

      it("should continue if under max attempts and upstreams available", () => {
        expect(shouldContinueFailover(0, true, maxAttemptsConfig)).toBe(true);
        expect(shouldContinueFailover(1, true, maxAttemptsConfig)).toBe(true);
        expect(shouldContinueFailover(2, true, maxAttemptsConfig)).toBe(true);
      });

      it("should stop when max attempts reached", () => {
        expect(shouldContinueFailover(3, true, maxAttemptsConfig)).toBe(false);
        expect(shouldContinueFailover(4, true, maxAttemptsConfig)).toBe(false);
      });

      it("should stop if no more upstreams even under max attempts", () => {
        expect(shouldContinueFailover(1, false, maxAttemptsConfig)).toBe(false);
      });

      it("should stop if client disconnected", () => {
        expect(shouldContinueFailover(0, true, maxAttemptsConfig, true)).toBe(false);
      });
    });

    describe("with default config", () => {
      it("should use default maxAttempts when not specified", () => {
        const configWithoutMax: FailoverConfig = {
          strategy: "max_attempts",
        };
        // Default maxAttempts is 10
        expect(shouldContinueFailover(9, true, configWithoutMax)).toBe(true);
        expect(shouldContinueFailover(10, true, configWithoutMax)).toBe(false);
      });
    });
  });
});
