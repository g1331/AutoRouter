import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock drizzle-orm operators
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    and: vi.fn((...args) => ({ __op: "and", args })),
    eq: vi.fn((col, val) => ({ __op: "eq", col, val })),
    gte: vi.fn((col, val) => ({ __op: "gte", col, val })),
    inArray: vi.fn((col, vals) => ({ __op: "inArray", col, vals })),
    sum: vi.fn((col) => ({ __op: "sum", col })),
  };
});

const selectMock = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    select: selectMock,
  },
  requestBillingSnapshots: {
    upstreamId: "upstream_id",
    billingStatus: "billing_status",
    billedAt: "billed_at",
    finalCost: "final_cost",
  },
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("upstream-quota-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getQuotaExceededUpstreamIds", () => {
    it("returns empty array when no upstreams have limits configured", async () => {
      const { getQuotaExceededUpstreamIds } = await import(
        "@/lib/services/upstream-quota-service"
      );

      const result = await getQuotaExceededUpstreamIds([
        { id: "upstream-1", dailySpendingLimit: null, monthlySpendingLimit: null },
        { id: "upstream-2", dailySpendingLimit: null, monthlySpendingLimit: null },
      ]);

      expect(result).toEqual([]);
      expect(selectMock).not.toHaveBeenCalled();
    });

    it("returns empty array when upstream list is empty", async () => {
      const { getQuotaExceededUpstreamIds } = await import(
        "@/lib/services/upstream-quota-service"
      );

      const result = await getQuotaExceededUpstreamIds([]);

      expect(result).toEqual([]);
      expect(selectMock).not.toHaveBeenCalled();
    });

    it("returns empty array when spending is below limits", async () => {
      const chainMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockResolvedValue([
          { upstreamId: "upstream-1", total: "0.50" },
        ]),
      };
      selectMock.mockReturnValue(chainMock);

      const { getQuotaExceededUpstreamIds } = await import(
        "@/lib/services/upstream-quota-service"
      );

      const result = await getQuotaExceededUpstreamIds([
        { id: "upstream-1", dailySpendingLimit: 10, monthlySpendingLimit: null },
      ]);

      expect(result).toEqual([]);
    });

    it("returns upstream IDs that have exceeded daily limit", async () => {
      const chainMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi
          .fn()
          .mockResolvedValueOnce([{ upstreamId: "upstream-1", total: "15.00" }]) // daily
          .mockResolvedValueOnce([{ upstreamId: "upstream-1", total: "15.00" }]), // monthly
      };
      selectMock.mockReturnValue(chainMock);

      const { getQuotaExceededUpstreamIds } = await import(
        "@/lib/services/upstream-quota-service"
      );

      const result = await getQuotaExceededUpstreamIds([
        { id: "upstream-1", dailySpendingLimit: 10, monthlySpendingLimit: null },
      ]);

      expect(result).toContain("upstream-1");
    });

    it("returns upstream IDs that have exceeded monthly limit", async () => {
      const chainMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi
          .fn()
          .mockResolvedValueOnce([]) // daily - none exceeded
          .mockResolvedValueOnce([{ upstreamId: "upstream-2", total: "110.00" }]), // monthly exceeded
      };
      selectMock.mockReturnValue(chainMock);

      const { getQuotaExceededUpstreamIds } = await import(
        "@/lib/services/upstream-quota-service"
      );

      const result = await getQuotaExceededUpstreamIds([
        { id: "upstream-2", dailySpendingLimit: null, monthlySpendingLimit: 100 },
      ]);

      expect(result).toContain("upstream-2");
    });

    it("does not block routing on quota check failure", async () => {
      selectMock.mockImplementation(() => {
        throw new Error("DB connection failed");
      });

      const { getQuotaExceededUpstreamIds } = await import(
        "@/lib/services/upstream-quota-service"
      );

      const result = await getQuotaExceededUpstreamIds([
        { id: "upstream-1", dailySpendingLimit: 10, monthlySpendingLimit: null },
      ]);

      expect(result).toEqual([]);
    });
  });

  describe("isUpstreamQuotaExceeded", () => {
    it("returns false when both limits are null", async () => {
      const { isUpstreamQuotaExceeded } = await import(
        "@/lib/services/upstream-quota-service"
      );

      const result = await isUpstreamQuotaExceeded("upstream-1", null, null);

      expect(result).toBe(false);
      expect(selectMock).not.toHaveBeenCalled();
    });

    it("returns false when spending is below daily limit", async () => {
      const chainMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ total: "5.00" }]),
      };
      selectMock.mockReturnValue(chainMock);

      const { isUpstreamQuotaExceeded } = await import(
        "@/lib/services/upstream-quota-service"
      );

      const result = await isUpstreamQuotaExceeded("upstream-1", 10, null);

      expect(result).toBe(false);
    });

    it("returns true when spending meets or exceeds daily limit", async () => {
      const chainMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ total: "10.00" }]),
      };
      selectMock.mockReturnValue(chainMock);

      const { isUpstreamQuotaExceeded } = await import(
        "@/lib/services/upstream-quota-service"
      );

      const result = await isUpstreamQuotaExceeded("upstream-1", 10, null);

      expect(result).toBe(true);
    });
  });
});
