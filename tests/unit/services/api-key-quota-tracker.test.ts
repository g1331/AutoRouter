import { beforeEach, describe, expect, it, vi } from "vitest";

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
    lt: vi.fn(() => ({ __op: "lt" })),
    and: vi.fn((...args: unknown[]) => ({ __op: "and", args })),
    isNotNull: vi.fn(() => ({ __op: "isNotNull" })),
    sum: vi.fn(() => ({ __op: "sum" })),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      apiKeys: {
        findMany: findManyMock,
      },
    },
    select: selectMock,
  },
  requestBillingSnapshots: {
    apiKeyId: "api_key_id",
    billingStatus: "billing_status",
    billedAt: "billed_at",
    finalCost: "final_cost",
  },
  apiKeys: {
    id: "id",
    name: "name",
    spendingRules: "spending_rules",
  },
}));

import { apiKeyQuotaTracker } from "@/lib/services/api-key-quota-tracker";

describe("api-key-quota-tracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiKeyQuotaTracker.reset();
  });

  describe("isWithinQuota", () => {
    it("returns true when no rules are configured", () => {
      expect(apiKeyQuotaTracker.isWithinQuota("missing-key")).toBe(true);
    });

    it("returns false when any rule is exceeded", () => {
      apiKeyQuotaTracker.setRules(
        "key-1",
        [
          { period_type: "daily", limit: 100 },
          { period_type: "rolling", limit: 30, period_hours: 6 },
        ],
        "Quota Key"
      );
      apiKeyQuotaTracker.adjustSpending("key-1", 35);

      expect(apiKeyQuotaTracker.isWithinQuota("key-1")).toBe(false);
    });
  });

  describe("adjustSpending", () => {
    it("applies deltas across all cached rules without dropping below zero", () => {
      apiKeyQuotaTracker.setRules("key-2", [{ period_type: "daily", limit: 100 }], "Adjust Key");
      apiKeyQuotaTracker.adjustSpending("key-2", 40);
      apiKeyQuotaTracker.adjustSpending("key-2", -55);

      const entries = apiKeyQuotaTracker.getCacheEntries("key-2");
      expect(entries).toHaveLength(1);
      expect(entries?.[0]?.currentSpending).toBe(0);
    });
  });

  describe("getQuotaStatus", () => {
    it("returns multi-rule status with AND semantics", () => {
      apiKeyQuotaTracker.setRules(
        "key-3",
        [
          { period_type: "daily", limit: 200 },
          { period_type: "rolling", limit: 50, period_hours: 6 },
        ],
        "Status Key"
      );
      apiKeyQuotaTracker.adjustSpending("key-3", 80);

      const status = apiKeyQuotaTracker.getQuotaStatus("key-3");

      expect(status?.apiKeyName).toBe("Status Key");
      expect(status?.rules).toHaveLength(2);
      expect(status?.rules[0]).toEqual(
        expect.objectContaining({
          periodType: "daily",
          currentSpending: 80,
          spendingLimit: 200,
          isExceeded: false,
        })
      );
      expect(status?.rules[1]).toEqual(
        expect.objectContaining({
          periodType: "rolling",
          periodHours: 6,
          currentSpending: 80,
          spendingLimit: 50,
          isExceeded: true,
        })
      );
      expect(status?.isExceeded).toBe(true);
    });
  });

  describe("syncFromDb", () => {
    it("loads configured API keys and aggregates billed spending per rule", async () => {
      findManyMock.mockResolvedValue([
        {
          id: "key-4",
          name: "Sync Key",
          spendingRules: [
            { period_type: "daily", limit: 100 },
            { period_type: "rolling", limit: 30, period_hours: 5 },
          ],
        },
      ]);
      whereMock.mockResolvedValue([{ totalCost: "42.50" }]);
      fromMock.mockReturnValue({ where: whereMock });
      selectMock.mockReturnValue({ from: fromMock });

      await apiKeyQuotaTracker.syncFromDb();

      const status = apiKeyQuotaTracker.getQuotaStatus("key-4");
      expect(status?.apiKeyName).toBe("Sync Key");
      expect(status?.rules).toHaveLength(2);
      expect(status?.rules[0]?.currentSpending).toBe(42.5);
      expect(status?.rules[1]?.currentSpending).toBe(42.5);
    });
  });

  describe("syncApiKeyFromDb", () => {
    it("loads a single API key and clears cache when rules are removed", async () => {
      whereMock.mockResolvedValue([{ totalCost: "15.25" }]);
      fromMock.mockReturnValue({ where: whereMock });
      selectMock.mockReturnValue({ from: fromMock });

      await apiKeyQuotaTracker.syncApiKeyFromDb("key-5", "Single Key", [
        { period_type: "daily", limit: 100 },
      ]);
      expect(apiKeyQuotaTracker.getQuotaStatus("key-5")?.rules[0]?.currentSpending).toBe(15.25);

      await apiKeyQuotaTracker.syncApiKeyFromDb("key-5", "Single Key", null);
      expect(apiKeyQuotaTracker.getQuotaStatus("key-5")).toBeNull();
      expect(apiKeyQuotaTracker.getCacheEntries("key-5")).toBeUndefined();
    });
  });

  describe("estimateRecoveryTime", () => {
    it("estimates rolling recovery time from billed snapshot history", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-06-15T14:30:00Z"));

      apiKeyQuotaTracker.setRules(
        "key-6",
        [{ period_type: "rolling", limit: 100, period_hours: 24 }],
        "Rolling Key"
      );
      apiKeyQuotaTracker.adjustSpending("key-6", 150);

      whereMock.mockResolvedValueOnce([
        { billedAt: new Date("2025-06-14T14:40:00Z"), finalCost: 60 },
      ]);
      fromMock.mockReturnValue({ where: whereMock });
      selectMock.mockReturnValue({ from: fromMock });

      const recovery = await apiKeyQuotaTracker.estimateRecoveryTime("key-6", {
        period_type: "rolling",
        limit: 100,
        period_hours: 24,
      });

      expect(recovery).toEqual(new Date("2025-06-15T15:30:00Z"));

      vi.useRealTimers();
    });
  });
});
