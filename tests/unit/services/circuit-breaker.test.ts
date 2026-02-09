import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      circuitBreakerStates: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(),
      })),
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
  circuitBreakerStates: {
    upstreamId: "upstream_id",
  },
}));

import {
  CircuitBreakerStateEnum,
  DEFAULT_CONFIG,
  CircuitBreakerOpenError,
  canRequestPass,
  acquireCircuitBreakerPermit,
  recordSuccess,
  recordFailure,
  forceOpen,
  forceClose,
  getRemainingOpenSeconds,
  updateCircuitBreakerConfig,
  getOrCreateCircuitBreakerState,
} from "@/lib/services/circuit-breaker";
import { db } from "@/lib/db";

describe("Circuit Breaker", () => {
  const upstreamId = "test-upstream-1";
  const mockFindFirst = db.query.circuitBreakerStates.findFirst as ReturnType<typeof vi.fn>;
  const mockInsert = db.insert as ReturnType<typeof vi.fn>;
  const mockUpdate = db.update as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Configuration", () => {
    it("should have correct default config", () => {
      expect(DEFAULT_CONFIG.failureThreshold).toBe(5);
      expect(DEFAULT_CONFIG.successThreshold).toBe(2);
      expect(DEFAULT_CONFIG.openDuration).toBe(300000);
      expect(DEFAULT_CONFIG.probeInterval).toBe(30000);
    });
  });

  describe("State Enum", () => {
    it("should define correct states", () => {
      expect(CircuitBreakerStateEnum.CLOSED).toBe("closed");
      expect(CircuitBreakerStateEnum.OPEN).toBe("open");
      expect(CircuitBreakerStateEnum.HALF_OPEN).toBe("half_open");
    });
  });

  describe("getOrCreateCircuitBreakerState", () => {
    it("should return existing state if found", async () => {
      const existingState = {
        id: "cb-1",
        upstreamId,
        state: CircuitBreakerStateEnum.CLOSED,
        failureCount: 0,
        successCount: 0,
        config: null,
      };
      mockFindFirst.mockResolvedValue(existingState);

      const result = await getOrCreateCircuitBreakerState(upstreamId);

      expect(result).toEqual(existingState);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("should create new state if not found", async () => {
      mockFindFirst.mockResolvedValue(null);
      const newState = {
        id: "cb-1",
        upstreamId,
        state: CircuitBreakerStateEnum.CLOSED,
        failureCount: 0,
        successCount: 0,
      };
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newState]),
        }),
      });

      const result = await getOrCreateCircuitBreakerState(upstreamId);

      expect(result).toEqual(newState);
      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe("canRequestPass", () => {
    it("should allow requests when CLOSED", async () => {
      mockFindFirst.mockResolvedValue({
        id: "cb-1",
        upstreamId,
        state: CircuitBreakerStateEnum.CLOSED,
        failureCount: 0,
        successCount: 0,
        config: null,
      });

      const canPass = await canRequestPass(upstreamId);
      expect(canPass).toBe(true);
    });

    it("should block requests when OPEN and duration not elapsed", async () => {
      mockFindFirst.mockResolvedValue({
        id: "cb-1",
        upstreamId,
        state: CircuitBreakerStateEnum.OPEN,
        failureCount: 5,
        successCount: 0,
        openedAt: new Date(),
        config: null,
      });

      const canPass = await canRequestPass(upstreamId);
      expect(canPass).toBe(false);
    });

    it("should allow requests when OPEN but duration elapsed (transition to half-open)", async () => {
      mockFindFirst.mockResolvedValue({
        id: "cb-1",
        upstreamId,
        state: CircuitBreakerStateEnum.OPEN,
        failureCount: 5,
        successCount: 0,
        openedAt: new Date(Date.now() - 400000), // 400 seconds ago
        config: null,
      });
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const canPass = await canRequestPass(upstreamId);
      expect(canPass).toBe(true);
    });
  });

  describe("acquireCircuitBreakerPermit", () => {
    it("should throw CircuitBreakerOpenError when OPEN and duration not elapsed", async () => {
      mockFindFirst.mockResolvedValue({
        id: "cb-1",
        upstreamId,
        state: CircuitBreakerStateEnum.OPEN,
        failureCount: 5,
        successCount: 0,
        openedAt: new Date(),
        config: null,
      });

      await expect(acquireCircuitBreakerPermit(upstreamId)).rejects.toThrow(
        CircuitBreakerOpenError
      );
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("should transition to HALF_OPEN when OPEN duration elapsed", async () => {
      mockFindFirst.mockResolvedValue({
        id: "cb-1",
        upstreamId,
        state: CircuitBreakerStateEnum.OPEN,
        failureCount: 5,
        successCount: 0,
        openedAt: new Date(Date.now() - 400000), // 400 seconds ago
        config: null,
      });
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      await expect(acquireCircuitBreakerPermit(upstreamId)).resolves.toBeUndefined();
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("should allow first probe in HALF_OPEN when lastProbeAt is null (updates lastProbeAt)", async () => {
      mockFindFirst.mockResolvedValue({
        id: "cb-1",
        upstreamId,
        state: CircuitBreakerStateEnum.HALF_OPEN,
        failureCount: 3,
        successCount: 0,
        lastProbeAt: null,
        config: null,
      });
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      await expect(acquireCircuitBreakerPermit(upstreamId)).resolves.toBeUndefined();
      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe("recordSuccess", () => {
    it("should not update state when CLOSED", async () => {
      mockFindFirst.mockResolvedValue({
        id: "cb-1",
        upstreamId,
        state: CircuitBreakerStateEnum.CLOSED,
        failureCount: 0,
        successCount: 0,
        config: null,
      });

      await recordSuccess(upstreamId);

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("should increment success count in HALF_OPEN state", async () => {
      mockFindFirst.mockResolvedValue({
        id: "cb-1",
        upstreamId,
        state: CircuitBreakerStateEnum.HALF_OPEN,
        failureCount: 0,
        successCount: 1,
        config: null,
      });
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      await recordSuccess(upstreamId);

      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe("recordFailure", () => {
    it("should increment failure count in CLOSED state", async () => {
      mockFindFirst.mockResolvedValue({
        id: "cb-1",
        upstreamId,
        state: CircuitBreakerStateEnum.CLOSED,
        failureCount: 2,
        successCount: 0,
        config: null,
      });
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      await recordFailure(upstreamId);

      expect(mockUpdate).toHaveBeenCalled();
    });

    it("should transition to OPEN when failure threshold reached", async () => {
      mockFindFirst.mockResolvedValue({
        id: "cb-1",
        upstreamId,
        state: CircuitBreakerStateEnum.CLOSED,
        failureCount: 4, // One more will reach threshold of 5
        successCount: 0,
        config: null,
      });
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      await recordFailure(upstreamId);

      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe("Admin Controls", () => {
    it("should force open circuit", async () => {
      mockFindFirst.mockResolvedValue({
        id: "cb-1",
        upstreamId,
        state: CircuitBreakerStateEnum.CLOSED,
        failureCount: 0,
        successCount: 0,
        config: null,
      });
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      await forceOpen(upstreamId);

      expect(mockUpdate).toHaveBeenCalled();
    });

    it("should force close circuit", async () => {
      mockFindFirst.mockResolvedValue({
        id: "cb-1",
        upstreamId,
        state: CircuitBreakerStateEnum.OPEN,
        failureCount: 5,
        successCount: 0,
        config: null,
      });
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      await forceClose(upstreamId);

      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe("getRemainingOpenSeconds", () => {
    it("should return 0 when CLOSED", async () => {
      mockFindFirst.mockResolvedValue({
        id: "cb-1",
        upstreamId,
        state: CircuitBreakerStateEnum.CLOSED,
        failureCount: 0,
        successCount: 0,
        config: null,
      });

      const remaining = await getRemainingOpenSeconds(upstreamId);
      expect(remaining).toBe(0);
    });

    it("should return remaining seconds when OPEN", async () => {
      mockFindFirst.mockResolvedValue({
        id: "cb-1",
        upstreamId,
        state: CircuitBreakerStateEnum.OPEN,
        failureCount: 5,
        successCount: 0,
        openedAt: new Date(Date.now() - 10000), // 10 seconds ago
        config: null,
      });

      const remaining = await getRemainingOpenSeconds(upstreamId);
      expect(remaining).toBe(290); // 300 - 10 = 290
    });
  });

  describe("updateCircuitBreakerConfig", () => {
    it("should update config with custom values", async () => {
      mockFindFirst.mockResolvedValue({
        id: "cb-1",
        upstreamId,
        state: CircuitBreakerStateEnum.CLOSED,
        failureCount: 0,
        successCount: 0,
        config: { failureThreshold: 3 },
      });
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      await updateCircuitBreakerConfig(upstreamId, { openDuration: 60000 });

      expect(mockUpdate).toHaveBeenCalled();
    });
  });
});
