import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuotaConfig } from "@/lib/services/upstream-quota-tracker";

const { findManyMock, selectMock, fromMock, whereMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(async () => [] as unknown[]),
  selectMock: vi.fn(),
  fromMock: vi.fn(),
  whereMock: vi.fn(),
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn(() => ({ __op: "eq" })),
    gte: vi.fn(() => ({ __op: "gte" })),
    lte: vi.fn(() => ({ __op: "lte" })),
    and: vi.fn((...args: unknown[]) => ({ __op: "and", args })),
    isNotNull: vi.fn(() => ({ __op: "isNotNull" })),
    sum: vi.fn(() => ({ __op: "sum" })),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      upstreams: {
        findMany: findManyMock,
      },
    },
    select: selectMock,
  },
  requestBillingSnapshots: {
    upstreamId: "upstream_id",
    billingStatus: "billing_status",
    billedAt: "billed_at",
    finalCost: "final_cost",
  },
  upstreams: {
    id: "id",
    name: "name",
    spendingLimit: "spending_limit",
    spendingPeriodType: "spending_period_type",
    spendingPeriodHours: "spending_period_hours",
  },
}));

import {
  quotaTracker,
  toStartOfTodayUtc,
  toStartOfMonthUtc,
  toStartOfTomorrowUtc,
  toStartOfNextMonthUtc,
  getRollingWindowStart,
  getPeriodStart,
  getResetsAt,
  extractQuotaConfig,
} from "@/lib/services/upstream-quota-tracker";

