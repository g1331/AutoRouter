import { beforeEach, describe, expect, it, vi } from "vitest";

const onConflictDoUpdateMock = vi.fn(async () => undefined);
const valuesMock = vi.fn(() => ({ onConflictDoUpdate: onConflictDoUpdateMock }));
const insertMock = vi.fn(() => ({ values: valuesMock }));
const upstreamFindFirstMock = vi.fn();
const snapshotFindFirstMock = vi.fn();

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn(() => ({ __op: "eq" })),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      upstreams: {
        findFirst: upstreamFindFirstMock,
      },
      requestBillingSnapshots: {
        findFirst: snapshotFindFirstMock,
      },
    },
    insert: insertMock,
  },
  requestBillingSnapshots: {
    requestLogId: "request_log_id",
  },
  upstreams: {
    id: "id",
  },
}));

vi.mock("@/lib/services/billing-price-service", () => ({
  resolveBillingModelPrice: vi.fn(),
}));

const mockAdjustSpending = vi.fn();
vi.mock("@/lib/services/upstream-quota-tracker", () => ({
  quotaTracker: {
    adjustSpending: (...args: unknown[]) => mockAdjustSpending(...args),
  },
}));

describe("billing-cost-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upstreamFindFirstMock.mockResolvedValue(null);
    snapshotFindFirstMock.mockResolvedValue(null);
    onConflictDoUpdateMock.mockResolvedValue(undefined);
  });

  it("marks request as unbilled when model is missing", async () => {
    const { calculateAndPersistRequestBillingSnapshot } =
      await import("@/lib/services/billing-cost-service");

    const result = await calculateAndPersistRequestBillingSnapshot({
      requestLogId: "log-1",
      apiKeyId: "key-1",
      upstreamId: "up-1",
      model: null,
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    });

    expect(result).toEqual({
      status: "unbilled",
      unbillableReason: "model_missing",
      finalCost: null,
      source: null,
    });
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        billingStatus: "unbilled",
        unbillableReason: "model_missing",
      })
    );
  });

  it("marks request as unbilled when usage is missing", async () => {
    const { calculateAndPersistRequestBillingSnapshot } =
      await import("@/lib/services/billing-cost-service");

    const result = await calculateAndPersistRequestBillingSnapshot({
      requestLogId: "log-2",
      apiKeyId: "key-1",
      upstreamId: "up-1",
      model: "gpt-4.1",
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    });

    expect(result.status).toBe("unbilled");
    expect(result.unbillableReason).toBe("usage_missing");
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        billingStatus: "unbilled",
        unbillableReason: "usage_missing",
      })
    );
  });

  it("marks request as unbilled when model price is unresolved", async () => {
    const { resolveBillingModelPrice } = await import("@/lib/services/billing-price-service");
    const { calculateAndPersistRequestBillingSnapshot } =
      await import("@/lib/services/billing-cost-service");
    vi.mocked(resolveBillingModelPrice).mockResolvedValueOnce(null);

    const result = await calculateAndPersistRequestBillingSnapshot({
      requestLogId: "log-3",
      apiKeyId: "key-1",
      upstreamId: "up-1",
      model: "unknown-model",
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
    });

    expect(result).toEqual({
      status: "unbilled",
      unbillableReason: "price_not_found",
      finalCost: null,
      source: null,
    });
  });

  it("calculates billed cost with upstream multipliers for stream final usage", async () => {
    const { resolveBillingModelPrice } = await import("@/lib/services/billing-price-service");
    const { calculateAndPersistRequestBillingSnapshot } =
      await import("@/lib/services/billing-cost-service");

    vi.mocked(resolveBillingModelPrice).mockResolvedValueOnce({
      model: "gpt-4.1",
      source: "litellm",
      inputPricePerMillion: 2,
      outputPricePerMillion: 8,
      cacheReadInputPricePerMillion: null,
      cacheWriteInputPricePerMillion: null,
    });
    upstreamFindFirstMock.mockResolvedValueOnce({
      billingInputMultiplier: 1.2,
      billingOutputMultiplier: 0.8,
    });

    const result = await calculateAndPersistRequestBillingSnapshot({
      requestLogId: "log-4",
      apiKeyId: "key-1",
      upstreamId: "up-1",
      model: "gpt-4.1",
      usage: {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      },
    });

    // (1000 / 1_000_000) * 2 * 1.2 + (500 / 1_000_000) * 8 * 0.8 = 0.0056
    expect(result.status).toBe("billed");
    expect(result.unbillableReason).toBeNull();
    expect(result.source).toBe("litellm");
    expect(result.finalCost).toBeCloseTo(0.0056, 8);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        billingStatus: "billed",
        priceSource: "litellm",
        inputMultiplier: 1.2,
        outputMultiplier: 0.8,
      })
    );
  });

  it("applies quota delta after successful billed upsert", async () => {
    const { resolveBillingModelPrice } = await import("@/lib/services/billing-price-service");
    const { calculateAndPersistRequestBillingSnapshot } =
      await import("@/lib/services/billing-cost-service");

    vi.mocked(resolveBillingModelPrice).mockResolvedValueOnce({
      model: "gpt-4.1",
      source: "litellm",
      inputPricePerMillion: 10,
      outputPricePerMillion: 30,
      cacheReadInputPricePerMillion: null,
      cacheWriteInputPricePerMillion: null,
    });
    upstreamFindFirstMock.mockResolvedValueOnce({
      billingInputMultiplier: 1,
      billingOutputMultiplier: 1,
    });

    await calculateAndPersistRequestBillingSnapshot({
      requestLogId: "log-quota",
      apiKeyId: "key-1",
      upstreamId: "up-1",
      model: "gpt-4.1",
      usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
    });

    // (1000/1e6)*10 + (500/1e6)*30 = 0.01 + 0.015 = 0.025
    expect(mockAdjustSpending).toHaveBeenCalledWith("up-1", expect.closeTo(0.025, 6));
  });

  it("does not apply quota delta for unbilled requests", async () => {
    const { calculateAndPersistRequestBillingSnapshot } =
      await import("@/lib/services/billing-cost-service");

    await calculateAndPersistRequestBillingSnapshot({
      requestLogId: "log-unbilled",
      apiKeyId: "key-1",
      upstreamId: "up-1",
      model: null,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });

    expect(mockAdjustSpending).not.toHaveBeenCalled();
  });

  it("rolls back previous billed cost when snapshot is overwritten as unbilled", async () => {
    const { calculateAndPersistRequestBillingSnapshot } =
      await import("@/lib/services/billing-cost-service");

    snapshotFindFirstMock.mockResolvedValueOnce({
      upstreamId: "up-rollback",
      billingStatus: "billed",
      finalCost: 0.0123,
    });

    await calculateAndPersistRequestBillingSnapshot({
      requestLogId: "log-unbilled-rollback",
      apiKeyId: "key-1",
      upstreamId: "up-rollback",
      model: null,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });

    expect(mockAdjustSpending).toHaveBeenCalledWith("up-rollback", expect.closeTo(-0.0123, 8));
  });

  it("does not overcount quota on billed upsert retry", async () => {
    const { resolveBillingModelPrice } = await import("@/lib/services/billing-price-service");
    const { calculateAndPersistRequestBillingSnapshot } =
      await import("@/lib/services/billing-cost-service");

    vi.mocked(resolveBillingModelPrice).mockResolvedValueOnce({
      model: "gpt-4.1",
      source: "litellm",
      inputPricePerMillion: 10,
      outputPricePerMillion: 30,
      cacheReadInputPricePerMillion: null,
      cacheWriteInputPricePerMillion: null,
    });
    upstreamFindFirstMock.mockResolvedValueOnce({
      billingInputMultiplier: 1,
      billingOutputMultiplier: 1,
    });
    snapshotFindFirstMock.mockResolvedValueOnce({
      upstreamId: "up-1",
      billingStatus: "billed",
      finalCost: 0.025,
    });

    await calculateAndPersistRequestBillingSnapshot({
      requestLogId: "log-quota-retry",
      apiKeyId: "key-1",
      upstreamId: "up-1",
      model: "gpt-4.1",
      usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
    });

    expect(mockAdjustSpending).not.toHaveBeenCalled();
  });

  it("keeps cache read/write billing mapping consistent", async () => {
    const { resolveBillingModelPrice } = await import("@/lib/services/billing-price-service");
    const { calculateAndPersistRequestBillingSnapshot } =
      await import("@/lib/services/billing-cost-service");

    vi.mocked(resolveBillingModelPrice).mockResolvedValueOnce({
      model: "gpt-4.1",
      source: "litellm",
      inputPricePerMillion: 2,
      outputPricePerMillion: 8,
      cacheReadInputPricePerMillion: 1,
      cacheWriteInputPricePerMillion: 3,
    });
    upstreamFindFirstMock.mockResolvedValueOnce({
      billingInputMultiplier: 1,
      billingOutputMultiplier: 1,
    });

    const result = await calculateAndPersistRequestBillingSnapshot({
      requestLogId: "log-cache-cost",
      apiKeyId: "key-1",
      upstreamId: "up-1",
      model: "gpt-4.1",
      usage: {
        promptTokens: 1000,
        completionTokens: 100,
        totalTokens: 1100,
        cacheReadTokens: 200,
        cacheWriteTokens: 300,
      },
    });

    expect(result.status).toBe("billed");
    // input(500*2) + output(100*8) + cacheRead(200*1) + cacheWrite(300*3), all /1e6.
    expect(result.finalCost).toBeCloseTo(0.0029, 8);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        promptTokens: 500,
        cacheReadTokens: 200,
        cacheWriteTokens: 300,
        cacheReadCost: expect.closeTo(0.0002, 8),
        cacheWriteCost: expect.closeTo(0.0009, 8),
      })
    );
  });
});
