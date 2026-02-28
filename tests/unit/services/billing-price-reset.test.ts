import { describe, it, expect, vi, beforeEach } from "vitest";

const manualOverridesFindManyMock = vi.fn();
const syncedPricesFindManyMock = vi.fn();
const deleteReturningMock = vi.fn();
const deleteWhereMock = vi.fn(() => ({ returning: deleteReturningMock }));
const dbDeleteMock = vi.fn(() => ({ where: deleteWhereMock }));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    and: vi.fn((...args) => ({ __op: "and", args })),
    count: vi.fn(() => ({ __op: "count" })),
    desc: vi.fn((arg) => ({ __op: "desc", arg })),
    eq: vi.fn((a, b) => ({ __op: "eq", a, b })),
    inArray: vi.fn((a, b) => ({ __op: "inArray", a, b })),
    isNotNull: vi.fn((arg) => ({ __op: "isNotNull", arg })),
    like: vi.fn((a, b) => ({ __op: "like", a, b })),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      billingManualPriceOverrides: {
        findMany: manualOverridesFindManyMock,
      },
      billingModelPrices: {
        findMany: syncedPricesFindManyMock,
      },
    },
    delete: dbDeleteMock,
  },
  billingManualPriceOverrides: {
    model: "model",
  },
  billingModelPrices: {
    model: "model",
    source: "source",
    isActive: "is_active",
  },
  billingPriceSyncHistory: {
    createdAt: "created_at",
  },
  requestBillingSnapshots: {
    billingStatus: "billing_status",
    unbillableReason: "unbillable_reason",
    model: "model",
    createdAt: "created_at",
  },
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe("billing-price-service (reset helpers)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listBillingManualPriceOverrides should include hasOfficialPrice flag when synced prices exist", async () => {
    const { listBillingManualPriceOverrides } =
      await import("@/lib/services/billing-price-service");

    manualOverridesFindManyMock.mockResolvedValueOnce([
      {
        id: "o-1",
        model: "gpt-4.1",
        inputPricePerMillion: 1,
        outputPricePerMillion: 2,
        cacheReadInputPricePerMillion: null,
        cacheWriteInputPricePerMillion: null,
        note: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-02"),
      },
      {
        id: "o-2",
        model: "sample_spec",
        inputPricePerMillion: 3,
        outputPricePerMillion: 4,
        cacheReadInputPricePerMillion: null,
        cacheWriteInputPricePerMillion: null,
        note: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-02"),
      },
    ]);

    syncedPricesFindManyMock.mockResolvedValueOnce([{ model: "gpt-4.1" }]);

    const result = await listBillingManualPriceOverrides();
    expect(result).toHaveLength(2);
    expect(result[0]?.hasOfficialPrice).toBe(true);
    expect(result[1]?.hasOfficialPrice).toBe(false);
  });

  it("deleteBillingManualPriceOverridesByModels should normalize input and report missing official models", async () => {
    const { deleteBillingManualPriceOverridesByModels } =
      await import("@/lib/services/billing-price-service");

    syncedPricesFindManyMock.mockResolvedValueOnce([{ model: "gpt-4.1" }]);
    deleteReturningMock.mockResolvedValueOnce([{ model: "gpt-4.1" }, { model: "sample_spec" }]);

    const result = await deleteBillingManualPriceOverridesByModels([
      "gpt-4.1",
      "sample_spec",
      "gpt-4.1",
      " ",
    ]);

    expect(result).toEqual({
      deletedCount: 2,
      missingOfficialModels: ["sample_spec"],
    });
    expect(dbDeleteMock).toHaveBeenCalledTimes(1);
  });
});
