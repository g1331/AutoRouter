import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbSelectMock = vi.fn();
const dbUpdateMock = vi.fn();
const upstreamsFindManyMock = vi.fn();
const upstreamsFindFirstMock = vi.fn();
const requestBillingSnapshotsFindManyMock = vi.fn();

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    and: vi.fn((...args) => ({ __op: "and", args })),
    count: vi.fn(() => ({ __op: "count" })),
    desc: vi.fn((arg) => ({ __op: "desc", arg })),
    eq: vi.fn((a, b) => ({ __op: "eq", a, b })),
    gte: vi.fn((a, b) => ({ __op: "gte", a, b })),
    sum: vi.fn((arg) => ({ __op: "sum", arg })),
  };
});

const listBillingUnresolvedModelsMock = vi.fn();
const getLatestBillingSyncStatusMock = vi.fn();
vi.mock("@/lib/services/billing-price-service", () => ({
  listBillingUnresolvedModels: (...args: unknown[]) => listBillingUnresolvedModelsMock(...args),
  getLatestBillingSyncStatus: (...args: unknown[]) => getLatestBillingSyncStatusMock(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => dbSelectMock(...args),
    update: (...args: unknown[]) => dbUpdateMock(...args),
    query: {
      upstreams: {
        findMany: (...args: unknown[]) => upstreamsFindManyMock(...args),
        findFirst: (...args: unknown[]) => upstreamsFindFirstMock(...args),
      },
      requestBillingSnapshots: {
        findMany: (...args: unknown[]) => requestBillingSnapshotsFindManyMock(...args),
      },
    },
  },
  requestBillingSnapshots: {
    finalCost: "final_cost",
    billingStatus: "billing_status",
    billedAt: "billed_at",
    createdAt: "created_at",
  },
  upstreams: {
    id: "id",
    createdAt: "created_at",
  },
}));

function makeSelectWhereChain(resolveWith: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(resolveWith),
    }),
  };
}

function makeSelectFromChain(resolveWith: unknown) {
  return {
    from: vi.fn().mockResolvedValue(resolveWith),
  };
}

describe("billing-management-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getBillingOverviewStats aggregates costs and unresolved count", async () => {
    const { getBillingOverviewStats } = await import("@/lib/services/billing-management-service");

    dbSelectMock
      .mockReturnValueOnce(makeSelectWhereChain([{ totalCost: "1.23456789" }]))
      .mockReturnValueOnce(makeSelectWhereChain([{ totalCost: null }]));
    listBillingUnresolvedModelsMock.mockResolvedValueOnce([{ model: "a" }, { model: "b" }]);
    getLatestBillingSyncStatusMock.mockResolvedValueOnce({
      status: "success",
      source: "litellm",
      successCount: 1,
      failureCount: 0,
      failureReason: null,
      syncedAt: new Date("2026-02-28T00:00:00.000Z"),
    });

    const result = await getBillingOverviewStats();
    expect(result.todayCostUsd).toBe(1.234568);
    expect(result.monthCostUsd).toBe(0);
    expect(result.unresolvedModelCount).toBe(2);
    expect(result.latestSync?.source).toBe("litellm");
  });

  it("listUpstreamBillingMultipliers maps upstream rows", async () => {
    const { listUpstreamBillingMultipliers } =
      await import("@/lib/services/billing-management-service");

    upstreamsFindManyMock.mockResolvedValueOnce([
      {
        id: "upstream-1",
        name: "OpenAI",
        isActive: true,
        billingInputMultiplier: 1,
        billingOutputMultiplier: 1.2,
      },
    ]);

    const result = await listUpstreamBillingMultipliers();
    expect(result).toEqual([
      {
        id: "upstream-1",
        name: "OpenAI",
        isActive: true,
        inputMultiplier: 1,
        outputMultiplier: 1.2,
      },
    ]);
  });

  it("updateUpstreamBillingMultipliers returns existing when no multiplier fields provided", async () => {
    const { updateUpstreamBillingMultipliers } =
      await import("@/lib/services/billing-management-service");

    upstreamsFindFirstMock.mockResolvedValueOnce({
      id: "upstream-1",
      name: "OpenAI",
      isActive: true,
      billingInputMultiplier: 1,
      billingOutputMultiplier: 1,
    });

    const result = await updateUpstreamBillingMultipliers("upstream-1", {});
    expect(result?.id).toBe("upstream-1");
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("updateUpstreamBillingMultipliers updates upstream when multiplier provided", async () => {
    const { updateUpstreamBillingMultipliers } =
      await import("@/lib/services/billing-management-service");

    const returningMock = vi.fn().mockResolvedValueOnce([{ id: "upstream-1" }]);
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    dbUpdateMock.mockReturnValueOnce({ set: setMock });

    const result = await updateUpstreamBillingMultipliers("upstream-1", { outputMultiplier: 1.2 });
    expect(result?.id).toBe("upstream-1");
    expect(dbUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("listRecentBillingDetails clamps pagination and computes totalPages", async () => {
    const { listRecentBillingDetails } = await import("@/lib/services/billing-management-service");

    dbSelectMock.mockReturnValueOnce(makeSelectFromChain([{ value: 101 }]));
    requestBillingSnapshotsFindManyMock.mockResolvedValueOnce([
      {
        requestLogId: "log-1",
        createdAt: new Date("2026-02-28T00:00:00.000Z"),
        model: "gpt-4.1",
        upstreamId: "upstream-1",
        upstream: { name: "OpenAI" },
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        priceSource: "litellm",
        billingStatus: "billed",
        unbillableReason: null,
        baseInputPricePerMillion: 3,
        baseOutputPricePerMillion: 9,
        baseCacheReadInputPricePerMillion: null,
        baseCacheWriteInputPricePerMillion: null,
        inputMultiplier: 1,
        outputMultiplier: 1,
        cacheReadCost: 0,
        cacheWriteCost: 0,
        finalCost: 0.00001,
        currency: "USD",
      },
    ]);

    const result = await listRecentBillingDetails(0, 999);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(100);
    expect(result.total).toBe(101);
    expect(result.totalPages).toBe(2);
    expect(requestBillingSnapshotsFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100, offset: 0 })
    );
  });
});
