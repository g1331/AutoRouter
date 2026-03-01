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
const mockAcquireCircuitBreakerPermit = vi.fn();
vi.mock("@/lib/services/circuit-breaker", () => ({
  getCircuitBreakerState: (...args: unknown[]) => mockGetCircuitBreakerState(...args),
  acquireCircuitBreakerPermit: (...args: unknown[]) => mockAcquireCircuitBreakerPermit(...args),
  CircuitBreakerOpenError: class CircuitBreakerOpenError extends Error {
    upstreamId: string;
    remainingSeconds: number;
    constructor(upstreamId: string, remainingSeconds: number) {
      super(`Circuit breaker is OPEN for upstream ${upstreamId}. Retry after ${remainingSeconds}s`);
      this.name = "CircuitBreakerOpenError";
      this.upstreamId = upstreamId;
      this.remainingSeconds = remainingSeconds;
    }
  },
  DEFAULT_CONFIG: {
    failureThreshold: 5,
    successThreshold: 2,
    openDuration: 300000,
    probeInterval: 30000,
  },
  CircuitBreakerStateEnum: {
    CLOSED: "closed",
    OPEN: "open",
    HALF_OPEN: "half_open",
  },
}));

const mockIsWithinQuota = vi.fn().mockReturnValue(true);
vi.mock("@/lib/services/upstream-quota-tracker", () => ({
  quotaTracker: {
    isWithinQuota: (...args: unknown[]) => mockIsWithinQuota(...args),
    ensureInitialized: () => true,
  },
}));

// Import after mocks are registered
import {
  selectFromProviderType,
  selectFromUpstreamCandidates,
  filterBySpendingQuota,
  NoHealthyUpstreamsError,
  NoAuthorizedUpstreamsError,
  resetConnectionCounts,
  recordConnection,
  releaseConnection,
  getConnectionCount,
} from "@/lib/services/load-balancer";
import { affinityStore } from "@/lib/services/session-affinity";

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
  affinityMigration?: {
    enabled: boolean;
    metric: "tokens" | "length";
    threshold: number;
  } | null;
}

function getRouteCapabilitiesByProvider(providerType: string): string[] {
  switch (providerType) {
    case "anthropic":
      return ["anthropic_messages"];
    case "google":
      return ["gemini_native_generate"];
    case "custom":
      return [];
    case "openai":
    default:
      return ["openai_chat_compatible"];
  }
}

