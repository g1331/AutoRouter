import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  UpstreamNotFoundError,
  type HealthStatus,
  type HealthCheckResult,
} from "@/lib/services/health-checker";
import { getCircuitBreakerState, CircuitBreakerStateEnum } from "@/lib/services/circuit-breaker";
import { testUpstreamConnection } from "@/lib/services/upstream-connection-tester";

// Type helpers for mocking Drizzle ORM query builder
type MockInsertChain = {
  values: ReturnType<typeof vi.fn>;
};

type MockUpdateChain = {
  set: ReturnType<typeof vi.fn>;
};

type MockDeleteChain = {
  where: ReturnType<typeof vi.fn>;
};

// Mock database
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      upstreams: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      upstreamHealth: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(),
    })),
  },
  upstreams: {},
  upstreamHealth: {},
}));

// Mock encryption
vi.mock("@/lib/utils/encryption", () => ({
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
  decrypt: vi.fn((value: string) => {
    if (value === "encrypted:bad-key") {
      throw new Error("Decryption failed");
    }
    return value.replace("encrypted:", "");
  }),
}));

// Mock upstream-connection-tester
vi.mock("@/lib/services/upstream-connection-tester", () => ({
  testUpstreamConnection: vi.fn(),
}));

// Mock circuit-breaker module
vi.mock("@/lib/services/circuit-breaker", () => ({
  CircuitBreakerStateEnum: {
    CLOSED: "closed",
    OPEN: "open",
    HALF_OPEN: "half_open",
  },
  DEFAULT_CONFIG: {
    failureThreshold: 5,
    successThreshold: 2,
    openDuration: 300000,
    probeInterval: 30000,
  },
  getCircuitBreakerState: vi.fn(),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
  canRequestPass: vi.fn(),
}));

