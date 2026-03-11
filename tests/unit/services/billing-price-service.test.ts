import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const manualFindFirstMock = vi.fn();
const manualFindManyMock = vi.fn();
const syncedFindFirstMock = vi.fn();
const syncedFindManyMock = vi.fn();
const tierRulesFindFirstMock = vi.fn();
const tierRulesFindManyMock = vi.fn();
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
const tierRuleInsertReturningMock = vi.fn();
const tierRuleInsertValuesMock = vi.fn(() => ({ returning: tierRuleInsertReturningMock }));
const tierRuleUpdateReturningMock = vi.fn();

const billingModelPricesTable = {
  source: "source",
  model: "model",
  isActive: "is_active",
  syncedAt: "synced_at",
  updatedAt: "updated_at",
};

const billingTierRulesTable = {
  id: "id",
  model: "model",
  source: "source",
  thresholdInputTokens: "threshold_input_tokens",
  isActive: "is_active",
  updatedAt: "updated_at",
};

const tierRuleUpdateWhereMock = vi.fn(() => ({ returning: tierRuleUpdateReturningMock }));
const tierRuleUpdateSetMock = vi.fn(() => ({ where: tierRuleUpdateWhereMock }));
const dbUpdateMock = vi.fn((table?: unknown) => {
  if (table === billingTierRulesTable) {
    return { set: tierRuleUpdateSetMock };
  }

  return { set: vi.fn() };
});

