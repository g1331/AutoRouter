import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  LoadBalancerStrategy,
  NoHealthyUpstreamsError,
  UpstreamGroupNotFoundError,
  getConnectionCount,
  recordConnection,
  releaseConnection,
  resetConnectionCounts,
  resetRoundRobinIndices,
  filterHealthyUpstreams,
  isValidStrategy,
  type UpstreamWithHealth,
} from "@/lib/services/load-balancer";

// Type helpers for mocking
type PartialUpstream = {
  id: string;
  name: string;
  weight: number;
  groupId: string | null;
  isActive: boolean;
  health?: {
    isHealthy: boolean;
    latencyMs: number | null;
  };
  [key: string]: unknown;
};

type PartialUpstreamGroup = {
  id: string;
  name: string;
  strategy: string;
  [key: string]: unknown;
};

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      upstreams: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      upstreamGroups: {
        findFirst: vi.fn(),
      },
      upstreamHealth: {
        findFirst: vi.fn(),
      },
    },
  },
  upstreams: {},
  upstreamGroups: {},
  upstreamHealth: {},
}));

describe("load-balancer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetConnectionCounts();
    resetRoundRobinIndices();
  });

  describe("LoadBalancerStrategy enum", () => {
    it("should have ROUND_ROBIN strategy", () => {
      expect(LoadBalancerStrategy.ROUND_ROBIN).toBe("round_robin");
    });

    it("should have WEIGHTED strategy", () => {
      expect(LoadBalancerStrategy.WEIGHTED).toBe("weighted");
    });

    it("should have LEAST_CONNECTIONS strategy", () => {
      expect(LoadBalancerStrategy.LEAST_CONNECTIONS).toBe("least_connections");
    });
  });

  describe("NoHealthyUpstreamsError", () => {
    it("should have correct name", () => {
      const error = new NoHealthyUpstreamsError("no healthy upstreams");
      expect(error.name).toBe("NoHealthyUpstreamsError");
    });

    it("should have correct message", () => {
      const error = new NoHealthyUpstreamsError("No healthy upstreams in group: test-group");
      expect(error.message).toBe("No healthy upstreams in group: test-group");
    });

    it("should be instanceof Error", () => {
      const error = new NoHealthyUpstreamsError("test");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("UpstreamGroupNotFoundError", () => {
    it("should have correct name", () => {
      const error = new UpstreamGroupNotFoundError("group not found");
      expect(error.name).toBe("UpstreamGroupNotFoundError");
    });

    it("should have correct message", () => {
      const error = new UpstreamGroupNotFoundError("Upstream group not found: test-id");
      expect(error.message).toBe("Upstream group not found: test-id");
    });

    it("should be instanceof Error", () => {
      const error = new UpstreamGroupNotFoundError("test");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("Connection tracking", () => {
    describe("getConnectionCount", () => {
      it("should return 0 for unknown upstream", () => {
        expect(getConnectionCount("unknown-id")).toBe(0);
      });

      it("should return current count for tracked upstream", () => {
        recordConnection("test-id");
        recordConnection("test-id");
        expect(getConnectionCount("test-id")).toBe(2);
      });
    });

    describe("recordConnection", () => {
      it("should increment connection count", () => {
        expect(getConnectionCount("test-id")).toBe(0);
        recordConnection("test-id");
        expect(getConnectionCount("test-id")).toBe(1);
        recordConnection("test-id");
        expect(getConnectionCount("test-id")).toBe(2);
      });

      it("should track multiple upstreams independently", () => {
        recordConnection("upstream-1");
        recordConnection("upstream-1");
        recordConnection("upstream-2");

        expect(getConnectionCount("upstream-1")).toBe(2);
        expect(getConnectionCount("upstream-2")).toBe(1);
      });
    });

    describe("releaseConnection", () => {
      it("should decrement connection count", () => {
        recordConnection("test-id");
        recordConnection("test-id");
        expect(getConnectionCount("test-id")).toBe(2);

        releaseConnection("test-id");
        expect(getConnectionCount("test-id")).toBe(1);
      });

      it("should not go below 0", () => {
        releaseConnection("unknown-id");
        expect(getConnectionCount("unknown-id")).toBe(0);

        recordConnection("test-id");
        releaseConnection("test-id");
        releaseConnection("test-id");
        releaseConnection("test-id");
        expect(getConnectionCount("test-id")).toBe(0);
      });
    });

    describe("resetConnectionCounts", () => {
      it("should clear all connection counts", () => {
        recordConnection("upstream-1");
        recordConnection("upstream-2");
        expect(getConnectionCount("upstream-1")).toBe(1);
        expect(getConnectionCount("upstream-2")).toBe(1);

        resetConnectionCounts();

        expect(getConnectionCount("upstream-1")).toBe(0);
        expect(getConnectionCount("upstream-2")).toBe(0);
      });
    });
  });

  describe("filterHealthyUpstreams", () => {
    const createMockUpstreamWithHealth = (
      id: string,
      isHealthy: boolean,
      weight = 1
    ): UpstreamWithHealth => ({
      upstream: {
        id,
        name: `upstream-${id}`,
        weight,
        groupId: "group-1",
        isActive: true,
      } as UpstreamWithHealth["upstream"],
      isHealthy,
      latencyMs: 100,
    });

    it("should filter out unhealthy upstreams", () => {
      const upstreams = [
        createMockUpstreamWithHealth("1", true),
        createMockUpstreamWithHealth("2", false),
        createMockUpstreamWithHealth("3", true),
      ];

      const result = filterHealthyUpstreams(upstreams);

      expect(result).toHaveLength(2);
      expect(result.map((u) => u.upstream.id)).toEqual(["1", "3"]);
    });

    it("should return empty array if no healthy upstreams", () => {
      const upstreams = [
        createMockUpstreamWithHealth("1", false),
        createMockUpstreamWithHealth("2", false),
      ];

      const result = filterHealthyUpstreams(upstreams);

      expect(result).toHaveLength(0);
    });

    it("should return all upstreams if all are healthy", () => {
      const upstreams = [
        createMockUpstreamWithHealth("1", true),
        createMockUpstreamWithHealth("2", true),
      ];

      const result = filterHealthyUpstreams(upstreams);

      expect(result).toHaveLength(2);
    });

    it("should exclude specified IDs", () => {
      const upstreams = [
        createMockUpstreamWithHealth("1", true),
        createMockUpstreamWithHealth("2", true),
        createMockUpstreamWithHealth("3", true),
      ];

      const result = filterHealthyUpstreams(upstreams, ["2"]);

      expect(result).toHaveLength(2);
      expect(result.map((u) => u.upstream.id)).toEqual(["1", "3"]);
    });

    it("should combine health and exclusion filters", () => {
      const upstreams = [
        createMockUpstreamWithHealth("1", true),
        createMockUpstreamWithHealth("2", false),
        createMockUpstreamWithHealth("3", true),
        createMockUpstreamWithHealth("4", true),
      ];

      const result = filterHealthyUpstreams(upstreams, ["1"]);

      expect(result).toHaveLength(2);
      expect(result.map((u) => u.upstream.id)).toEqual(["3", "4"]);
    });

    it("should handle empty exclude list", () => {
      const upstreams = [createMockUpstreamWithHealth("1", true)];

      const result = filterHealthyUpstreams(upstreams, []);

      expect(result).toHaveLength(1);
    });

    it("should handle undefined exclude list", () => {
      const upstreams = [createMockUpstreamWithHealth("1", true)];

      const result = filterHealthyUpstreams(upstreams, undefined);

      expect(result).toHaveLength(1);
    });
  });

  describe("isValidStrategy", () => {
    it("should return true for round_robin", () => {
      expect(isValidStrategy("round_robin")).toBe(true);
    });

    it("should return true for weighted", () => {
      expect(isValidStrategy("weighted")).toBe(true);
    });

    it("should return true for least_connections", () => {
      expect(isValidStrategy("least_connections")).toBe(true);
    });

    it("should return false for invalid strategy", () => {
      expect(isValidStrategy("invalid")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isValidStrategy("")).toBe(false);
    });

    it("should return false for mixed case", () => {
      expect(isValidStrategy("Round_Robin")).toBe(false);
      expect(isValidStrategy("WEIGHTED")).toBe(false);
    });
  });

  describe("getGroupUpstreams", () => {
    it("should return upstreams with health status", async () => {
      const { getGroupUpstreams } = await import("@/lib/services/load-balancer");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue({
        id: "group-1",
        name: "test-group",
        strategy: "round_robin",
      } as unknown as PartialUpstreamGroup);

      vi.mocked(db.query.upstreams.findMany).mockResolvedValue([
        {
          id: "upstream-1",
          name: "test-upstream-1",
          weight: 1,
          groupId: "group-1",
          isActive: true,
          health: {
            isHealthy: true,
            latencyMs: 50,
          },
        },
        {
          id: "upstream-2",
          name: "test-upstream-2",
          weight: 2,
          groupId: "group-1",
          isActive: true,
          health: {
            isHealthy: false,
            latencyMs: 200,
          },
        },
      ] as unknown as PartialUpstream[]);

      const result = await getGroupUpstreams("group-1");

      expect(result).toHaveLength(2);
      expect(result[0].isHealthy).toBe(true);
      expect(result[0].latencyMs).toBe(50);
      expect(result[1].isHealthy).toBe(false);
      expect(result[1].latencyMs).toBe(200);
    });

    it("should default to healthy if no health record exists", async () => {
      const { getGroupUpstreams } = await import("@/lib/services/load-balancer");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue({
        id: "group-1",
        name: "test-group",
        strategy: "round_robin",
      } as unknown as PartialUpstreamGroup);

      vi.mocked(db.query.upstreams.findMany).mockResolvedValue([
        {
          id: "upstream-1",
          name: "test-upstream-1",
          weight: 1,
          groupId: "group-1",
          isActive: true,
          health: null,
        },
      ] as unknown as PartialUpstream[]);

      const result = await getGroupUpstreams("group-1");

      expect(result).toHaveLength(1);
      expect(result[0].isHealthy).toBe(true);
      expect(result[0].latencyMs).toBeNull();
    });

    it("should throw UpstreamGroupNotFoundError if group does not exist", async () => {
      const { getGroupUpstreams } = await import("@/lib/services/load-balancer");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue(null);

      await expect(getGroupUpstreams("nonexistent-group")).rejects.toThrow(
        UpstreamGroupNotFoundError
      );
    });
  });

  describe("selectUpstream", () => {
    const mockGroup: PartialUpstreamGroup = {
      id: "group-1",
      name: "test-group",
      strategy: "round_robin",
    };

    const createMockUpstreamsWithHealth = () => [
      {
        id: "upstream-1",
        name: "test-upstream-1",
        weight: 1,
        groupId: "group-1",
        isActive: true,
        health: { isHealthy: true, latencyMs: 50 },
      },
      {
        id: "upstream-2",
        name: "test-upstream-2",
        weight: 2,
        groupId: "group-1",
        isActive: true,
        health: { isHealthy: true, latencyMs: 100 },
      },
    ];

    it("should throw UpstreamGroupNotFoundError if group does not exist", async () => {
      const { selectUpstream } = await import("@/lib/services/load-balancer");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue(null);

      await expect(selectUpstream("nonexistent-group")).rejects.toThrow(UpstreamGroupNotFoundError);
    });

    it("should throw NoHealthyUpstreamsError if no healthy upstreams available", async () => {
      const { selectUpstream } = await import("@/lib/services/load-balancer");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue(
        mockGroup as unknown as PartialUpstreamGroup
      );
      vi.mocked(db.query.upstreams.findMany).mockResolvedValue([
        {
          id: "upstream-1",
          name: "test-upstream-1",
          weight: 1,
          groupId: "group-1",
          isActive: true,
          health: { isHealthy: false, latencyMs: 500 },
        },
      ] as unknown as PartialUpstream[]);

      await expect(selectUpstream("group-1")).rejects.toThrow(NoHealthyUpstreamsError);
    });

    it("should use group default strategy when none provided", async () => {
      const { selectUpstream } = await import("@/lib/services/load-balancer");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue(
        mockGroup as unknown as PartialUpstreamGroup
      );
      vi.mocked(db.query.upstreams.findMany).mockResolvedValue(
        createMockUpstreamsWithHealth() as unknown as PartialUpstream[]
      );

      const result = await selectUpstream("group-1");

      expect(result.strategy).toBe(LoadBalancerStrategy.ROUND_ROBIN);
    });

    it("should override strategy when provided", async () => {
      const { selectUpstream } = await import("@/lib/services/load-balancer");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue(
        mockGroup as unknown as PartialUpstreamGroup
      );
      vi.mocked(db.query.upstreams.findMany).mockResolvedValue(
        createMockUpstreamsWithHealth() as unknown as PartialUpstream[]
      );

      const result = await selectUpstream("group-1", LoadBalancerStrategy.WEIGHTED);

      expect(result.strategy).toBe(LoadBalancerStrategy.WEIGHTED);
    });

    it("should exclude specified upstream IDs", async () => {
      const { selectUpstream } = await import("@/lib/services/load-balancer");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue(
        mockGroup as unknown as PartialUpstreamGroup
      );
      vi.mocked(db.query.upstreams.findMany).mockResolvedValue(
        createMockUpstreamsWithHealth() as unknown as PartialUpstream[]
      );

      const result = await selectUpstream("group-1", undefined, ["upstream-1"]);

      expect(result.upstream.id).toBe("upstream-2");
    });

    describe("round-robin strategy", () => {
      it("should cycle through upstreams in order", async () => {
        const { selectUpstream, resetRoundRobinIndices } =
          await import("@/lib/services/load-balancer");
        const { db } = await import("@/lib/db");

        resetRoundRobinIndices();

        vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue(
          mockGroup as unknown as PartialUpstreamGroup
        );
        vi.mocked(db.query.upstreams.findMany).mockResolvedValue(
          createMockUpstreamsWithHealth() as unknown as PartialUpstream[]
        );

        // First selection
        const result1 = await selectUpstream("group-1", LoadBalancerStrategy.ROUND_ROBIN);
        // Second selection
        const result2 = await selectUpstream("group-1", LoadBalancerStrategy.ROUND_ROBIN);
        // Third selection (cycles back)
        const result3 = await selectUpstream("group-1", LoadBalancerStrategy.ROUND_ROBIN);

        // Should cycle through sorted order (by ID)
        const ids = [result1.upstream.id, result2.upstream.id, result3.upstream.id];
        expect(ids[0]).toBe(ids[2]); // First and third should be same (cycled)
        expect(ids[0]).not.toBe(ids[1]); // First and second should differ
      });
    });

    describe("weighted strategy", () => {
      it("should select upstream (weighted random)", async () => {
        const { selectUpstream } = await import("@/lib/services/load-balancer");
        const { db } = await import("@/lib/db");

        vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue({
          ...mockGroup,
          strategy: "weighted",
        } as unknown as PartialUpstreamGroup);
        vi.mocked(db.query.upstreams.findMany).mockResolvedValue(
          createMockUpstreamsWithHealth() as unknown as PartialUpstream[]
        );

        const result = await selectUpstream("group-1", LoadBalancerStrategy.WEIGHTED);

        // Should select one of the upstreams
        expect(["upstream-1", "upstream-2"]).toContain(result.upstream.id);
        expect(result.strategy).toBe(LoadBalancerStrategy.WEIGHTED);
      });

      it("should handle all zero weights", async () => {
        const { selectUpstream } = await import("@/lib/services/load-balancer");
        const { db } = await import("@/lib/db");

        vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue({
          ...mockGroup,
          strategy: "weighted",
        } as unknown as PartialUpstreamGroup);
        vi.mocked(db.query.upstreams.findMany).mockResolvedValue([
          {
            id: "upstream-1",
            name: "test-1",
            weight: 0,
            groupId: "group-1",
            isActive: true,
            health: { isHealthy: true, latencyMs: 50 },
          },
          {
            id: "upstream-2",
            name: "test-2",
            weight: 0,
            groupId: "group-1",
            isActive: true,
            health: { isHealthy: true, latencyMs: 100 },
          },
        ] as unknown as PartialUpstream[]);

        const result = await selectUpstream("group-1", LoadBalancerStrategy.WEIGHTED);

        // Should fall back to random selection
        expect(["upstream-1", "upstream-2"]).toContain(result.upstream.id);
      });
    });

    describe("least-connections strategy", () => {
      it("should select upstream with fewest connections", async () => {
        const { selectUpstream, recordConnection, resetConnectionCounts } =
          await import("@/lib/services/load-balancer");
        const { db } = await import("@/lib/db");

        resetConnectionCounts();

        vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue({
          ...mockGroup,
          strategy: "least_connections",
        } as unknown as PartialUpstreamGroup);
        vi.mocked(db.query.upstreams.findMany).mockResolvedValue(
          createMockUpstreamsWithHealth() as unknown as PartialUpstream[]
        );

        // Add connections to upstream-1
        recordConnection("upstream-1");
        recordConnection("upstream-1");
        // Add one connection to upstream-2
        recordConnection("upstream-2");

        const result = await selectUpstream("group-1", LoadBalancerStrategy.LEAST_CONNECTIONS);

        // Should select upstream-2 (fewer connections)
        expect(result.upstream.id).toBe("upstream-2");
      });

      it("should prefer higher weight when connections are equal", async () => {
        const { selectUpstream, resetConnectionCounts } =
          await import("@/lib/services/load-balancer");
        const { db } = await import("@/lib/db");

        resetConnectionCounts();

        vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue({
          ...mockGroup,
          strategy: "least_connections",
        } as unknown as PartialUpstreamGroup);
        vi.mocked(db.query.upstreams.findMany).mockResolvedValue(
          createMockUpstreamsWithHealth() as unknown as PartialUpstream[]
        );

        const result = await selectUpstream("group-1", LoadBalancerStrategy.LEAST_CONNECTIONS);

        // upstream-2 has weight 2, upstream-1 has weight 1
        // With 0 connections each, should prefer higher weight
        expect(result.upstream.id).toBe("upstream-2");
      });
    });
  });

  describe("getUpstreamGroupById", () => {
    it("should return group by id", async () => {
      const { getUpstreamGroupById } = await import("@/lib/services/load-balancer");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue({
        id: "group-1",
        name: "test-group",
        strategy: "round_robin",
      } as unknown as PartialUpstreamGroup);

      const result = await getUpstreamGroupById("group-1");

      expect(result).not.toBeNull();
      expect(result?.id).toBe("group-1");
      expect(result?.name).toBe("test-group");
    });

    it("should return null if group not found", async () => {
      const { getUpstreamGroupById } = await import("@/lib/services/load-balancer");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue(null);

      const result = await getUpstreamGroupById("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getUpstreamGroupByName", () => {
    it("should return group by name", async () => {
      const { getUpstreamGroupByName } = await import("@/lib/services/load-balancer");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue({
        id: "group-1",
        name: "test-group",
        strategy: "round_robin",
      } as unknown as PartialUpstreamGroup);

      const result = await getUpstreamGroupByName("test-group");

      expect(result).not.toBeNull();
      expect(result?.name).toBe("test-group");
    });

    it("should return null if group not found", async () => {
      const { getUpstreamGroupByName } = await import("@/lib/services/load-balancer");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue(null);

      const result = await getUpstreamGroupByName("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("resetRoundRobinIndices", () => {
    it("should reset round-robin state", async () => {
      const { selectUpstream, resetRoundRobinIndices } =
        await import("@/lib/services/load-balancer");
      const { db } = await import("@/lib/db");

      const mockGroup: PartialUpstreamGroup = {
        id: "group-1",
        name: "test-group",
        strategy: "round_robin",
      };

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue(
        mockGroup as unknown as PartialUpstreamGroup
      );
      vi.mocked(db.query.upstreams.findMany).mockResolvedValue([
        {
          id: "upstream-1",
          name: "test-1",
          weight: 1,
          groupId: "group-1",
          isActive: true,
          health: { isHealthy: true, latencyMs: 50 },
        },
        {
          id: "upstream-2",
          name: "test-2",
          weight: 1,
          groupId: "group-1",
          isActive: true,
          health: { isHealthy: true, latencyMs: 100 },
        },
      ] as unknown as PartialUpstream[]);

      // Make a selection
      const firstResult = await selectUpstream("group-1", LoadBalancerStrategy.ROUND_ROBIN);

      // Reset
      resetRoundRobinIndices();

      // Next selection should start from beginning again
      const afterResetResult = await selectUpstream("group-1", LoadBalancerStrategy.ROUND_ROBIN);

      // Both should be the same (first in sorted order)
      expect(firstResult.upstream.id).toBe(afterResetResult.upstream.id);
    });
  });
});
