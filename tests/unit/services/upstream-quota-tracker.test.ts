import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpendingRule } from "@/lib/services/upstream-quota-tracker";

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
    spendingRules: "spending_rules",
  },
}));

import {
  quotaTracker,
  toStartOfTodayUtc,
  toStartOfMonthUtc,
  toStartOfTomorrowUtc,
  toStartOfNextMonthUtc,
  getRollingWindowStart,
  getPeriodStartForRule,
  getResetsAtForRule,
  extractSpendingRules,
} from "@/lib/services/upstream-quota-tracker";

describe("upstream-quota-tracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quotaTracker.reset();
  });

  describe("period helpers", () => {
    const ref = new Date("2025-06-15T14:30:00Z");

    it("toStartOfTodayUtc", () => {
      expect(toStartOfTodayUtc(ref)).toEqual(new Date("2025-06-15T00:00:00Z"));
    });

    it("toStartOfMonthUtc", () => {
      expect(toStartOfMonthUtc(ref)).toEqual(new Date("2025-06-01T00:00:00Z"));
    });

    it("toStartOfTomorrowUtc", () => {
      expect(toStartOfTomorrowUtc(ref)).toEqual(new Date("2025-06-16T00:00:00Z"));
    });

    it("toStartOfNextMonthUtc", () => {
      expect(toStartOfNextMonthUtc(ref)).toEqual(new Date("2025-07-01T00:00:00Z"));
    });

    it("getRollingWindowStart with 24 hours", () => {
      expect(getRollingWindowStart(24, ref)).toEqual(new Date("2025-06-14T14:30:00Z"));
    });

    it("getRollingWindowStart with 6 hours", () => {
      expect(getRollingWindowStart(6, ref)).toEqual(new Date("2025-06-15T08:30:00Z"));
    });
  });

  describe("getPeriodStartForRule", () => {
    const ref = new Date("2025-06-15T14:30:00Z");

    it("daily", () => {
      const r: SpendingRule = { period_type: "daily", limit: 10 };
      expect(getPeriodStartForRule(r, ref)).toEqual(new Date("2025-06-15T00:00:00Z"));
    });

    it("monthly", () => {
      const r: SpendingRule = { period_type: "monthly", limit: 10 };
      expect(getPeriodStartForRule(r, ref)).toEqual(new Date("2025-06-01T00:00:00Z"));
    });

    it("rolling", () => {
      const r: SpendingRule = { period_type: "rolling", limit: 10, period_hours: 12 };
      expect(getPeriodStartForRule(r, ref)).toEqual(new Date("2025-06-15T02:30:00Z"));
    });

    it("rolling defaults to 24h when period_hours is undefined", () => {
      const r: SpendingRule = { period_type: "rolling", limit: 10 };
      expect(getPeriodStartForRule(r, ref)).toEqual(new Date("2025-06-14T14:30:00Z"));
    });
  });

  describe("getResetsAtForRule", () => {
    const ref = new Date("2025-06-15T14:30:00Z");

    it("daily resets at start of next day", () => {
      const r: SpendingRule = { period_type: "daily", limit: 10 };
      expect(getResetsAtForRule(r, ref)).toEqual(new Date("2025-06-16T00:00:00Z"));
    });

    it("monthly resets at start of next month", () => {
      const r: SpendingRule = { period_type: "monthly", limit: 10 };
      expect(getResetsAtForRule(r, ref)).toEqual(new Date("2025-07-01T00:00:00Z"));
    });

    it("rolling has no fixed reset time", () => {
      const r: SpendingRule = { period_type: "rolling", limit: 10, period_hours: 12 };
      expect(getResetsAtForRule(r, ref)).toBeNull();
    });
  });

  describe("extractSpendingRules", () => {
    it("returns rules for valid upstream", () => {
      const upstream = {
        spendingRules: [{ period_type: "daily", limit: 50 }],
      };
      const result = extractSpendingRules(upstream as never);
      expect(result).toEqual([{ period_type: "daily", limit: 50 }]);
    });

    it("returns empty array when spendingRules is null", () => {
      const upstream = { spendingRules: null };
      expect(extractSpendingRules(upstream as never)).toEqual([]);
    });

    it("returns empty array when spendingRules is empty", () => {
      const upstream = { spendingRules: [] };
      expect(extractSpendingRules(upstream as never)).toEqual([]);
    });

    it("filters out invalid rules", () => {
      const upstream = {
        spendingRules: [
          { period_type: "daily", limit: 50 },
          { period_type: "weekly", limit: 100 },
          { period_type: "monthly", limit: 0 },
          { period_type: "rolling", limit: 30, period_hours: 5 },
        ],
      };
      const result = extractSpendingRules(upstream as never);
      expect(result).toEqual([
        { period_type: "daily", limit: 50 },
        { period_type: "rolling", limit: 30, period_hours: 5 },
      ]);
    });
  });

  describe("isWithinQuota", () => {
    it("returns true when no rules are set", () => {
      expect(quotaTracker.isWithinQuota("nonexistent")).toBe(true);
    });

    it("returns true when no spending recorded", () => {
      quotaTracker.setRules("up-1", [{ period_type: "daily", limit: 100 }]);
      expect(quotaTracker.isWithinQuota("up-1")).toBe(true);
    });

    it("returns true when spending is below limit", () => {
      quotaTracker.setRules("up-1", [{ period_type: "daily", limit: 100 }]);
      quotaTracker.recordSpending("up-1", 50);
      expect(quotaTracker.isWithinQuota("up-1")).toBe(true);
    });

    it("returns false when spending reaches limit", () => {
      quotaTracker.setRules("up-1", [{ period_type: "daily", limit: 100 }]);
      quotaTracker.recordSpending("up-1", 100);
      expect(quotaTracker.isWithinQuota("up-1")).toBe(false);
    });

    it("returns false when ANY rule is exceeded (AND semantics)", () => {
      quotaTracker.setRules("up-1", [
        { period_type: "daily", limit: 100 },
        { period_type: "rolling", limit: 30, period_hours: 5 },
      ]);
      quotaTracker.recordSpending("up-1", 35);
      // Daily: 35 < 100 OK, Rolling 5h: 35 >= 30 EXCEEDED
      expect(quotaTracker.isWithinQuota("up-1")).toBe(false);
    });

    it("returns true when ALL rules are within limits", () => {
      quotaTracker.setRules("up-1", [
        { period_type: "daily", limit: 100 },
        { period_type: "rolling", limit: 30, period_hours: 5 },
      ]);
      quotaTracker.recordSpending("up-1", 25);
      expect(quotaTracker.isWithinQuota("up-1")).toBe(true);
    });
  });

  describe("recordSpending", () => {
    it("accumulates spending across all rules", () => {
      quotaTracker.setRules("up-1", [
        { period_type: "daily", limit: 100 },
        { period_type: "monthly", limit: 500 },
      ]);
      quotaTracker.recordSpending("up-1", 30);
      quotaTracker.recordSpending("up-1", 25);

      const entries = quotaTracker.getCacheEntries("up-1");
      expect(entries).toHaveLength(2);
      expect(entries![0].currentSpending).toBe(55);
      expect(entries![1].currentSpending).toBe(55);
    });

    it("ignores zero cost", () => {
      quotaTracker.setRules("up-1", [{ period_type: "daily", limit: 100 }]);
      quotaTracker.recordSpending("up-1", 0);
      const entries = quotaTracker.getCacheEntries("up-1");
      expect(entries![0].currentSpending).toBe(0);
    });

    it("ignores negative cost", () => {
      quotaTracker.setRules("up-1", [{ period_type: "daily", limit: 100 }]);
      quotaTracker.recordSpending("up-1", -5);
      const entries = quotaTracker.getCacheEntries("up-1");
      expect(entries![0].currentSpending).toBe(0);
    });

    it("does nothing for unknown upstream", () => {
      quotaTracker.recordSpending("up-new", 10);
      expect(quotaTracker.getCacheEntries("up-new")).toBeUndefined();
    });
  });

  describe("getQuotaStatus", () => {
    it("returns null for upstream without rules", () => {
      expect(quotaTracker.getQuotaStatus("nonexistent")).toBeNull();
    });

    it("returns correct multi-rule status", () => {
      quotaTracker.setRules(
        "up-1",
        [
          { period_type: "daily", limit: 200 },
          { period_type: "rolling", limit: 50, period_hours: 6 },
        ],
        "Test Upstream"
      );
      quotaTracker.recordSpending("up-1", 80);

      const status = quotaTracker.getQuotaStatus("up-1");
      expect(status).not.toBeNull();
      expect(status!.upstreamName).toBe("Test Upstream");
      expect(status!.rules).toHaveLength(2);

      const daily = status!.rules[0];
      expect(daily.periodType).toBe("daily");
      expect(daily.currentSpending).toBe(80);
      expect(daily.spendingLimit).toBe(200);
      expect(daily.percentUsed).toBe(40);
      expect(daily.isExceeded).toBe(false);

      const rolling = status!.rules[1];
      expect(rolling.periodType).toBe("rolling");
      expect(rolling.periodHours).toBe(6);
      expect(rolling.currentSpending).toBe(80);
      expect(rolling.spendingLimit).toBe(50);
      expect(rolling.isExceeded).toBe(true);

      expect(status!.isExceeded).toBe(true);
    });

    it("caps percentUsed at 999", () => {
      quotaTracker.setRules("up-1", [{ period_type: "daily", limit: 1 }]);
      quotaTracker.recordSpending("up-1", 50);

      const status = quotaTracker.getQuotaStatus("up-1");
      expect(status!.rules[0].percentUsed).toBe(999);
    });
  });

  describe("getAllQuotaStatuses", () => {
    it("returns empty array when no rules exist", () => {
      expect(quotaTracker.getAllQuotaStatuses()).toEqual([]);
    });

    it("returns statuses for all configured upstreams", () => {
      quotaTracker.setRules("up-1", [{ period_type: "daily", limit: 100 }]);
      quotaTracker.setRules("up-2", [{ period_type: "monthly", limit: 200 }]);

      const statuses = quotaTracker.getAllQuotaStatuses();
      expect(statuses).toHaveLength(2);
      expect(statuses.map((s) => s.upstreamId).sort()).toEqual(["up-1", "up-2"]);
    });
  });

  describe("syncFromDb", () => {
    it("loads upstream rules and aggregates spending per rule", async () => {
      findManyMock.mockResolvedValue([
        {
          id: "up-1",
          name: "OpenAI Pro",
          spendingRules: [
            { period_type: "daily", limit: 100 },
            { period_type: "rolling", limit: 30, period_hours: 5 },
          ],
        },
      ]);

      whereMock.mockResolvedValue([{ totalCost: "42.50" }]);
      fromMock.mockReturnValue({ where: whereMock });
      selectMock.mockReturnValue({ from: fromMock });

      await quotaTracker.syncFromDb();

      const status = quotaTracker.getQuotaStatus("up-1");
      expect(status).not.toBeNull();
      expect(status!.upstreamName).toBe("OpenAI Pro");
      expect(status!.rules).toHaveLength(2);
      // Both rules query DB independently, both get 42.50
      expect(status!.rules[0].currentSpending).toBe(42.5);
      expect(status!.rules[1].currentSpending).toBe(42.5);
    });

    it("handles null totalCost as zero", async () => {
      findManyMock.mockResolvedValue([
        {
          id: "up-1",
          name: "Test",
          spendingRules: [{ period_type: "daily", limit: 100 }],
        },
      ]);

      whereMock.mockResolvedValue([{ totalCost: null }]);
      fromMock.mockReturnValue({ where: whereMock });
      selectMock.mockReturnValue({ from: fromMock });

      await quotaTracker.syncFromDb();

      const entries = quotaTracker.getCacheEntries("up-1");
      expect(entries![0].currentSpending).toBe(0);
    });

    it("removes stale entries when upstream has rules removed", async () => {
      findManyMock.mockResolvedValue([
        {
          id: "up-1",
          name: "Test",
          spendingRules: [{ period_type: "daily", limit: 100 }],
        },
      ]);
      whereMock.mockResolvedValue([{ totalCost: "10" }]);
      fromMock.mockReturnValue({ where: whereMock });
      selectMock.mockReturnValue({ from: fromMock });

      await quotaTracker.syncFromDb();
      expect(quotaTracker.getQuotaStatus("up-1")).not.toBeNull();

      findManyMock.mockResolvedValue([]);
      await quotaTracker.syncFromDb();
      expect(quotaTracker.getQuotaStatus("up-1")).toBeNull();
    });
  });

  describe("reset", () => {
    it("clears all internal state", () => {
      quotaTracker.setRules("up-1", [{ period_type: "daily", limit: 100 }]);
      quotaTracker.recordSpending("up-1", 50);

      quotaTracker.reset();

      expect(quotaTracker.isWithinQuota("up-1")).toBe(true);
      expect(quotaTracker.getQuotaStatus("up-1")).toBeNull();
      expect(quotaTracker.getCacheEntries("up-1")).toBeUndefined();
    });
  });
});
