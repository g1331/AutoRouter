import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const manualFindFirstMock = vi.fn();
const manualFindManyMock = vi.fn();
const syncedFindFirstMock = vi.fn();
const syncedFindManyMock = vi.fn();
const syncHistoryFindFirstMock = vi.fn();
const unresolvedFindManyMock = vi.fn();
const dbSelectMock = vi.fn();

const txUpdateWhereMock = vi.fn(async () => undefined);
const txUpdateSetMock = vi.fn(() => ({ where: txUpdateWhereMock }));
const txUpdateMock = vi.fn(() => ({ set: txUpdateSetMock }));
const txInsertOnConflictMock = vi.fn(async () => undefined);
const txInsertValuesMock = vi.fn(() => ({ onConflictDoUpdate: txInsertOnConflictMock }));
const txInsertMock = vi.fn(() => ({ values: txInsertValuesMock }));

const dbInsertValuesMock = vi.fn(async () => undefined);
const dbInsertMock = vi.fn(() => ({ values: dbInsertValuesMock }));
const dbTransactionMock = vi.fn(async (callback: (tx: unknown) => Promise<void>) =>
  callback({
    update: txUpdateMock,
    insert: txInsertMock,
  })
);

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    and: vi.fn((...args) => ({ __op: "and", args })),
    desc: vi.fn((arg) => ({ __op: "desc", arg })),
    eq: vi.fn((a, b) => ({ __op: "eq", a, b })),
    inArray: vi.fn((a, b) => ({ __op: "inArray", a, b })),
    isNotNull: vi.fn((arg) => ({ __op: "isNotNull", arg })),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      billingManualPriceOverrides: {
        findFirst: manualFindFirstMock,
        findMany: manualFindManyMock,
      },
      billingModelPrices: {
        findFirst: syncedFindFirstMock,
        findMany: syncedFindManyMock,
      },
      billingPriceSyncHistory: {
        findFirst: syncHistoryFindFirstMock,
      },
      requestBillingSnapshots: {
        findMany: unresolvedFindManyMock,
      },
    },
    transaction: dbTransactionMock,
    select: (...args: unknown[]) => dbSelectMock(...args),
    insert: dbInsertMock,
  },
  billingModelPrices: {
    source: "source",
    model: "model",
    isActive: "is_active",
    syncedAt: "synced_at",
    updatedAt: "updated_at",
  },
  billingPriceSyncHistory: {
    createdAt: "created_at",
  },
  billingManualPriceOverrides: {
    model: "model",
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

describe("billing-price-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves price from manual override before synced catalog", async () => {
    const { resolveBillingModelPrice } = await import("@/lib/services/billing-price-service");

    manualFindFirstMock.mockResolvedValueOnce({
      model: "gpt-4.1",
      inputPricePerMillion: 3,
      outputPricePerMillion: 9,
      cacheReadInputPricePerMillion: null,
      cacheWriteInputPricePerMillion: null,
    });

    const result = await resolveBillingModelPrice("gpt-4.1");

    expect(result).toEqual({
      model: "gpt-4.1",
      source: "manual",
      inputPricePerMillion: 3,
      outputPricePerMillion: 9,
      cacheReadInputPricePerMillion: null,
      cacheWriteInputPricePerMillion: null,
    });
    expect(syncedFindFirstMock).not.toHaveBeenCalled();
  });

  it("falls back to synced price when no manual override exists", async () => {
    const { resolveBillingModelPrice } = await import("@/lib/services/billing-price-service");

    manualFindFirstMock.mockResolvedValueOnce(null);
    syncedFindFirstMock.mockResolvedValueOnce({
      source: "litellm",
      inputPricePerMillion: 2.5,
      outputPricePerMillion: 7.5,
      cacheReadInputPricePerMillion: 0.8,
      cacheWriteInputPricePerMillion: null,
    });

    const result = await resolveBillingModelPrice("gpt-4.1");

    expect(result).toEqual({
      model: "gpt-4.1",
      source: "litellm",
      inputPricePerMillion: 2.5,
      outputPricePerMillion: 7.5,
      cacheReadInputPricePerMillion: 0.8,
      cacheWriteInputPricePerMillion: null,
    });
  });

  it("syncs prices from LiteLLM price map", async () => {
    const { syncBillingModelPrices } = await import("@/lib/services/billing-price-service");

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          "gpt-4.1": {
            input_cost_per_token: 0.000003,
            output_cost_per_token: 0.000009,
          },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncBillingModelPrices();

    expect(result.status).toBe("success");
    expect(result.source).toBe("litellm");
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(0);
    expect(result.failureReason).toBeNull();
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(txInsertValuesMock).toHaveBeenCalled();
    expect(dbInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "success",
        source: "litellm",
      })
    );
  });

  it("returns failed sync when LiteLLM returns no valid price rows", async () => {
    const { syncBillingModelPrices } = await import("@/lib/services/billing-price-service");

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          "bad-model": {
            input_cost_per_token: -1,
            output_cost_per_token: 0.000001,
          },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncBillingModelPrices();

    expect(result.status).toBe("failed");
    expect(result.source).toBeNull();
    expect(result.successCount).toBe(0);
    expect(result.failureCount).toBe(1);
    expect(result.failureReason).toContain("no valid price rows");
    expect(dbInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        source: null,
      })
    );
  });

  it("getLatestBillingSyncStatus returns null when no history exists", async () => {
    const { getLatestBillingSyncStatus } = await import("@/lib/services/billing-price-service");

    syncHistoryFindFirstMock.mockResolvedValueOnce(null);
    const result = await getLatestBillingSyncStatus();
    expect(result).toBeNull();
  });

  it("listBillingUnresolvedModels groups and hides models that are now resolved", async () => {
    const { listBillingUnresolvedModels } = await import("@/lib/services/billing-price-service");

    unresolvedFindManyMock.mockResolvedValueOnce([
      {
        model: "a",
        createdAt: new Date("2026-02-28T00:00:00.000Z"),
        upstreamId: "upstream-1",
        upstream: { name: "U1" },
      },
      {
        model: "a",
        createdAt: new Date("2026-02-28T00:00:00.000Z"),
        upstreamId: "upstream-1",
        upstream: { name: "U1" },
      },
      {
        model: null,
        createdAt: new Date("2026-02-28T00:00:00.000Z"),
        upstreamId: null,
        upstream: null,
      },
      {
        model: "b",
        createdAt: new Date("2026-02-28T00:00:00.000Z"),
        upstreamId: "upstream-2",
        upstream: { name: "U2" },
      },
      {
        model: "c",
        createdAt: new Date("2026-02-28T00:00:00.000Z"),
        upstreamId: "upstream-3",
        upstream: null,
      },
    ]);

    manualFindManyMock.mockResolvedValueOnce([{ model: "b" }]);
    syncedFindManyMock.mockResolvedValueOnce([{ model: "a" }]);

    const result = await listBillingUnresolvedModels();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      model: "c",
      occurrences: 1,
      lastUpstreamId: "upstream-3",
      lastUpstreamName: null,
    });
  });

  it("listBillingModelPrices normalizes page/pageSize and computes totalPages", async () => {
    const { listBillingModelPrices } = await import("@/lib/services/billing-price-service");

    const whereMock = vi.fn().mockResolvedValueOnce([{ value: 101 }]);
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    dbSelectMock.mockReturnValueOnce({ from: fromMock });

    syncedFindManyMock.mockResolvedValueOnce([
      {
        id: "price-1",
        model: "gpt-4.1",
        inputPricePerMillion: 3,
        outputPricePerMillion: 9,
        cacheReadInputPricePerMillion: null,
        cacheWriteInputPricePerMillion: null,
        isActive: true,
        syncedAt: new Date("2026-02-28T00:00:00.000Z"),
        updatedAt: new Date("2026-02-28T00:00:00.000Z"),
      },
    ]);

    const result = await listBillingModelPrices({
      page: 0,
      pageSize: 1000,
      modelQuery: "  gpt  ",
      activeOnly: true,
    });

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(100);
    expect(result.total).toBe(101);
    expect(result.totalPages).toBe(2);
    expect(result.items[0].source).toBe("litellm");
  });
});