describe("health-checker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper to create mock upstream data
  function createMockUpstream(
    overrides: Partial<{
      id: string;
      name: string;
      providerType: string;
      baseUrl: string;
      apiKeyEncrypted: string;
      timeout: number;
      isActive: boolean;
      health: {
        id: string;
        upstreamId: string;
        isHealthy: boolean;
        lastCheckAt: Date | null;
        lastSuccessAt: Date | null;
        failureCount: number;
        latencyMs: number | null;
        errorMessage: string | null;
      } | null;
    }> = {}
  ) {
    return {
      id: "upstream-1",
      name: "test-upstream",
      providerType: "openai",
      baseUrl: "https://api.openai.com",
      apiKeyEncrypted: "encrypted:sk-test-key",
      timeout: 60,
      isActive: true,
      health: null,
      ...overrides,
    };
  }

  // Helper to create mock health data
  function createMockHealth(
    overrides: Partial<{
      id: string;
      upstreamId: string;
      isHealthy: boolean;
      lastCheckAt: Date | null;
      lastSuccessAt: Date | null;
      failureCount: number;
      latencyMs: number | null;
      errorMessage: string | null;
    }> = {}
  ) {
    return {
      id: "health-1",
      upstreamId: "upstream-1",
      isHealthy: true,
      lastCheckAt: new Date("2024-01-15T11:55:00.000Z"),
      lastSuccessAt: new Date("2024-01-15T11:55:00.000Z"),
      failureCount: 0,
      latencyMs: 150,
      errorMessage: null,
      ...overrides,
    };
  }

  describe("UpstreamNotFoundError", () => {
    it("should have correct name", () => {
      const error = new UpstreamNotFoundError("Upstream not found: test-id");
      expect(error.name).toBe("UpstreamNotFoundError");
    });

    it("should have correct message", () => {
      const error = new UpstreamNotFoundError("Upstream not found: test-id");
      expect(error.message).toBe("Upstream not found: test-id");
    });

    it("should be instanceof Error", () => {
      const error = new UpstreamNotFoundError("test");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("getHealthStatus", () => {
    it("should return health status for existing upstream with health record", async () => {
      const { getHealthStatus } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      const mockHealth = createMockHealth();
      const mockUpstream = createMockUpstream({ health: mockHealth });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);

      const result = await getHealthStatus("upstream-1");

      expect(result).toEqual({
        upstreamId: "upstream-1",
        upstreamName: "test-upstream",
        isHealthy: true,
        lastCheckAt: new Date("2024-01-15T11:55:00.000Z"),
        lastSuccessAt: new Date("2024-01-15T11:55:00.000Z"),
        failureCount: 0,
        latencyMs: 150,
        errorMessage: null,
      });
    });

    it("should return default values when upstream has no health record", async () => {
      const { getHealthStatus } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      const mockUpstream = createMockUpstream({ health: null });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);

      const result = await getHealthStatus("upstream-1");

      expect(result).toEqual({
        upstreamId: "upstream-1",
        upstreamName: "test-upstream",
        isHealthy: true, // Default to healthy
        lastCheckAt: null,
        lastSuccessAt: null,
        failureCount: 0,
        latencyMs: null,
        errorMessage: null,
      });
    });

    it("should return null for non-existent upstream", async () => {
      const { getHealthStatus } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

      const result = await getHealthStatus("non-existent-id");

      expect(result).toBeNull();
    });

    it("should return unhealthy status with error message", async () => {
      const { getHealthStatus } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      const mockHealth = createMockHealth({
        isHealthy: false,
        failureCount: 3,
        errorMessage: "Connection timeout",
        lastSuccessAt: new Date("2024-01-15T10:00:00.000Z"),
      });
      const mockUpstream = createMockUpstream({ health: mockHealth });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);

      const result = await getHealthStatus("upstream-1");

      expect(result).toEqual({
        upstreamId: "upstream-1",
        upstreamName: "test-upstream",
        isHealthy: false,
        lastCheckAt: new Date("2024-01-15T11:55:00.000Z"),
        lastSuccessAt: new Date("2024-01-15T10:00:00.000Z"),
        failureCount: 3,
        latencyMs: 150,
        errorMessage: "Connection timeout",
      });
    });
  });

  describe("updateHealthStatus", () => {
    it("should update existing health record with healthy status", async () => {
      const { updateHealthStatus } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      const mockHealth = createMockHealth({ isHealthy: false, failureCount: 2 });
      const mockUpstream = createMockUpstream({ health: mockHealth });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as MockUpdateChain);

      const result = await updateHealthStatus("upstream-1", true, 100, null);

      expect(result.isHealthy).toBe(true);
      expect(result.failureCount).toBe(0);
      expect(result.latencyMs).toBe(100);
      expect(result.errorMessage).toBeNull();
      expect(result.lastCheckAt).toEqual(new Date("2024-01-15T12:00:00.000Z"));
      expect(result.lastSuccessAt).toEqual(new Date("2024-01-15T12:00:00.000Z"));
    });

    it("should update existing health record with unhealthy status", async () => {
      const { updateHealthStatus } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      const mockHealth = createMockHealth({
        failureCount: 1,
        lastSuccessAt: new Date("2024-01-15T10:00:00.000Z"),
      });
      const mockUpstream = createMockUpstream({ health: mockHealth });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as MockUpdateChain);

      const result = await updateHealthStatus("upstream-1", false, null, "Connection timeout");

      expect(result.isHealthy).toBe(false);
      expect(result.failureCount).toBe(2); // Incremented from 1
      expect(result.latencyMs).toBeNull();
      expect(result.errorMessage).toBe("Connection timeout");
      expect(result.lastSuccessAt).toEqual(new Date("2024-01-15T10:00:00.000Z")); // Unchanged
    });

    it("should create new health record when none exists - healthy", async () => {
      const { updateHealthStatus } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      const mockUpstream = createMockUpstream({ health: null });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      } as unknown as MockInsertChain);

      const result = await updateHealthStatus("upstream-1", true, 200, null);

      expect(result.isHealthy).toBe(true);
      expect(result.failureCount).toBe(0);
      expect(result.latencyMs).toBe(200);
      expect(result.lastSuccessAt).toEqual(new Date("2024-01-15T12:00:00.000Z"));
      expect(db.insert).toHaveBeenCalled();
    });

    it("should create new health record when none exists - unhealthy", async () => {
      const { updateHealthStatus } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      const mockUpstream = createMockUpstream({ health: null });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      } as unknown as MockInsertChain);

      const result = await updateHealthStatus("upstream-1", false, null, "Initial failure");

      expect(result.isHealthy).toBe(false);
      expect(result.failureCount).toBe(1);
      expect(result.lastSuccessAt).toBeNull();
      expect(result.errorMessage).toBe("Initial failure");
    });

    it("should throw UpstreamNotFoundError for non-existent upstream", async () => {
      const { updateHealthStatus, UpstreamNotFoundError } =
        await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

      await expect(updateHealthStatus("non-existent", true, 100)).rejects.toThrow(
        UpstreamNotFoundError
      );
      await expect(updateHealthStatus("non-existent", true, 100)).rejects.toThrow(
        "Upstream not found: non-existent"
      );
    });
  });

  describe("markUnhealthy", () => {
    it("should mark upstream as unhealthy with reason", async () => {
      const { markUnhealthy } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      const mockHealth = createMockHealth({ failureCount: 0 });
      const mockUpstream = createMockUpstream({ health: mockHealth });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as MockUpdateChain);

      const result = await markUnhealthy("upstream-1", "API key expired");

      expect(result.isHealthy).toBe(false);
      expect(result.errorMessage).toBe("API key expired");
      expect(result.latencyMs).toBeNull();
    });

    it("should throw UpstreamNotFoundError for non-existent upstream", async () => {
      const { markUnhealthy, UpstreamNotFoundError } =
        await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

      await expect(markUnhealthy("non-existent", "reason")).rejects.toThrow(UpstreamNotFoundError);
    });
  });

  describe("markHealthy", () => {
    it("should mark upstream as healthy with latency", async () => {
      const { markHealthy } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      const mockHealth = createMockHealth({ isHealthy: false, failureCount: 3 });
      const mockUpstream = createMockUpstream({ health: mockHealth });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as MockUpdateChain);

      const result = await markHealthy("upstream-1", 75);

      expect(result.isHealthy).toBe(true);
      expect(result.latencyMs).toBe(75);
      expect(result.failureCount).toBe(0);
      expect(result.errorMessage).toBeNull();
    });

    it("should throw UpstreamNotFoundError for non-existent upstream", async () => {
      const { markHealthy, UpstreamNotFoundError } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

      await expect(markHealthy("non-existent", 100)).rejects.toThrow(UpstreamNotFoundError);
    });
  });

  describe("checkUpstreamHealth", () => {
    it("should perform health check and update status on success", async () => {
      const { checkUpstreamHealth } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");
      const { testUpstreamConnection } = await import("@/lib/services/upstream-connection-tester");

      const mockHealth = createMockHealth();
      const mockUpstream = createMockUpstream({ health: mockHealth });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);
      vi.mocked(testUpstreamConnection).mockResolvedValue({
        success: true,
        message: "Connection successful",
        latencyMs: 85,
        statusCode: 200,
        testedAt: new Date("2024-01-15T12:00:00.000Z"),
      });
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as MockUpdateChain);

      const result = await checkUpstreamHealth("upstream-1");

      expect(result.success).toBe(true);
      expect(result.latencyMs).toBe(85);
      expect(result.errorMessage).toBeNull();
      expect(result.healthStatus.isHealthy).toBe(true);
      expect(testUpstreamConnection).toHaveBeenCalledWith({
        providerType: "openai",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-test-key",
        timeout: 60,
      });
    });

    it("should perform health check and update status on failure", async () => {
      const { checkUpstreamHealth } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");
      const { testUpstreamConnection } = await import("@/lib/services/upstream-connection-tester");

      const mockHealth = createMockHealth({ failureCount: 0 });
      const mockUpstream = createMockUpstream({ health: mockHealth });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);
      vi.mocked(testUpstreamConnection).mockResolvedValue({
        success: false,
        message: "Authentication failed - invalid API key",
        latencyMs: 50,
        statusCode: 401,
        errorType: "authentication",
        errorDetails: "HTTP 401",
        testedAt: new Date("2024-01-15T12:00:00.000Z"),
      });
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as MockUpdateChain);

      const result = await checkUpstreamHealth("upstream-1");

      expect(result.success).toBe(false);
      expect(result.latencyMs).toBe(50);
      expect(result.errorMessage).toBe("Authentication failed - invalid API key");
      expect(result.healthStatus.isHealthy).toBe(false);
    });

    it("should use provided timeout over upstream timeout", async () => {
      const { checkUpstreamHealth } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");
      const { testUpstreamConnection } = await import("@/lib/services/upstream-connection-tester");

      const mockHealth = createMockHealth();
      const mockUpstream = createMockUpstream({ health: mockHealth });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);
      vi.mocked(testUpstreamConnection).mockResolvedValue({
        success: true,
        message: "Connection successful",
        latencyMs: 100,
        statusCode: 200,
        testedAt: new Date("2024-01-15T12:00:00.000Z"),
      });
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as MockUpdateChain);

      await checkUpstreamHealth("upstream-1", 5);

      expect(testUpstreamConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5, // Provided timeout takes precedence
        })
      );
    });

    it("should handle API key decryption failure", async () => {
      const { checkUpstreamHealth } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      const mockHealth = createMockHealth();
      const mockUpstream = createMockUpstream({
        health: mockHealth,
        apiKeyEncrypted: "encrypted:bad-key", // Will trigger decryption error
      });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as MockUpdateChain);

      const result = await checkUpstreamHealth("upstream-1");

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe("Failed to decrypt API key");
      expect(result.healthStatus.isHealthy).toBe(false);
    });

    it("should throw UpstreamNotFoundError for non-existent upstream", async () => {
      const { checkUpstreamHealth, UpstreamNotFoundError } =
        await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

      await expect(checkUpstreamHealth("non-existent")).rejects.toThrow(UpstreamNotFoundError);
    });

    it("should use default timeout when no timeout is configured", async () => {
      const { checkUpstreamHealth } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");
      const { testUpstreamConnection } = await import("@/lib/services/upstream-connection-tester");

      const mockHealth = createMockHealth();
      const mockUpstream = createMockUpstream({
        health: mockHealth,
        timeout: null,
      });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);
      vi.mocked(testUpstreamConnection).mockResolvedValue({
        success: true,
        message: "Connection successful",
        latencyMs: 100,
        statusCode: 200,
        testedAt: new Date("2024-01-15T12:00:00.000Z"),
      });
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as MockUpdateChain);

      await checkUpstreamHealth("upstream-1");

      expect(testUpstreamConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 10, // Default timeout
        })
      );
    });
  });

  describe("getAllHealthStatus", () => {
    it("should return health status for all active upstreams by default", async () => {
      const { getAllHealthStatus } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      const mockUpstreams = [
        createMockUpstream({
          id: "upstream-1",
          name: "active-1",
          isActive: true,
          health: createMockHealth(),
        }),
        createMockUpstream({
          id: "upstream-2",
          name: "active-2",
          isActive: true,
          health: createMockHealth({ id: "health-2", upstreamId: "upstream-2" }),
        }),
      ];

      vi.mocked(db.query.upstreams.findMany).mockResolvedValue(mockUpstreams);

      const results = await getAllHealthStatus();

      expect(results).toHaveLength(2);
      expect(results[0].upstreamName).toBe("active-1");
      expect(results[1].upstreamName).toBe("active-2");
    });

    it("should return health status for all upstreams when activeOnly is false", async () => {
      const { getAllHealthStatus } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      const mockUpstreams = [
        createMockUpstream({
          id: "upstream-1",
          name: "active",
          isActive: true,
          health: createMockHealth(),
        }),
        createMockUpstream({
          id: "upstream-2",
          name: "inactive",
          isActive: false,
          health: createMockHealth({ id: "health-2", upstreamId: "upstream-2" }),
        }),
      ];

      vi.mocked(db.query.upstreams.findMany).mockResolvedValue(mockUpstreams);

      const results = await getAllHealthStatus(false);

      expect(results).toHaveLength(2);
    });

    it("should return default health values for upstreams without health records", async () => {
      const { getAllHealthStatus } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      const mockUpstreams = [createMockUpstream({ id: "upstream-1", health: null })];

      vi.mocked(db.query.upstreams.findMany).mockResolvedValue(mockUpstreams);

      const results = await getAllHealthStatus();

      expect(results[0].isHealthy).toBe(true);
      expect(results[0].failureCount).toBe(0);
      expect(results[0].lastCheckAt).toBeNull();
    });
  });

  describe("initializeHealthRecord", () => {
    it("should return existing health status if record exists", async () => {
      const { initializeHealthRecord } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      const mockHealth = createMockHealth();
      const mockUpstream = createMockUpstream({ health: mockHealth });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);

      const result = await initializeHealthRecord("upstream-1");

      expect(result.upstreamId).toBe("upstream-1");
      expect(result.isHealthy).toBe(true);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("should return default health status when upstream exists without health record", async () => {
      const { initializeHealthRecord } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      // Upstream exists but has no health record - getHealthStatus returns default values
      const mockUpstreamNoHealth = createMockUpstream({ health: null });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstreamNoHealth);

      const result = await initializeHealthRecord("upstream-1");

      // Returns default healthy values since upstream exists
      expect(result.upstreamId).toBe("upstream-1");
      expect(result.isHealthy).toBe(true);
      expect(result.failureCount).toBe(0);
      expect(result.lastCheckAt).toBeNull();
      // No insert should occur since getHealthStatus returned a value
    });
  });

  describe("deleteHealthRecord", () => {
    it("should delete health record for upstream", async () => {
      const { deleteHealthRecord } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      const mockWhere = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.delete).mockReturnValue({
        where: mockWhere,
      } as unknown as MockDeleteChain);

      await deleteHealthRecord("upstream-1");

      expect(db.delete).toHaveBeenCalled();
      expect(mockWhere).toHaveBeenCalled();
    });
  });

  describe("formatHealthStatusResponse", () => {
    it("should convert HealthStatus to snake_case format", async () => {
      const { formatHealthStatusResponse } = await import("@/lib/services/health-checker");

      const status: HealthStatus = {
        upstreamId: "upstream-1",
        upstreamName: "test-upstream",
        isHealthy: true,
        lastCheckAt: new Date("2024-01-15T12:00:00.000Z"),
        lastSuccessAt: new Date("2024-01-15T12:00:00.000Z"),
        failureCount: 0,
        latencyMs: 150,
        errorMessage: null,
      };

      const formatted = formatHealthStatusResponse(status);

      expect(formatted).toEqual({
        upstream_id: "upstream-1",
        upstream_name: "test-upstream",
        is_healthy: true,
        last_check_at: "2024-01-15T12:00:00.000Z",
        last_success_at: "2024-01-15T12:00:00.000Z",
        failure_count: 0,
        latency_ms: 150,
        error_message: null,
      });
    });

    it("should handle null date values", async () => {
      const { formatHealthStatusResponse } = await import("@/lib/services/health-checker");

      const status: HealthStatus = {
        upstreamId: "upstream-1",
        upstreamName: "test-upstream",
        isHealthy: false,
        lastCheckAt: null,
        lastSuccessAt: null,
        failureCount: 5,
        latencyMs: null,
        errorMessage: "Connection failed",
      };

      const formatted = formatHealthStatusResponse(status);

      expect(formatted).toEqual({
        upstream_id: "upstream-1",
        upstream_name: "test-upstream",
        is_healthy: false,
        last_check_at: null,
        last_success_at: null,
        failure_count: 5,
        latency_ms: null,
        error_message: "Connection failed",
      });
    });
  });

  describe("formatHealthCheckResultResponse", () => {
    it("should convert HealthCheckResult to snake_case format", async () => {
      const { formatHealthCheckResultResponse } = await import("@/lib/services/health-checker");

      const result: HealthCheckResult = {
        upstreamId: "upstream-1",
        success: true,
        latencyMs: 85,
        errorMessage: null,
        checkedAt: new Date("2024-01-15T12:00:00.000Z"),
        healthStatus: {
          upstreamId: "upstream-1",
          upstreamName: "test-upstream",
          isHealthy: true,
          lastCheckAt: new Date("2024-01-15T12:00:00.000Z"),
          lastSuccessAt: new Date("2024-01-15T12:00:00.000Z"),
          failureCount: 0,
          latencyMs: 85,
          errorMessage: null,
        },
      };

      const formatted = formatHealthCheckResultResponse(result);

      expect(formatted).toEqual({
        upstream_id: "upstream-1",
        success: true,
        latency_ms: 85,
        error_message: null,
        checked_at: "2024-01-15T12:00:00.000Z",
        health_status: {
          upstream_id: "upstream-1",
          upstream_name: "test-upstream",
          is_healthy: true,
          last_check_at: "2024-01-15T12:00:00.000Z",
          last_success_at: "2024-01-15T12:00:00.000Z",
          failure_count: 0,
          latency_ms: 85,
          error_message: null,
        },
      });
    });

    it("should handle failed health check result", async () => {
      const { formatHealthCheckResultResponse } = await import("@/lib/services/health-checker");

      const result: HealthCheckResult = {
        upstreamId: "upstream-1",
        success: false,
        latencyMs: null,
        errorMessage: "Connection timeout",
        checkedAt: new Date("2024-01-15T12:00:00.000Z"),
        healthStatus: {
          upstreamId: "upstream-1",
          upstreamName: "test-upstream",
          isHealthy: false,
          lastCheckAt: new Date("2024-01-15T12:00:00.000Z"),
          lastSuccessAt: new Date("2024-01-15T11:00:00.000Z"),
          failureCount: 3,
          latencyMs: null,
          errorMessage: "Connection timeout",
        },
      };

      const formatted = formatHealthCheckResultResponse(result);

      expect(formatted.success).toBe(false);
      expect(formatted.latency_ms).toBeNull();
      expect(formatted.error_message).toBe("Connection timeout");
      expect(formatted.health_status.is_healthy).toBe(false);
      expect(formatted.health_status.failure_count).toBe(3);
    });
  });

  // Circuit Breaker Integration Tests
  describe("Circuit Breaker Integration", () => {
    it("should get circuit breaker status for closed state", async () => {
      const { getCircuitBreakerStatus } = await import("@/lib/services/health-checker");

      vi.mocked(getCircuitBreakerState).mockResolvedValue({
        id: "cb-1",
        upstreamId: "upstream-1",
        state: CircuitBreakerStateEnum.CLOSED,
        failureCount: 0,
        successCount: 0,
        openedAt: null,
        lastFailureAt: null,
        config: null,
      });

      const result = await getCircuitBreakerStatus("upstream-1");

      expect(result).not.toBeNull();
      expect(result?.state).toBe("closed");
      expect(result?.failureCount).toBe(0);
      expect(result?.remainingOpenSeconds).toBe(0);
      expect(result?.config.failureThreshold).toBe(5);
    });

    it("should calculate remaining open seconds for open state", async () => {
      const { getCircuitBreakerStatus } = await import("@/lib/services/health-checker");

      const openedAt = new Date(Date.now() - 10000); // 10 seconds ago
      vi.mocked(getCircuitBreakerState).mockResolvedValue({
        id: "cb-1",
        upstreamId: "upstream-1",
        state: CircuitBreakerStateEnum.OPEN,
        failureCount: 5,
        successCount: 0,
        openedAt,
        lastFailureAt: openedAt,
        config: null,
      });

      const result = await getCircuitBreakerStatus("upstream-1");

      expect(result).not.toBeNull();
      expect(result?.state).toBe("open");
      expect(result?.remainingOpenSeconds).toBe(290); // 300 - 10 = 290
    });

    it("should return zero remaining seconds if open duration elapsed", async () => {
      const { getCircuitBreakerStatus } = await import("@/lib/services/health-checker");

      const openedAt = new Date(Date.now() - 400000); // 400 seconds ago
      vi.mocked(getCircuitBreakerState).mockResolvedValue({
        id: "cb-1",
        upstreamId: "upstream-1",
        state: CircuitBreakerStateEnum.OPEN,
        failureCount: 5,
        successCount: 0,
        openedAt,
        lastFailureAt: openedAt,
        config: null,
      });

      const result = await getCircuitBreakerStatus("upstream-1");

      expect(result).not.toBeNull();
      expect(result?.remainingOpenSeconds).toBe(0);
    });

    it("should include circuit breaker status in health status when requested", async () => {
      const { getHealthStatusWithCircuitBreaker } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      const mockUpstream = createMockUpstream({
        id: "upstream-1",
        health: createMockHealth(),
      });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);
      vi.mocked(getCircuitBreakerState).mockResolvedValue({
        id: "cb-1",
        upstreamId: "upstream-1",
        state: CircuitBreakerStateEnum.CLOSED,
        failureCount: 2,
        successCount: 1,
        openedAt: null,
        lastFailureAt: new Date("2024-01-15T10:00:00.000Z"),
        config: { failureThreshold: 3 },
      });

      const result = await getHealthStatusWithCircuitBreaker("upstream-1", true);

      expect(result).not.toBeNull();
      expect(result?.circuitBreaker).toBeDefined();
      expect(result?.circuitBreaker?.state).toBe("closed");
      expect(result?.circuitBreaker?.failureCount).toBe(2);
      expect(result?.circuitBreaker?.config.failureThreshold).toBe(3);
    });

    it("should not include circuit breaker status when not requested", async () => {
      const { getHealthStatusWithCircuitBreaker } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      const mockUpstream = createMockUpstream({
        id: "upstream-1",
        health: createMockHealth(),
      });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);

      const result = await getHealthStatusWithCircuitBreaker("upstream-1", false);

      expect(result).not.toBeNull();
      expect(result?.circuitBreaker).toBeUndefined();
    });

    it("should return null circuit breaker status if no state exists", async () => {
      const { getHealthStatusWithCircuitBreaker } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      const mockUpstream = createMockUpstream({
        id: "upstream-1",
        health: createMockHealth(),
      });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);
      vi.mocked(getCircuitBreakerState).mockResolvedValue(null);

      const result = await getHealthStatusWithCircuitBreaker("upstream-1", true);

      expect(result).not.toBeNull();
      expect(result?.circuitBreaker).toBeNull();
    });
  });

  describe("probeUpstream", () => {
    it("should return true when probe succeeds", async () => {
      const { probeUpstream } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      const mockUpstream = createMockUpstream({
        id: "upstream-1",
        isActive: true,
        providerType: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted-key",
      });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);
      vi.mocked(testUpstreamConnection).mockResolvedValue({
        success: true,
        latencyMs: 150,
        message: "OK",
        testedAt: new Date(),
      });

      const result = await probeUpstream("upstream-1");

      expect(result).toBe(true);
    });

    it("should return false when probe fails", async () => {
      const { probeUpstream } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      const mockUpstream = createMockUpstream({
        id: "upstream-1",
        isActive: true,
        providerType: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted-key",
      });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);
      vi.mocked(testUpstreamConnection).mockResolvedValue({
        success: false,
        latencyMs: null,
        message: "Connection refused",
        testedAt: new Date(),
      });

      const result = await probeUpstream("upstream-1");

      expect(result).toBe(false);
    });

    it("should return false if upstream not found", async () => {
      const { probeUpstream } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

      const result = await probeUpstream("upstream-1");

      expect(result).toBe(false);
    });

    it("should return false if upstream is inactive", async () => {
      const { probeUpstream } = await import("@/lib/services/health-checker");
      const { db } = await import("@/lib/db");

      const mockUpstream = createMockUpstream({
        id: "upstream-1",
        isActive: false,
      });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);

      const result = await probeUpstream("upstream-1");

      expect(result).toBe(false);
      expect(testUpstreamConnection).not.toHaveBeenCalled();
    });
  });

  describe("formatCircuitBreakerStatusResponse", () => {
    it("should format circuit breaker status correctly", async () => {
      const { formatCircuitBreakerStatusResponse } = await import("@/lib/services/health-checker");

      const status = {
        state: "closed" as const,
        failureCount: 2,
        successCount: 1,
        openedAt: null,
        lastFailureAt: new Date("2024-01-15T10:00:00.000Z"),
        remainingOpenSeconds: 0,
        config: {
          failureThreshold: 5,
          successThreshold: 2,
          openDuration: 300000,
          probeInterval: 30000,
        },
      };

      const result = formatCircuitBreakerStatusResponse(status);

      expect(result.state).toBe("closed");
      expect(result.failure_count).toBe(2);
      expect(result.success_count).toBe(1);
      expect(result.opened_at).toBeNull();
      expect(result.last_failure_at).toBe("2024-01-15T10:00:00.000Z");
      expect(result.remaining_open_seconds).toBe(0);
      expect(result.config.failure_threshold).toBe(5);
      expect(result.config.open_duration).toBe(300);
      expect(result.config.probe_interval).toBe(30);
    });

    it("should format open circuit breaker status", async () => {
      const { formatCircuitBreakerStatusResponse } = await import("@/lib/services/health-checker");

      const status = {
        state: "open" as const,
        failureCount: 5,
        successCount: 0,
        openedAt: new Date("2024-01-15T12:00:00.000Z"),
        lastFailureAt: new Date("2024-01-15T12:00:00.000Z"),
        remainingOpenSeconds: 15,
        config: {
          failureThreshold: 5,
          successThreshold: 2,
          openDuration: 300000,
          probeInterval: 30000,
        },
      };

      const result = formatCircuitBreakerStatusResponse(status);

      expect(result.state).toBe("open");
      expect(result.opened_at).toBe("2024-01-15T12:00:00.000Z");
      expect(result.remaining_open_seconds).toBe(15);
      expect(result.config.open_duration).toBe(300);
    });
  });
});
