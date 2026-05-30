import { beforeEach, describe, expect, it, vi } from "vitest";

import { CircuitBreakerStateEnum } from "@/lib/services/circuit-breaker";
import type { CircuitBreakerStatus, HealthStatus } from "@/lib/services/health-checker";

const { getAllHealthStatusWithCircuitBreakerMock } = vi.hoisted(() => ({
  getAllHealthStatusWithCircuitBreakerMock: vi.fn(),
}));

vi.mock("@/lib/services/health-checker", () => ({
  getAllHealthStatusWithCircuitBreaker: getAllHealthStatusWithCircuitBreakerMock,
}));

import { getLivePulseSnapshot, summarizeGatewayHealth } from "@/lib/services/live-pulse-service";
import { recordPulseSample, resetPulseWindow } from "@/lib/services/live-pulse-aggregator";

function makeStatus(isHealthy: boolean, state?: CircuitBreakerStateEnum): HealthStatus {
  return {
    upstreamId: "u",
    upstreamName: "n",
    isHealthy,
    lastCheckAt: null,
    lastSuccessAt: null,
    failureCount: 0,
    latencyMs: null,
    errorMessage: null,
    circuitBreaker: state ? ({ state } as unknown as CircuitBreakerStatus) : null,
  };
}

const BASE = 1_000_000_000_000;

describe("live-pulse-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPulseWindow();
  });

  describe("summarizeGatewayHealth", () => {
    it("counts healthy upstreams and open breakers, never counting open/half-open as closed", () => {
      const result = summarizeGatewayHealth([
        makeStatus(true, CircuitBreakerStateEnum.CLOSED),
        makeStatus(true, CircuitBreakerStateEnum.HALF_OPEN),
        makeStatus(false, CircuitBreakerStateEnum.OPEN),
        makeStatus(false, CircuitBreakerStateEnum.OPEN),
      ]);

      expect(result).toEqual({
        healthyUpstreams: 2,
        totalUpstreams: 4,
        openCircuitBreakers: 2,
      });
    });

    it("treats missing circuit breaker info as not open", () => {
      const result = summarizeGatewayHealth([makeStatus(true), makeStatus(false)]);

      expect(result).toEqual({
        healthyUpstreams: 1,
        totalUpstreams: 2,
        openCircuitBreakers: 0,
      });
    });
  });

  describe("getLivePulseSnapshot", () => {
    it("merges rolling-window metrics with gateway health counts", async () => {
      recordPulseSample({ statusCode: 200, durationMs: 100, totalTokens: 10, occurredAt: BASE });
      recordPulseSample({
        statusCode: 500,
        durationMs: 50,
        totalTokens: 0,
        occurredAt: BASE + 1_000,
      });

      getAllHealthStatusWithCircuitBreakerMock.mockResolvedValue([
        makeStatus(true, CircuitBreakerStateEnum.CLOSED),
        makeStatus(false, CircuitBreakerStateEnum.OPEN),
      ]);

      const snapshot = await getLivePulseSnapshot(BASE + 1_000);

      expect(snapshot.requestsPerMinute).toBe(2);
      expect(snapshot.errorRatePct).toBe(50);
      expect(snapshot.avgLatencyMs).toBe(100);
      expect(snapshot.gateway).toEqual({
        healthyUpstreams: 1,
        totalUpstreams: 2,
        openCircuitBreakers: 1,
      });
      expect(snapshot.generatedAt).toBe(new Date(BASE + 1_000).toISOString());
    });

    it("degrades to zeroed gateway health when the health lookup fails", async () => {
      recordPulseSample({ statusCode: 200, durationMs: 100, totalTokens: 10, occurredAt: BASE });
      getAllHealthStatusWithCircuitBreakerMock.mockRejectedValue(new Error("db down"));

      const snapshot = await getLivePulseSnapshot(BASE);

      expect(snapshot.requestsPerMinute).toBe(1);
      expect(snapshot.gateway).toEqual({
        healthyUpstreams: 0,
        totalUpstreams: 0,
        openCircuitBreakers: 0,
      });
    });
  });
});