const dbInsertMock = vi.fn((table?: unknown) => {
  if (table === billingTierRulesTable) {
    return { values: tierRuleInsertValuesMock };
  }

  return { values: dbInsertValuesMock };
});
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
    asc: vi.fn((arg) => ({ __op: "asc", arg })),
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
      billingTierRules: {
        findFirst: tierRulesFindFirstMock,
        findMany: tierRulesFindManyMock,
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
    update: (...args: unknown[]) => dbUpdateMock(...args),
    insert: dbInsertMock,
  },
  billingModelPrices: {
    ...billingModelPricesTable,
  },
  billingPriceSyncHistory: {
    createdAt: "created_at",
  },
  billingManualPriceOverrides: {
    model: "model",
  },
  billingTierRules: billingTierRulesTable,
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
    const { resolveBillingModelPrice } =
      await import("../../../src/lib/services/billing-price-service");

    syncedFindFirstMock.mockResolvedValueOnce(null);
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
      matchedRuleType: "flat",
      matchedRuleDisplayLabel: null,
      appliedTierThreshold: null,
      modelMaxInputTokens: null,
      modelMaxOutputTokens: null,
    });
  });

  it("falls back to synced price when no manual override exists", async () => {
    const { resolveBillingModelPrice } =
      await import("../../../src/lib/services/billing-price-service");

    manualFindFirstMock.mockResolvedValueOnce(null);
    syncedFindFirstMock.mockResolvedValueOnce({
      source: "litellm",
      inputPricePerMillion: 2.5,
      outputPricePerMillion: 7.5,
      cacheReadInputPricePerMillion: 0.8,
      cacheWriteInputPricePerMillion: null,
      maxInputTokens: 200000,
      maxOutputTokens: 8192,
    });

    const result = await resolveBillingModelPrice("gpt-4.1");

    expect(result).toEqual({
      model: "gpt-4.1",
      source: "litellm",
      inputPricePerMillion: 2.5,
      outputPricePerMillion: 7.5,
      cacheReadInputPricePerMillion: 0.8,
      cacheWriteInputPricePerMillion: null,
      matchedRuleType: "flat",
      matchedRuleDisplayLabel: null,
      appliedTierThreshold: null,
      modelMaxInputTokens: 200000,
      modelMaxOutputTokens: 8192,
    });
  });

  it("prefers synced threshold rules before manual tier rules", async () => {
    const { resolveBillingModelPrice } =
      await import("../../../src/lib/services/billing-price-service");

    syncedFindFirstMock.mockResolvedValueOnce({
      source: "litellm",
      inputPricePerMillion: 2.5,
      outputPricePerMillion: 7.5,
      cacheReadInputPricePerMillion: 0.8,
      cacheWriteInputPricePerMillion: null,
      maxInputTokens: 200000,
      maxOutputTokens: 8192,
    });
    tierRulesFindManyMock.mockResolvedValueOnce([
      {
        id: "rule-sync-128k",
        model: "gpt-4.1",
        source: "litellm",
        thresholdInputTokens: 128000,
        displayLabel: null,
        inputPricePerMillion: 5,
        outputPricePerMillion: 15,
        cacheReadInputPricePerMillion: null,
        cacheWriteInputPricePerMillion: null,
        note: null,
        isActive: true,
        createdAt: new Date("2026-02-28T00:00:00.000Z"),
        updatedAt: new Date("2026-02-28T00:00:00.000Z"),
      },
    ]);

    const result = await resolveBillingModelPrice("gpt-4.1", 150000);

    expect(result).toEqual({
      model: "gpt-4.1",
      source: "litellm",
      inputPricePerMillion: 5,
      outputPricePerMillion: 15,
      cacheReadInputPricePerMillion: null,
      cacheWriteInputPricePerMillion: null,
      matchedRuleType: "tiered",
      matchedRuleDisplayLabel: null,
      appliedTierThreshold: 128000,
      modelMaxInputTokens: 200000,
      modelMaxOutputTokens: 8192,
    });
    expect(tierRulesFindManyMock).toHaveBeenCalledTimes(1);
    expect(manualFindFirstMock).not.toHaveBeenCalled();
  });

  it("falls back to flat pricing when prompt tokens do not reach any tier threshold", async () => {
    const { resolveBillingModelPrice } =
      await import("../../../src/lib/services/billing-price-service");

    syncedFindFirstMock.mockResolvedValueOnce({
      source: "litellm",
      inputPricePerMillion: 2.5,
      outputPricePerMillion: 7.5,
      cacheReadInputPricePerMillion: 0.8,
      cacheWriteInputPricePerMillion: null,
      maxInputTokens: 200000,
      maxOutputTokens: 8192,
    });
    tierRulesFindManyMock.mockResolvedValueOnce([
      {
        id: "rule-sync-128k",
        model: "gpt-4.1",
        source: "litellm",
        thresholdInputTokens: 128000,
        displayLabel: null,
        inputPricePerMillion: 5,
        outputPricePerMillion: 15,
        cacheReadInputPricePerMillion: null,
        cacheWriteInputPricePerMillion: null,
        note: null,
        isActive: true,
        createdAt: new Date("2026-02-28T00:00:00.000Z"),
        updatedAt: new Date("2026-02-28T00:00:00.000Z"),
      },
    ]);
    tierRulesFindManyMock.mockResolvedValueOnce([]);
    manualFindFirstMock.mockResolvedValueOnce({
      model: "gpt-4.1",
      inputPricePerMillion: 3,
      outputPricePerMillion: 9,
      cacheReadInputPricePerMillion: null,
      cacheWriteInputPricePerMillion: 1,
    });

    const result = await resolveBillingModelPrice("gpt-4.1", 64000);

    expect(result).toEqual({
      model: "gpt-4.1",
      source: "manual",
      inputPricePerMillion: 3,
      outputPricePerMillion: 9,
      cacheReadInputPricePerMillion: null,
      cacheWriteInputPricePerMillion: 1,
      matchedRuleType: "flat",
      matchedRuleDisplayLabel: null,
      appliedTierThreshold: null,
      modelMaxInputTokens: 200000,
      modelMaxOutputTokens: 8192,
    });
    expect(tierRulesFindManyMock).toHaveBeenCalledTimes(2);
  });

  it("syncs prices from LiteLLM price map and deactivates stale synced tiers when none remain", async () => {
    const { syncBillingModelPrices } =
      await import("../../../src/lib/services/billing-price-service");

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          "gpt-4.1": {
            input_cost_per_token: 0.000003,
            output_cost_per_token: 0.000009,
            max_input_tokens: 200000,
            max_output_tokens: 8192,
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
    expect(dbTransactionMock).toHaveBeenCalledTimes(2);
    expect(txUpdateMock).toHaveBeenNthCalledWith(1, billingModelPricesTable);
    expect(txUpdateMock).toHaveBeenNthCalledWith(2, billingTierRulesTable);
    expect(txInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maxInputTokens: 200000,
        maxOutputTokens: 8192,
      })
    );
    expect(dbInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "success",
        source: "litellm",
      })
    );
  });

  it("returns failed sync when LiteLLM returns no valid price rows", async () => {
    const { syncBillingModelPrices } =
      await import("../../../src/lib/services/billing-price-service");

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
    const { getLatestBillingSyncStatus } =
      await import("../../../src/lib/services/billing-price-service");

    syncHistoryFindFirstMock.mockResolvedValueOnce(null);
    const result = await getLatestBillingSyncStatus();
    expect(result).toBeNull();
  });

  it("listBillingUnresolvedModels groups and hides models that are now resolved", async () => {
    const { listBillingUnresolvedModels } =
      await import("../../../src/lib/services/billing-price-service");

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
    const { listBillingModelPrices } =
      await import("../../../src/lib/services/billing-price-service");

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
        maxInputTokens: 200000,
        maxOutputTokens: 8192,
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
    expect(result.items[0].maxInputTokens).toBe(200000);
    expect(result.items[0].maxOutputTokens).toBe(8192);
  });

  it("lists tier rules in deterministic model/source/threshold order", async () => {
    const { listBillingTierRules } =
      await import("../../../src/lib/services/billing-price-service");

    tierRulesFindManyMock.mockResolvedValueOnce([]);

    await listBillingTierRules({ activeOnly: true });

    expect(tierRulesFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { __op: "asc", arg: "model" },
          { __op: "asc", arg: "source" },
          { __op: "desc", arg: "threshold_input_tokens" },
          { __op: "asc", arg: "id" },
        ],
      })
    );
  });

  it("does not update synced tier rules through the manual update path", async () => {
    const { updateBillingTierRule } =
      await import("../../../src/lib/services/billing-price-service");

    tierRulesFindFirstMock.mockResolvedValueOnce(null);

    const result = await updateBillingTierRule("rule-sync-128k", { isActive: false });

    expect(result).toBeNull();
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects duplicate threshold changes when updating a manual tier rule", async () => {
    const { BillingTierRuleConflictError, updateBillingTierRule } =
      await import("../../../src/lib/services/billing-price-service");

    tierRulesFindFirstMock
      .mockResolvedValueOnce({
        id: "rule-manual-128k",
        model: "gpt-4.1",
        source: "manual",
        thresholdInputTokens: 128000,
      })
      .mockResolvedValueOnce({
        id: "rule-manual-200k",
        model: "gpt-4.1",
        source: "manual",
        thresholdInputTokens: 200000,
      });

    await expect(
      updateBillingTierRule("rule-manual-128k", { thresholdInputTokens: 200000 })
    ).rejects.toBeInstanceOf(BillingTierRuleConflictError);
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects duplicate manual tier thresholds for the same model", async () => {
    const { BillingTierRuleConflictError, createBillingTierRule } =
      await import("../../../src/lib/services/billing-price-service");

    tierRulesFindFirstMock.mockResolvedValueOnce({
      id: "rule-existing",
      model: "gpt-4.1",
      source: "manual",
      thresholdInputTokens: 128000,
    });

    await expect(
      createBillingTierRule({
        model: " gpt-4.1 ",
        thresholdInputTokens: 128000,
        inputPricePerMillion: 5,
        outputPricePerMillion: 15,
      })
    ).rejects.toBeInstanceOf(BillingTierRuleConflictError);
    expect(tierRuleInsertValuesMock).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only model names before persistence", async () => {
    const { BillingTierRuleValidationError, createBillingTierRule } =
      await import("../../../src/lib/services/billing-price-service");

    await expect(
      createBillingTierRule({
        model: "   ",
        thresholdInputTokens: 128000,
        inputPricePerMillion: 5,
        outputPricePerMillion: 15,
      })
    ).rejects.toBeInstanceOf(BillingTierRuleValidationError);
    expect(tierRulesFindFirstMock).not.toHaveBeenCalled();
    expect(tierRuleInsertValuesMock).not.toHaveBeenCalled();
  });
});
