import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock db – the load-balancer uses `db.query.upstreams.findMany`
const mockFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      upstreams: { findMany: (...args: unknown[]) => mockFindMany(...args) },
    },
  },
  upstreams: {
    id: "id",
    providerType: "providerType",
    isActive: "isActive",
    priority: "priority",
  },
}));

// Mock circuit-breaker – load-balancer calls `getCircuitBreakerState`
const mockGetCircuitBreakerState = vi.fn();
vi.mock("@/lib/services/circuit-breaker", () => ({
  getCircuitBreakerState: (...args: unknown[]) => mockGetCircuitBreakerState(...args),
  CircuitBreakerStateEnum: {
    CLOSED: "closed",
    OPEN: "open",
    HALF_OPEN: "half_open",
  },
}));

// Import after mocks are registered
import {
  selectFromProviderType,
  NoHealthyUpstreamsError,
  resetConnectionCounts,
  recordConnection,
  releaseConnection,
  getConnectionCount,
} from "@/lib/services/load-balancer";

// ---------------------------------------------------------------------------
// Helpers – mock upstream factory
// ---------------------------------------------------------------------------

let idCounter = 0;

interface MockUpstreamOpts {
  id?: string;
  name?: string;
  providerType?: string;
  priority?: number;
  weight?: number;
  isActive?: boolean;
  isHealthy?: boolean;
  cbState?: "closed" | "open" | "half_open";
}

function makeUpstream(opts: MockUpstreamOpts = {}) {
  idCounter += 1;
  const id = opts.id ?? `upstream-${idCounter}`;
  return {
    id,
    name: opts.name ?? `upstream-${idCounter}`,
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKeyEncrypted: "encrypted-key",
    isDefault: false,
    timeout: 60,
    isActive: opts.isActive ?? true,
    config: null,
    weight: opts.weight ?? 1,
    priority: opts.priority ?? 0,
    providerType: opts.providerType ?? "openai",
    allowedModels: null,
    modelRedirects: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    health:
      opts.isHealthy === false
        ? { isHealthy: false, latencyMs: null }
        : { isHealthy: true, latencyMs: 100 },
  };
}

/**
 * Helper: configure `mockGetCircuitBreakerState` so that specific upstream IDs
 * return an OPEN circuit breaker, while all others return CLOSED.
 */
function setCBOpen(...openIds: string[]) {
  mockGetCircuitBreakerState.mockImplementation(async (upstreamId: string) => {
    if (openIds.includes(upstreamId)) {
      return {
        id: "cb-1",
        upstreamId,
        state: "open",
        failureCount: 5,
        successCount: 0,
        lastFailureAt: new Date(),
        openedAt: new Date(),
        lastProbeAt: null,
        config: null,
      };
    }
    return {
      id: "cb-2",
      upstreamId,
      state: "closed",
      failureCount: 0,
      successCount: 0,
      lastFailureAt: null,
      openedAt: null,
      lastProbeAt: null,
      config: null,
    };
  });
}