describe("upstream-quota-tracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quotaTracker.reset();
  });

  describe("period helpers", () => {
    const ref = new Date("2025-06-15T14:30:00Z");

    it("toStartOfTodayUtc", () => {
      const result = toStartOfTodayUtc(ref);
      expect(result).toEqual(new Date("2025-06-15T00:00:00Z"));
    });

    it("toStartOfMonthUtc", () => {
      const result = toStartOfMonthUtc(ref);
      expect(result).toEqual(new Date("2025-06-01T00:00:00Z"));
    });

    it("toStartOfTomorrowUtc", () => {
      const result = toStartOfTomorrowUtc(ref);
      expect(result).toEqual(new Date("2025-06-16T00:00:00Z"));
    });

    it("toStartOfNextMonthUtc", () => {
      const result = toStartOfNextMonthUtc(ref);
      expect(result).toEqual(new Date("2025-07-01T00:00:00Z"));
    });

    it("getRollingWindowStart with 24 hours", () => {
      const result = getRollingWindowStart(24, ref);
      expect(result).toEqual(new Date("2025-06-14T14:30:00Z"));
    });

    it("getRollingWindowStart with 6 hours", () => {
      const result = getRollingWindowStart(6, ref);
      expect(result).toEqual(new Date("2025-06-15T08:30:00Z"));
    });
  });

  describe("getPeriodStart", () => {
    const ref = new Date("2025-06-15T14:30:00Z");

    it("daily", () => {
      const c: QuotaConfig = {
        spendingLimit: 10,
        spendingPeriodType: "daily",
        spendingPeriodHours: null,
      };
      expect(getPeriodStart(c, ref)).toEqual(new Date("2025-06-15T00:00:00Z"));
    });

    it("monthly", () => {
      const c: QuotaConfig = {
        spendingLimit: 10,
        spendingPeriodType: "monthly",
        spendingPeriodHours: null,
      };
      expect(getPeriodStart(c, ref)).toEqual(new Date("2025-06-01T00:00:00Z"));
    });

    it("rolling", () => {
      const c: QuotaConfig = {
        spendingLimit: 10,
        spendingPeriodType: "rolling",
        spendingPeriodHours: 12,
      };
      expect(getPeriodStart(c, ref)).toEqual(new Date("2025-06-15T02:30:00Z"));
    });

    it("rolling defaults to 24h when spendingPeriodHours is null", () => {
      const c: QuotaConfig = {
        spendingLimit: 10,
        spendingPeriodType: "rolling",
        spendingPeriodHours: null,
      };
      expect(getPeriodStart(c, ref)).toEqual(new Date("2025-06-14T14:30:00Z"));
    });
  });

  describe("getResetsAt", () => {
    const ref = new Date("2025-06-15T14:30:00Z");

    it("daily resets at start of next day", () => {
      const c: QuotaConfig = {
        spendingLimit: 10,
        spendingPeriodType: "daily",
        spendingPeriodHours: null,
      };
      expect(getResetsAt(c, ref)).toEqual(new Date("2025-06-16T00:00:00Z"));
    });

    it("monthly resets at start of next month", () => {
      const c: QuotaConfig = {
        spendingLimit: 10,
        spendingPeriodType: "monthly",
        spendingPeriodHours: null,
      };
      expect(getResetsAt(c, ref)).toEqual(new Date("2025-07-01T00:00:00Z"));
    });

    it("rolling has no fixed reset time", () => {
      const c: QuotaConfig = {
        spendingLimit: 10,
        spendingPeriodType: "rolling",
        spendingPeriodHours: 12,
      };
      expect(getResetsAt(c, ref)).toBeNull();
    });
  });

  describe("extractQuotaConfig", () => {
    it("returns config for valid upstream", () => {
      const upstream = {
        spendingLimit: 50,
        spendingPeriodType: "daily",
        spendingPeriodHours: null,
      };
      const result = extractQuotaConfig(upstream as never);
      expect(result).toEqual({
        spendingLimit: 50,
        spendingPeriodType: "daily",
        spendingPeriodHours: null,
      });
    });

    it("returns null when spendingLimit is null", () => {
      const upstream = {
        spendingLimit: null,
        spendingPeriodType: "daily",
        spendingPeriodHours: null,
      };
      expect(extractQuotaConfig(upstream as never)).toBeNull();
    });

    it("returns null when spendingPeriodType is null", () => {
      const upstream = {
        spendingLimit: 50,
        spendingPeriodType: null,
        spendingPeriodHours: null,
      };
      expect(extractQuotaConfig(upstream as never)).toBeNull();
    });

    it("returns null for invalid period type", () => {
      const upstream = {
        spendingLimit: 50,
        spendingPeriodType: "weekly",
        spendingPeriodHours: null,
      };
      expect(extractQuotaConfig(upstream as never)).toBeNull();
    });
  });

  describe("isWithinQuota", () => {
    it("returns true when no config is set", () => {
      expect(quotaTracker.isWithinQuota("nonexistent")).toBe(true);
    });

    it("returns true when no spending recorded", () => {
      quotaTracker.setConfig("up-1", {
        spendingLimit: 100,
        spendingPeriodType: "daily",
        spendingPeriodHours: null,
      });
      expect(quotaTracker.isWithinQuota("up-1")).toBe(true);
    });

    it("returns true when spending is below limit", () => {
      quotaTracker.setConfig("up-1", {
        spendingLimit: 100,
        spendingPeriodType: "daily",
        spendingPeriodHours: null,
      });
      quotaTracker.recordSpending("up-1", 50);
      expect(quotaTracker.isWithinQuota("up-1")).toBe(true);
    });

    it("returns false when spending reaches limit", () => {
      quotaTracker.setConfig("up-1", {
        spendingLimit: 100,
        spendingPeriodType: "daily",
        spendingPeriodHours: null,
      });
      quotaTracker.recordSpending("up-1", 100);
      expect(quotaTracker.isWithinQuota("up-1")).toBe(false);
    });

    it("returns false when spending exceeds limit", () => {
      quotaTracker.setConfig("up-1", {
        spendingLimit: 100,
        spendingPeriodType: "daily",
        spendingPeriodHours: null,
      });
      quotaTracker.recordSpending("up-1", 120);
      expect(quotaTracker.isWithinQuota("up-1")).toBe(false);
    });
  });

  describe("recordSpending", () => {
    it("accumulates spending incrementally", () => {
      quotaTracker.setConfig("up-1", {
        spendingLimit: 100,
        spendingPeriodType: "daily",
        spendingPeriodHours: null,
      });
      quotaTracker.recordSpending("up-1", 30);
      quotaTracker.recordSpending("up-1", 25);
      quotaTracker.recordSpending("up-1", 15);

      const entry = quotaTracker.getCacheEntry("up-1");
      expect(entry?.currentSpending).toBe(70);
    });

    it("ignores zero cost", () => {
      quotaTracker.recordSpending("up-1", 0);
      expect(quotaTracker.getCacheEntry("up-1")).toBeUndefined();
    });

    it("ignores negative cost", () => {
      quotaTracker.recordSpending("up-1", -5);
      expect(quotaTracker.getCacheEntry("up-1")).toBeUndefined();
    });

    it("creates entry for upstream without prior spending", () => {
      quotaTracker.recordSpending("up-new", 10);
      const entry = quotaTracker.getCacheEntry("up-new");
      expect(entry?.currentSpending).toBe(10);
    });
  });

  describe("getQuotaStatus", () => {
    it("returns null for upstream without quota config", () => {
      expect(quotaTracker.getQuotaStatus("nonexistent")).toBeNull();
    });

    it("returns correct status for configured upstream", () => {
      quotaTracker.setConfig(
        "up-1",
        { spendingLimit: 200, spendingPeriodType: "daily", spendingPeriodHours: null },
        "Test Upstream"
      );
      quotaTracker.recordSpending("up-1", 80);

      const status = quotaTracker.getQuotaStatus("up-1");
      expect(status).not.toBeNull();
      expect(status!.upstreamName).toBe("Test Upstream");
      expect(status!.currentSpending).toBe(80);
      expect(status!.spendingLimit).toBe(200);
      expect(status!.percentUsed).toBe(40);
      expect(status!.isExceeded).toBe(false);
    });

    it("caps percentUsed at 999", () => {
      quotaTracker.setConfig("up-1", {
        spendingLimit: 1,
        spendingPeriodType: "daily",
        spendingPeriodHours: null,
      });
      quotaTracker.recordSpending("up-1", 50);

      const status = quotaTracker.getQuotaStatus("up-1");
      expect(status!.percentUsed).toBe(999);
    });

    it("marks as exceeded when at limit", () => {
      quotaTracker.setConfig("up-1", {
        spendingLimit: 100,
        spendingPeriodType: "daily",
        spendingPeriodHours: null,
      });
      quotaTracker.recordSpending("up-1", 100);

      const status = quotaTracker.getQuotaStatus("up-1");
      expect(status!.isExceeded).toBe(true);
    });
  });

  describe("getAllQuotaStatuses", () => {
    it("returns empty array when no configs exist", () => {
      expect(quotaTracker.getAllQuotaStatuses()).toEqual([]);
    });

    it("returns statuses for all configured upstreams", () => {
      quotaTracker.setConfig("up-1", {
        spendingLimit: 100,
        spendingPeriodType: "daily",
        spendingPeriodHours: null,
      });
      quotaTracker.setConfig("up-2", {
        spendingLimit: 200,
        spendingPeriodType: "monthly",
        spendingPeriodHours: null,
      });

      const statuses = quotaTracker.getAllQuotaStatuses();
      expect(statuses).toHaveLength(2);
      expect(statuses.map((s) => s.upstreamId).sort()).toEqual(["up-1", "up-2"]);
    });
  });

  describe("syncFromDb", () => {
    it("loads upstream configs and aggregates spending", async () => {
      findManyMock.mockResolvedValue([
        {
          id: "up-1",
          name: "OpenAI Pro",
          spendingLimit: 100,
          spendingPeriodType: "daily",
          spendingPeriodHours: null,
        },
      ]);

      whereMock.mockResolvedValue([{ totalCost: "42.50" }]);
      fromMock.mockReturnValue({ where: whereMock });
      selectMock.mockReturnValue({ from: fromMock });

      await quotaTracker.syncFromDb();

      const status = quotaTracker.getQuotaStatus("up-1");
      expect(status).not.toBeNull();
      expect(status!.currentSpending).toBe(42.5);
      expect(status!.upstreamName).toBe("OpenAI Pro");
    });

    it("handles null totalCost as zero", async () => {
      findManyMock.mockResolvedValue([
        {
          id: "up-1",
          name: "Test",
          spendingLimit: 100,
          spendingPeriodType: "daily",
          spendingPeriodHours: null,
        },
      ]);

      whereMock.mockResolvedValue([{ totalCost: null }]);
      fromMock.mockReturnValue({ where: whereMock });
      selectMock.mockReturnValue({ from: fromMock });

      await quotaTracker.syncFromDb();

      const entry = quotaTracker.getCacheEntry("up-1");
      expect(entry!.currentSpending).toBe(0);
    });

    it("removes stale entries when upstream has quota removed", async () => {
      // First sync: upstream has quota
      findManyMock.mockResolvedValue([
        {
          id: "up-1",
          name: "Test",
          spendingLimit: 100,
          spendingPeriodType: "daily",
          spendingPeriodHours: null,
        },
      ]);
      whereMock.mockResolvedValue([{ totalCost: "10" }]);
      fromMock.mockReturnValue({ where: whereMock });
      selectMock.mockReturnValue({ from: fromMock });

      await quotaTracker.syncFromDb();
      expect(quotaTracker.getQuotaStatus("up-1")).not.toBeNull();

      // Second sync: upstream no longer has quota
      findManyMock.mockResolvedValue([]);
      await quotaTracker.syncFromDb();
      expect(quotaTracker.getQuotaStatus("up-1")).toBeNull();
    });
  });

  describe("reset", () => {
    it("clears all internal state", () => {
      quotaTracker.setConfig("up-1", {
        spendingLimit: 100,
        spendingPeriodType: "daily",
        spendingPeriodHours: null,
      });
      quotaTracker.recordSpending("up-1", 50);

      quotaTracker.reset();

      expect(quotaTracker.isWithinQuota("up-1")).toBe(true);
      expect(quotaTracker.getQuotaStatus("up-1")).toBeNull();
      expect(quotaTracker.getCacheEntry("up-1")).toBeUndefined();
    });
  });
});
