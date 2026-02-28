import { beforeEach, describe, expect, it, vi } from "vitest";

const onConflictDoUpdateMock = vi.fn(async () => undefined);
const valuesMock = vi.fn(() => ({ onConflictDoUpdate: onConflictDoUpdateMock }));
const insertMock = vi.fn(() => ({ values: valuesMock }));
const upstreamFindFirstMock = vi.fn();

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

describe("billing-cost-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upstreamFindFirstMock.mockResolvedValue(null);
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
      source: "openrouter",
      inputPricePerMillion: 2,
      outputPricePerMillion: 8,
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
    expect(result.source).toBe("openrouter");
    expect(result.finalCost).toBeCloseTo(0.0056, 8);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        billingStatus: "billed",
        priceSource: "openrouter",
        inputMultiplier: 1.2,
        outputMultiplier: 0.8,
      })
    );
  });
});
