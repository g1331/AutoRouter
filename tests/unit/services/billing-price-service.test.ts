import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const manualFindFirstMock = vi.fn();
const manualFindManyMock = vi.fn();
const syncedFindFirstMock = vi.fn();
const syncHistoryFindFirstMock = vi.fn();
const unresolvedFindManyMock = vi.fn();

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
      },
      billingPriceSyncHistory: {
        findFirst: syncHistoryFindFirstMock,
      },
      requestBillingSnapshots: {
        findMany: unresolvedFindManyMock,
      },
    },
    transaction: dbTransactionMock,
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
    });

    const result = await resolveBillingModelPrice("gpt-4.1");

    expect(result).toEqual({
      model: "gpt-4.1",
      source: "manual",
      inputPricePerMillion: 3,
      outputPricePerMillion: 9,
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
    });

    const result = await resolveBillingModelPrice("gpt-4.1");

    expect(result).toEqual({
      model: "gpt-4.1",
      source: "litellm",
      inputPricePerMillion: 2.5,
      outputPricePerMillion: 7.5,
    });
  });

  it("falls back to LiteLLM when OpenRouter sync fails", async () => {
    const { syncBillingModelPrices } = await import("@/lib/services/billing-price-service");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("upstream error", { status: 500 }))
      .mockResolvedValueOnce(
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

    expect(result.status).toBe("partial");
    expect(result.source).toBe("litellm");
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
    expect(result.failureReason).toContain("openrouter");
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(txInsertValuesMock).toHaveBeenCalled();
    expect(dbInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "partial",
        source: "litellm",
      })
    );
  });
});