function setCBAllClosed() {
  mockGetCircuitBreakerState.mockResolvedValue({
    id: "cb-1",
    upstreamId: "any",
    state: "closed",
    failureCount: 0,
    successCount: 0,
    lastFailureAt: null,
    openedAt: null,
    lastProbeAt: null,
    config: null,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("load-balancer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idCounter = 0;
    // Reset connectionCounts map between tests
    resetConnectionCounts();
    setCBAllClosed();
  });

  // =========================================================================
  // selectFromProviderType – basic selection
  // =========================================================================
  describe("selectFromProviderType", () => {
    it("should select an upstream of the given provider type", async () => {
      const u1 = makeUpstream({ id: "u1", providerType: "openai", priority: 0 });
      mockFindMany.mockResolvedValue([u1]);

      const result = await selectFromProviderType("openai");

      expect(result.upstream.id).toBe("u1");
      expect(result.selectedTier).toBe(0);
    });

    it("should throw NoHealthyUpstreamsError when no upstreams exist", async () => {
      mockFindMany.mockResolvedValue([]);

      await expect(selectFromProviderType("openai")).rejects.toThrow(NoHealthyUpstreamsError);
    });

    it("should throw NoHealthyUpstreamsError when all upstreams are unhealthy", async () => {
      const u1 = makeUpstream({ id: "u1", isHealthy: false });
      const u2 = makeUpstream({ id: "u2", isHealthy: false });
      mockFindMany.mockResolvedValue([u1, u2]);

      await expect(selectFromProviderType("openai")).rejects.toThrow(NoHealthyUpstreamsError);
    });

    it("should throw NoHealthyUpstreamsError when all upstreams are circuit-broken", async () => {
      const u1 = makeUpstream({ id: "u1" });
      const u2 = makeUpstream({ id: "u2" });
      mockFindMany.mockResolvedValue([u1, u2]);
      setCBOpen("u1", "u2");

      await expect(selectFromProviderType("openai")).rejects.toThrow(NoHealthyUpstreamsError);
    });

    // =========================================================================
    // Tiered routing (priority-based)
    // =========================================================================
    describe("tiered routing", () => {
      it("should prefer tier 0 (lowest priority number) upstreams", async () => {
        const p0 = makeUpstream({ id: "p0", priority: 0, weight: 1 });
        const p1 = makeUpstream({ id: "p1", priority: 1, weight: 1 });
        mockFindMany.mockResolvedValue([p0, p1]);

        // Run multiple times – should always pick p0
        for (let i = 0; i < 10; i++) {
          const result = await selectFromProviderType("openai");
          expect(result.upstream.id).toBe("p0");
          expect(result.selectedTier).toBe(0);
        }
      });

      it("should degrade to tier 1 when all tier 0 upstreams are circuit-broken", async () => {
        const p0a = makeUpstream({ id: "p0a", priority: 0 });
        const p0b = makeUpstream({ id: "p0b", priority: 0 });
        const p1 = makeUpstream({ id: "p1", priority: 1 });
        mockFindMany.mockResolvedValue([p0a, p0b, p1]);
        setCBOpen("p0a", "p0b");

        const result = await selectFromProviderType("openai");
        expect(result.upstream.id).toBe("p1");
        expect(result.selectedTier).toBe(1);
      });

      it("should degrade to tier 1 when all tier 0 upstreams are unhealthy", async () => {
        const p0 = makeUpstream({ id: "p0", priority: 0, isHealthy: false });
        const p1 = makeUpstream({ id: "p1", priority: 1 });
        mockFindMany.mockResolvedValue([p0, p1]);

        const result = await selectFromProviderType("openai");
        expect(result.upstream.id).toBe("p1");
        expect(result.selectedTier).toBe(1);
      });

      it("should degrade to tier 2 when tier 0 and tier 1 are all unavailable", async () => {
        const p0 = makeUpstream({ id: "p0", priority: 0 });
        const p1 = makeUpstream({ id: "p1", priority: 1 });
        const p2 = makeUpstream({ id: "p2", priority: 2 });
        mockFindMany.mockResolvedValue([p0, p1, p2]);
        setCBOpen("p0", "p1");

        const result = await selectFromProviderType("openai");
        expect(result.upstream.id).toBe("p2");
        expect(result.selectedTier).toBe(2);
      });

      it("should degrade through mixed unhealthy and circuit-broken tiers", async () => {
        const p0 = makeUpstream({ id: "p0", priority: 0, isHealthy: false });
        const p1 = makeUpstream({ id: "p1", priority: 1 });
        const p2 = makeUpstream({ id: "p2", priority: 2 });
        mockFindMany.mockResolvedValue([p0, p1, p2]);
        setCBOpen("p1");

        const result = await selectFromProviderType("openai");
        expect(result.upstream.id).toBe("p2");
        expect(result.selectedTier).toBe(2);
      });

      it("should return selectedTier matching the priority of the chosen upstream", async () => {
        const p5 = makeUpstream({ id: "p5", priority: 5 });
        mockFindMany.mockResolvedValue([p5]);

        const result = await selectFromProviderType("openai");
        expect(result.selectedTier).toBe(5);
      });
    });

    // =========================================================================
    // Weighted selection within a tier
    // =========================================================================
    describe("weighted selection within tier", () => {
      it("should distribute selections roughly by weight", async () => {
        // weight 10 vs weight 1 – the heavier one should be picked much more often
        const heavy = makeUpstream({ id: "heavy", priority: 0, weight: 10 });
        const light = makeUpstream({ id: "light", priority: 0, weight: 1 });
        mockFindMany.mockResolvedValue([heavy, light]);

        const counts: Record<string, number> = { heavy: 0, light: 0 };
        const iterations = 200;

        for (let i = 0; i < iterations; i++) {
          const result = await selectFromProviderType("openai");
          counts[result.upstream.id] += 1;
        }

        // With weight 10:1, heavy should get the vast majority
        expect(counts["heavy"]).toBeGreaterThan(counts["light"]);
        // heavy should get at least 60% of selections (very conservative threshold)
        expect(counts["heavy"]).toBeGreaterThan(iterations * 0.6);
      });

      it("should only select from the highest-priority available tier", async () => {
        const p0 = makeUpstream({ id: "p0", priority: 0, weight: 1 });
        const p1heavy = makeUpstream({ id: "p1heavy", priority: 1, weight: 100 });
        mockFindMany.mockResolvedValue([p0, p1heavy]);

        // Even though p1heavy has much higher weight, p0 should always be selected
        // because it is in a higher-priority tier
        for (let i = 0; i < 20; i++) {
          const result = await selectFromProviderType("openai");
          expect(result.upstream.id).toBe("p0");
        }
      });

      it("should handle upstreams with equal weights", async () => {
        const u1 = makeUpstream({ id: "u1", priority: 0, weight: 1 });
        const u2 = makeUpstream({ id: "u2", priority: 0, weight: 1 });
        const u3 = makeUpstream({ id: "u3", priority: 0, weight: 1 });
        mockFindMany.mockResolvedValue([u1, u2, u3]);

        const selected = new Set<string>();
        for (let i = 0; i < 100; i++) {
          const result = await selectFromProviderType("openai");
          selected.add(result.upstream.id);
        }

        // With equal weights, all three should be selected at least once over 100 runs
        expect(selected.size).toBe(3);
      });
    });

    // =========================================================================
    // excludeIds filtering
    // =========================================================================
    describe("excludeIds filtering", () => {
      it("should exclude specified upstream IDs", async () => {
        const u1 = makeUpstream({ id: "u1", priority: 0 });
        const u2 = makeUpstream({ id: "u2", priority: 0 });
        mockFindMany.mockResolvedValue([u1, u2]);

        const result = await selectFromProviderType("openai", ["u1"]);
        expect(result.upstream.id).toBe("u2");
      });

      it("should throw NoHealthyUpstreamsError when all upstreams are excluded", async () => {
        const u1 = makeUpstream({ id: "u1" });
        const u2 = makeUpstream({ id: "u2" });
        mockFindMany.mockResolvedValue([u1, u2]);

        await expect(selectFromProviderType("openai", ["u1", "u2"])).rejects.toThrow(
          NoHealthyUpstreamsError
        );
      });

      it("should degrade to next tier when all upstreams in current tier are excluded", async () => {
        const p0 = makeUpstream({ id: "p0", priority: 0 });
        const p1 = makeUpstream({ id: "p1", priority: 1 });
        mockFindMany.mockResolvedValue([p0, p1]);

        const result = await selectFromProviderType("openai", ["p0"]);
        expect(result.upstream.id).toBe("p1");
        expect(result.selectedTier).toBe(1);
      });
    });

    // =========================================================================
    // allowedUpstreamIds filtering
    // =========================================================================
    describe("allowedUpstreamIds filtering", () => {
      it("should restrict selection to only allowed upstream IDs", async () => {
        const u1 = makeUpstream({ id: "u1", priority: 0 });
        const u2 = makeUpstream({ id: "u2", priority: 0 });
        const u3 = makeUpstream({ id: "u3", priority: 0 });
        mockFindMany.mockResolvedValue([u1, u2, u3]);

        const result = await selectFromProviderType("openai", undefined, ["u2"]);
        expect(result.upstream.id).toBe("u2");
      });

      it("should throw NoHealthyUpstreamsError when no allowed upstreams match", async () => {
        const u1 = makeUpstream({ id: "u1" });
        mockFindMany.mockResolvedValue([u1]);

        await expect(selectFromProviderType("openai", undefined, ["nonexistent"])).rejects.toThrow(
          NoHealthyUpstreamsError
        );
      });

      it("should combine allowedUpstreamIds with excludeIds", async () => {
        const u1 = makeUpstream({ id: "u1", priority: 0 });
        const u2 = makeUpstream({ id: "u2", priority: 0 });
        const u3 = makeUpstream({ id: "u3", priority: 0 });
        mockFindMany.mockResolvedValue([u1, u2, u3]);

        // Allow u1 and u2, but exclude u1 -> only u2 remains
        const result = await selectFromProviderType("openai", ["u1"], ["u1", "u2"]);
        expect(result.upstream.id).toBe("u2");
      });

      it("should throw when allowed and excluded sets cancel each other out", async () => {
        const u1 = makeUpstream({ id: "u1" });
        const u2 = makeUpstream({ id: "u2" });
        mockFindMany.mockResolvedValue([u1, u2]);

        await expect(selectFromProviderType("openai", ["u1", "u2"], ["u1", "u2"])).rejects.toThrow(
          NoHealthyUpstreamsError
        );
      });
    });

    // =========================================================================
    // Health-based filtering
    // =========================================================================
    describe("health-based filtering", () => {
      it("should skip unhealthy upstreams and select healthy ones", async () => {
        const unhealthy = makeUpstream({ id: "sick", priority: 0, isHealthy: false });
        const healthy = makeUpstream({ id: "ok", priority: 0 });
        mockFindMany.mockResolvedValue([unhealthy, healthy]);

        const result = await selectFromProviderType("openai");
        expect(result.upstream.id).toBe("ok");
      });

      it("should skip circuit-broken upstreams and select closed ones", async () => {
        const u1 = makeUpstream({ id: "broken", priority: 0 });
        const u2 = makeUpstream({ id: "working", priority: 0 });
        mockFindMany.mockResolvedValue([u1, u2]);
        setCBOpen("broken");

        const result = await selectFromProviderType("openai");
        expect(result.upstream.id).toBe("working");
      });

      it("should reject half_open circuit breaker upstreams", async () => {
        const u1 = makeUpstream({ id: "half", priority: 0 });
        mockFindMany.mockResolvedValue([u1]);
        mockGetCircuitBreakerState.mockResolvedValue({
          id: "cb-1",
          upstreamId: "half",
          state: "half_open",
          failureCount: 3,
          successCount: 0,
          lastFailureAt: new Date(),
          openedAt: new Date(),
          lastProbeAt: null,
          config: null,
        });

        await expect(selectFromProviderType("openai")).rejects.toThrow(NoHealthyUpstreamsError);
      });

      it("should treat upstream with no health record as healthy", async () => {
        const u1 = makeUpstream({ id: "no-health", priority: 0 });
        // Simulate no health record by setting health to null
        (u1 as Record<string, unknown>).health = null;
        mockFindMany.mockResolvedValue([u1]);

        const result = await selectFromProviderType("openai");
        expect(result.upstream.id).toBe("no-health");
      });
    });

    // =========================================================================
    // Combined scenarios
    // =========================================================================
    describe("combined scenarios", () => {
      it("should handle mix of excluded, unhealthy, and circuit-broken across tiers", async () => {
        const p0a = makeUpstream({ id: "p0a", priority: 0 }); // will be excluded
        const p0b = makeUpstream({ id: "p0b", priority: 0, isHealthy: false }); // unhealthy
        const p1a = makeUpstream({ id: "p1a", priority: 1 }); // circuit-broken
        const p1b = makeUpstream({ id: "p1b", priority: 1 }); // the only viable one
        mockFindMany.mockResolvedValue([p0a, p0b, p1a, p1b]);
        setCBOpen("p1a");

        const result = await selectFromProviderType("openai", ["p0a"]);
        expect(result.upstream.id).toBe("p1b");
        expect(result.selectedTier).toBe(1);
      });

      it("should throw when every upstream is unavailable for different reasons", async () => {
        const excluded = makeUpstream({ id: "ex" });
        const unhealthy = makeUpstream({ id: "sick", isHealthy: false });
        const broken = makeUpstream({ id: "broken" });
        mockFindMany.mockResolvedValue([excluded, unhealthy, broken]);
        setCBOpen("broken");

        await expect(selectFromProviderType("openai", ["ex"])).rejects.toThrow(
          NoHealthyUpstreamsError
        );
      });
    });
  });

  // =========================================================================
  // NoHealthyUpstreamsError
  // =========================================================================
  describe("NoHealthyUpstreamsError", () => {
    it("should be an instance of Error", () => {
      const err = new NoHealthyUpstreamsError("openai");
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("NoHealthyUpstreamsError");
    });

    it("should contain the provider type in the message", () => {
      const err = new NoHealthyUpstreamsError("anthropic");
      expect(err.message).toContain("anthropic");
    });
  });

  // =========================================================================
  // connectionCounts / recordConnection / releaseConnection
  // =========================================================================
  describe("connection tracking", () => {
    it("recordConnection should increment the count for an upstream", () => {
      recordConnection("u1");
      expect(getConnectionCount("u1")).toBe(1);

      recordConnection("u1");
      expect(getConnectionCount("u1")).toBe(2);
    });

    it("releaseConnection should decrement the count for an upstream", () => {
      recordConnection("u1");
      recordConnection("u1");
      releaseConnection("u1");
      expect(getConnectionCount("u1")).toBe(1);
    });

    it("releaseConnection should not go below zero", () => {
      releaseConnection("u1");
      const count = getConnectionCount("u1");
      expect(count === undefined || count === 0).toBe(true);
    });

    it("should track connections independently per upstream", () => {
      recordConnection("u1");
      recordConnection("u1");
      recordConnection("u2");

      expect(getConnectionCount("u1")).toBe(2);
      expect(getConnectionCount("u2")).toBe(1);
    });
  });
});