function makeUpstream(opts: MockUpstreamOpts = {}) {
  idCounter += 1;
  const id = opts.id ?? `upstream-${idCounter}`;
  const providerType = opts.providerType ?? "openai";
  return {
    id,
    name: opts.name ?? `upstream-${idCounter}`,
    baseUrl: "https://api.openai.com/v1",
    apiKeyEncrypted: "encrypted-key",
    isDefault: false,
    timeout: 60,
    isActive: opts.isActive ?? true,
    config: null,
    weight: opts.weight ?? 1,
    priority: opts.priority ?? 0,
    providerType,
    routeCapabilities: getRouteCapabilitiesByProvider(providerType),
    allowedModels: null,
    modelRedirects: null,
    affinityMigration: opts.affinityMigration ?? null,
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
    // Clear affinity store between tests
    affinityStore.clear();
    setCBAllClosed();
    mockAcquireCircuitBreakerPermit.mockResolvedValue(undefined);
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

    it("should still select unhealthy upstreams (health is display-only)", async () => {
      const u1 = makeUpstream({ id: "u1", isHealthy: false });
      const u2 = makeUpstream({ id: "u2", isHealthy: false });
      mockFindMany.mockResolvedValue([u1, u2]);

      // Unhealthy upstreams should still be selected — only circuit breaker blocks routing
      const result = await selectFromProviderType("openai");
      expect(["u1", "u2"]).toContain(result.upstream.id);
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

      it("should NOT degrade when tier 0 upstreams are unhealthy (health is display-only)", async () => {
        const p0 = makeUpstream({ id: "p0", priority: 0, isHealthy: false });
        const p1 = makeUpstream({ id: "p1", priority: 1 });
        mockFindMany.mockResolvedValue([p0, p1]);

        // Unhealthy does not cause degradation — only circuit breaker does
        const result = await selectFromProviderType("openai");
        expect(result.upstream.id).toBe("p0");
        expect(result.selectedTier).toBe(0);
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

      it("should degrade only due to circuit breaker, not health status", async () => {
        const p0 = makeUpstream({ id: "p0", priority: 0, isHealthy: false });
        const p1 = makeUpstream({ id: "p1", priority: 1 });
        const p2 = makeUpstream({ id: "p2", priority: 2 });
        mockFindMany.mockResolvedValue([p0, p1, p2]);
        setCBOpen("p1");

        // p0 is unhealthy but still selectable; p1 is circuit-broken
        const result = await selectFromProviderType("openai");
        expect(result.upstream.id).toBe("p0");
        expect(result.selectedTier).toBe(0);
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

    describe("candidate upstream selection", () => {
      it("should throw NoAuthorizedUpstreamsError when candidate list is empty", async () => {
        await expect(selectFromUpstreamCandidates([])).rejects.toThrow(NoAuthorizedUpstreamsError);
      });

      it("should select by candidate IDs and keep tier selection behavior", async () => {
        const p0 = makeUpstream({ id: "p0", priority: 0 });
        const p1 = makeUpstream({ id: "p1", priority: 1, isHealthy: false });
        (p0 as Record<string, unknown>).health = null;
        mockFindMany.mockResolvedValue([p1, p0]);

        const result = await selectFromUpstreamCandidates(["p0", "p1"]);

        expect(result.upstream.id).toBe("p0");
        expect(result.selectedTier).toBe(0);
        expect(mockGetCircuitBreakerState).toHaveBeenCalledWith("p0");
        expect(mockGetCircuitBreakerState).toHaveBeenCalledWith("p1");
      });
    });

    // =========================================================================
    // Health status is display-only; circuit breaker drives routing
    // =========================================================================
    describe("health vs circuit breaker filtering", () => {
      it("should select unhealthy upstream when circuit breaker is closed", async () => {
        const unhealthy = makeUpstream({ id: "sick", priority: 0, isHealthy: false });
        const healthy = makeUpstream({ id: "ok", priority: 0 });
        mockFindMany.mockResolvedValue([unhealthy, healthy]);

        // Both should be selectable since health doesn't affect routing
        const selected = new Set<string>();
        for (let i = 0; i < 50; i++) {
          const result = await selectFromProviderType("openai");
          selected.add(result.upstream.id);
        }
        expect(selected.has("sick")).toBe(true);
        expect(selected.has("ok")).toBe(true);
      });

      it("should skip circuit-broken upstreams and select closed ones", async () => {
        const u1 = makeUpstream({ id: "broken", priority: 0 });
        const u2 = makeUpstream({ id: "working", priority: 0 });
        mockFindMany.mockResolvedValue([u1, u2]);
        setCBOpen("broken");

        const result = await selectFromProviderType("openai");
        expect(result.upstream.id).toBe("working");
      });

      it("should allow half_open upstreams when probe is eligible", async () => {
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

        const result = await selectFromProviderType("openai");
        expect(result.upstream.id).toBe("half");
        expect(mockAcquireCircuitBreakerPermit).toHaveBeenCalledWith("half");
      });

      it("should block half_open upstreams when probe interval not elapsed", async () => {
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
          lastProbeAt: new Date(), // just probed
          config: null,
        });

        await expect(selectFromProviderType("openai")).rejects.toThrow(NoHealthyUpstreamsError);
        expect(mockAcquireCircuitBreakerPermit).not.toHaveBeenCalled();
      });

      it("should treat upstream with no health record as selectable", async () => {
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
      it("should handle mix of excluded and circuit-broken across tiers", async () => {
        const p0a = makeUpstream({ id: "p0a", priority: 0 }); // will be excluded
        const p0b = makeUpstream({ id: "p0b", priority: 0, isHealthy: false }); // unhealthy but selectable
        const p1a = makeUpstream({ id: "p1a", priority: 1 }); // circuit-broken
        const p1b = makeUpstream({ id: "p1b", priority: 1 }); // viable
        mockFindMany.mockResolvedValue([p0a, p0b, p1a, p1b]);
        setCBOpen("p1a");

        // p0a excluded, p0b unhealthy but still selectable → selected from tier 0
        const result = await selectFromProviderType("openai", ["p0a"]);
        expect(result.upstream.id).toBe("p0b");
        expect(result.selectedTier).toBe(0);
      });

      it("should throw when every upstream is excluded or circuit-broken", async () => {
        const excluded = makeUpstream({ id: "ex" });
        const broken = makeUpstream({ id: "broken" });
        mockFindMany.mockResolvedValue([excluded, broken]);
        setCBOpen("broken");

        await expect(selectFromProviderType("openai", ["ex"])).rejects.toThrow(
          NoHealthyUpstreamsError
        );
      });
    });

    // =========================================================================
    // Session affinity
    // =========================================================================
    describe("session affinity", () => {
      it("should isolate affinity bindings by route capability scope", async () => {
        const tier0 = makeUpstream({ id: "u-tier0", priority: 0 });
        const tier1 = makeUpstream({ id: "u-tier1", priority: 1 });
        mockFindMany.mockResolvedValue([tier0, tier1]);

        affinityStore.set("key1", "codex_responses", "session-abc", "u-tier1", 1024);

        const result = await selectFromProviderType("openai", undefined, undefined, {
          apiKeyId: "key1",
          sessionId: "session-abc",
          affinityScope: "openai_chat_compatible",
          contentLength: 2048,
        });

        expect(result.upstream.id).toBe("u-tier0");
        expect(result.affinityHit).toBe(false);
        expect(affinityStore.get("key1", "codex_responses", "session-abc")?.upstreamId).toBe(
          "u-tier1"
        );
        expect(affinityStore.get("key1", "openai_chat_compatible", "session-abc")?.upstreamId).toBe(
          "u-tier0"
        );
      });

      it("should use affinity binding when session exists and upstream is available", async () => {
        const u1 = makeUpstream({ id: "u1", priority: 0 });
        const u2 = makeUpstream({ id: "u2", priority: 0 });
        mockFindMany.mockResolvedValue([u1, u2]);

        // Pre-populate affinity cache
        affinityStore.set("key1", "openai_chat_compatible", "session-abc", "u1", 1024);

        const result = await selectFromProviderType("openai", undefined, undefined, {
          apiKeyId: "key1",
          sessionId: "session-abc",
          affinityScope: "openai_chat_compatible",
          contentLength: 2048,
        });

        expect(result.upstream.id).toBe("u1");
        expect(result.affinityHit).toBe(true);
        expect(result.affinityMigrated).toBe(false);
      });

      it("should reselect when bound upstream is unavailable (circuit open)", async () => {
        const u1 = makeUpstream({ id: "u1", priority: 0 });
        const u2 = makeUpstream({ id: "u2", priority: 0 });
        mockFindMany.mockResolvedValue([u1, u2]);
        setCBOpen("u1");

        // Pre-populate affinity cache with u1
        affinityStore.set("key1", "openai_chat_compatible", "session-abc", "u1", 1024);

        const result = await selectFromProviderType("openai", undefined, undefined, {
          apiKeyId: "key1",
          sessionId: "session-abc",
          affinityScope: "openai_chat_compatible",
          contentLength: 2048,
        });

        expect(result.upstream.id).toBe("u2");
        expect(result.affinityHit).toBe(true);
      });

      it("should keep existing affinity cache when reselecting due to unavailable upstream", async () => {
        const u1 = makeUpstream({ id: "u1", priority: 0 });
        const u2 = makeUpstream({ id: "u2", priority: 0 });
        mockFindMany.mockResolvedValue([u1, u2]);
        setCBOpen("u1");

        // Pre-populate affinity cache with u1
        affinityStore.set("key1", "openai_chat_compatible", "session-abc", "u1", 1024);

        await selectFromProviderType("openai", undefined, undefined, {
          apiKeyId: "key1",
          sessionId: "session-abc",
          affinityScope: "openai_chat_compatible",
          contentLength: 2048,
        });

        // Cache should stay on u1; this reselect is request-local fallback only
        const entry = affinityStore.get("key1", "openai_chat_compatible", "session-abc");
        expect(entry?.upstreamId).toBe("u1");
      });

      it("should keep existing affinity cache when bound upstream is excluded", async () => {
        const u1 = makeUpstream({ id: "u1", priority: 0 });
        const u2 = makeUpstream({ id: "u2", priority: 0 });
        mockFindMany.mockResolvedValue([u1, u2]);

        // Pre-populate affinity cache with u1
        affinityStore.set("key1", "openai_chat_compatible", "session-abc", "u1", 1024);

        const result = await selectFromProviderType("openai", ["u1"], undefined, {
          apiKeyId: "key1",
          sessionId: "session-abc",
          affinityScope: "openai_chat_compatible",
          contentLength: 2048,
        });

        expect(result.upstream.id).toBe("u2");
        expect(result.affinityHit).toBe(true);

        const entry = affinityStore.get("key1", "openai_chat_compatible", "session-abc");
        expect(entry?.upstreamId).toBe("u1");
      });

      it("should create new affinity entry on first request", async () => {
        const u1 = makeUpstream({ id: "u1", priority: 0 });
        mockFindMany.mockResolvedValue([u1]);

        // No pre-populated cache
        expect(affinityStore.has("key1", "openai_chat_compatible", "session-abc")).toBe(false);

        await selectFromProviderType("openai", undefined, undefined, {
          apiKeyId: "key1",
          sessionId: "session-abc",
          affinityScope: "openai_chat_compatible",
          contentLength: 1024,
        });

        // Cache should be created
        const entry = affinityStore.get("key1", "openai_chat_compatible", "session-abc");
        expect(entry).not.toBeNull();
        expect(entry?.upstreamId).toBe("u1");
      });

      it("should behave normally without sessionId (no affinity)", async () => {
        const u1 = makeUpstream({ id: "u1", priority: 0 });
        const u2 = makeUpstream({ id: "u2", priority: 0 });
        mockFindMany.mockResolvedValue([u1, u2]);

        const result = await selectFromProviderType("openai");

        expect(result.affinityHit).toBe(false);
        expect(["u1", "u2"]).toContain(result.upstream.id);
      });

      it("should bypass affinity when scope is missing in affinity context", async () => {
        const u1 = makeUpstream({ id: "u1", priority: 0 });
        mockFindMany.mockResolvedValue([u1]);

        const result = await selectFromProviderType("openai", undefined, undefined, {
          apiKeyId: "key-1",
          sessionId: "session-1",
          contentLength: 1024,
        });

        expect(result.upstream.id).toBe("u1");
        expect(result.affinityHit).toBe(false);
        expect(result.affinityMigrated).toBe(false);
      });

      it("should migrate to higher priority upstream when threshold allows", async () => {
        const p0 = makeUpstream({
          id: "p0",
          priority: 0,
          affinityMigration: { enabled: true, metric: "tokens", threshold: 50000 },
        });
        const p1 = makeUpstream({ id: "p1", priority: 1 });
        mockFindMany.mockResolvedValue([p0, p1]);

        // Session bound to lower priority upstream
        affinityStore.set("key1", "openai_chat_compatible", "session-abc", "p1", 1024);
        // Set cumulative tokens below threshold
        affinityStore.updateCumulativeTokens("key1", "openai_chat_compatible", "session-abc", {
          totalInputTokens: 1000,
        });

        const result = await selectFromProviderType("openai", undefined, undefined, {
          apiKeyId: "key1",
          sessionId: "session-abc",
          affinityScope: "openai_chat_compatible",
          contentLength: 2048,
        });

        expect(result.upstream.id).toBe("p0");
        expect(result.affinityHit).toBe(true);
        expect(result.affinityMigrated).toBe(true);
      });

      it("should NOT migrate when cumulative tokens exceed threshold", async () => {
        const p0 = makeUpstream({
          id: "p0",
          priority: 0,
          affinityMigration: { enabled: true, metric: "tokens", threshold: 50000 },
        });
        const p1 = makeUpstream({ id: "p1", priority: 1 });
        mockFindMany.mockResolvedValue([p0, p1]);

        // Session bound to lower priority upstream
        affinityStore.set("key1", "openai_chat_compatible", "session-abc", "p1", 1024);
        // Set cumulative tokens above threshold
        affinityStore.updateCumulativeTokens("key1", "openai_chat_compatible", "session-abc", {
          totalInputTokens: 60000,
        });

        const result = await selectFromProviderType("openai", undefined, undefined, {
          apiKeyId: "key1",
          sessionId: "session-abc",
          affinityScope: "openai_chat_compatible",
          contentLength: 2048,
        });

        expect(result.upstream.id).toBe("p1");
        expect(result.affinityHit).toBe(true);
        expect(result.affinityMigrated).toBe(false);
      });

      it("should migrate based on content length when metric is length", async () => {
        const p0 = makeUpstream({
          id: "p0",
          priority: 0,
          affinityMigration: { enabled: true, metric: "length", threshold: 10000 },
        });
        const p1 = makeUpstream({ id: "p1", priority: 1 });
        mockFindMany.mockResolvedValue([p0, p1]);

        // Session bound to lower priority upstream
        affinityStore.set("key1", "openai_chat_compatible", "session-abc", "p1", 1024);

        // Content length below threshold
        const result = await selectFromProviderType("openai", undefined, undefined, {
          apiKeyId: "key1",
          sessionId: "session-abc",
          affinityScope: "openai_chat_compatible",
          contentLength: 5000,
        });

        expect(result.upstream.id).toBe("p0");
        expect(result.affinityMigrated).toBe(true);
      });

      it("should NOT migrate when higher priority upstream has migration disabled", async () => {
        const p0 = makeUpstream({
          id: "p0",
          priority: 0,
          affinityMigration: { enabled: false, metric: "tokens", threshold: 50000 },
        });
        const p1 = makeUpstream({ id: "p1", priority: 1 });
        mockFindMany.mockResolvedValue([p0, p1]);

        // Session bound to lower priority upstream
        affinityStore.set("key1", "openai_chat_compatible", "session-abc", "p1", 1024);

        const result = await selectFromProviderType("openai", undefined, undefined, {
          apiKeyId: "key1",
          sessionId: "session-abc",
          affinityScope: "openai_chat_compatible",
          contentLength: 2048,
        });

        expect(result.upstream.id).toBe("p1");
        expect(result.affinityMigrated).toBe(false);
      });

      it("should NOT migrate when higher priority upstream has no migration config", async () => {
        const p0 = makeUpstream({ id: "p0", priority: 0, affinityMigration: null });
        const p1 = makeUpstream({ id: "p1", priority: 1 });
        mockFindMany.mockResolvedValue([p0, p1]);

        // Session bound to lower priority upstream
        affinityStore.set("key1", "openai_chat_compatible", "session-abc", "p1", 1024);

        const result = await selectFromProviderType("openai", undefined, undefined, {
          apiKeyId: "key1",
          sessionId: "session-abc",
          affinityScope: "openai_chat_compatible",
          contentLength: 2048,
        });

        expect(result.upstream.id).toBe("p1");
        expect(result.affinityMigrated).toBe(false);
      });

      it("should update affinity cache after migration", async () => {
        const p0 = makeUpstream({
          id: "p0",
          priority: 0,
          affinityMigration: { enabled: true, metric: "tokens", threshold: 50000 },
        });
        const p1 = makeUpstream({ id: "p1", priority: 1 });
        mockFindMany.mockResolvedValue([p0, p1]);

        // Session bound to lower priority upstream
        affinityStore.set("key1", "openai_chat_compatible", "session-abc", "p1", 1024);

        await selectFromProviderType("openai", undefined, undefined, {
          apiKeyId: "key1",
          sessionId: "session-abc",
          affinityScope: "openai_chat_compatible",
          contentLength: 2048,
        });

        // Cache should be updated to p0
        const entry = affinityStore.get("key1", "openai_chat_compatible", "session-abc");
        expect(entry?.upstreamId).toBe("p0");
      });

      it("should allow migration when cumulativeTokens is 0 (first request)", async () => {
        const p0 = makeUpstream({
          id: "p0",
          priority: 0,
          affinityMigration: { enabled: true, metric: "tokens", threshold: 50000 },
        });
        const p1 = makeUpstream({ id: "p1", priority: 1 });
        mockFindMany.mockResolvedValue([p0, p1]);

        // Session bound to lower priority upstream with 0 tokens
        affinityStore.set("key1", "openai_chat_compatible", "session-abc", "p1", 1024);

        const result = await selectFromProviderType("openai", undefined, undefined, {
          apiKeyId: "key1",
          sessionId: "session-abc",
          affinityScope: "openai_chat_compatible",
          contentLength: 2048,
        });

        expect(result.upstream.id).toBe("p0");
        expect(result.affinityMigrated).toBe(true);
      });

      it("should NOT migrate when already on highest priority upstream", async () => {
        const p0 = makeUpstream({
          id: "p0",
          priority: 0,
          affinityMigration: { enabled: true, metric: "tokens", threshold: 50000 },
        });
        const p1 = makeUpstream({ id: "p1", priority: 1 });
        mockFindMany.mockResolvedValue([p0, p1]);

        // Session already bound to highest priority upstream
        affinityStore.set("key1", "openai_chat_compatible", "session-abc", "p0", 1024);

        const result = await selectFromProviderType("openai", undefined, undefined, {
          apiKeyId: "key1",
          sessionId: "session-abc",
          affinityScope: "openai_chat_compatible",
          contentLength: 2048,
        });

        expect(result.upstream.id).toBe("p0");
        expect(result.affinityMigrated).toBe(false);
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

  describe("spending quota filtering", () => {
    function makeUCB(id: string) {
      return {
        upstream: { ...makeUpstream({ id }), id },
        isHealthy: true,
        latencyMs: 100,
        circuitState: "closed" as const,
        circuitBreaker: null,
      };
    }

    beforeEach(() => {
      mockIsWithinQuota.mockReturnValue(true);
    });

    it("allows all upstreams when none exceed quota", () => {
      const list = [makeUCB("a"), makeUCB("b")];
      const result = filterBySpendingQuota(list);
      expect(result.allowed).toHaveLength(2);
      expect(result.excludedCount).toBe(0);
    });

    it("excludes upstreams that exceed quota", () => {
      mockIsWithinQuota.mockImplementation((id: string) => id !== "b");
      const list = [makeUCB("a"), makeUCB("b"), makeUCB("c")];
      const result = filterBySpendingQuota(list);
      expect(result.allowed).toHaveLength(2);
      expect(result.excludedCount).toBe(1);
      expect(result.allowed.map((u) => u.upstream.id)).toEqual(["a", "c"]);
    });

    it("excludes all upstreams when all exceed quota", () => {
      mockIsWithinQuota.mockReturnValue(false);
      const list = [makeUCB("a"), makeUCB("b")];
      const result = filterBySpendingQuota(list);
      expect(result.allowed).toHaveLength(0);
      expect(result.excludedCount).toBe(2);
    });

    it("does not affect upstreams without quota config (returns true)", () => {
      // Default: isWithinQuota returns true for all (no config)
      const list = [makeUCB("a")];
      const result = filterBySpendingQuota(list);
      expect(result.allowed).toHaveLength(1);
      expect(result.excludedCount).toBe(0);
    });

    it("integrates with tier selection - quota exceeded upstreams fall to next tier", async () => {
      const p0a = makeUpstream({ id: "p0a", priority: 0 });
      const p0b = makeUpstream({ id: "p0b", priority: 0 });
      const p1a = makeUpstream({ id: "p1a", priority: 1 });

      mockFindMany.mockResolvedValue([p0a, p0b, p1a]);
      setCBOpen(); // all CB closed

      // All P0 upstreams exceed quota
      mockIsWithinQuota.mockImplementation((id: string) => id === "p1a");

      const result = await selectFromUpstreamCandidates(["p0a", "p0b", "p1a"]);
      expect(result.upstream.id).toBe("p1a");
      expect(result.selectedTier).toBe(1);
      expect(result.quotaFiltered).toBe(2);
    });
  });
});
