import { beforeEach, describe, expect, it, vi } from "vitest";

const onConflictDoUpdateMock = vi.fn(async () => undefined);
const valuesMock = vi.fn(() => ({ onConflictDoUpdate: onConflictDoUpdateMock }));
const insertMock = vi.fn(() => ({ values: valuesMock }));
const upstreamFindFirstMock = vi.fn();
const snapshotFindFirstMock = vi.fn();
const requestLogsFindFirstMock = vi.fn();

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
      requestLogs: {
        findFirst: requestLogsFindFirstMock,
      },
    },
    insert: insertMock,
  },
  requestBillingSnapshots: {
    requestLogId: "request_log_id",
  },
  requestLogs: {
    id: "id",
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

const loggerWarnMock = vi.fn();
vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: loggerWarnMock,
    error: vi.fn(),
  }),
}));

describe("billing-cost-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upstreamFindFirstMock.mockResolvedValue(null);
    snapshotFindFirstMock.mockResolvedValue(null);
    requestLogsFindFirstMock.mockResolvedValue({ apiKeyId: "key-1", upstreamId: "up-1" });
    onConflictDoUpdateMock.mockResolvedValue(undefined);
  });

  it("marks request as unbilled when model is missing", async () => {
    const { calculateAndPersistRequestBillingSnapshot } =
      await import("../../../src/lib/services/billing-cost-service");

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
        matchedRuleType: null,
        matchedRuleDisplayLabel: null,
        appliedTierThreshold: null,
        modelMaxInputTokens: null,
        modelMaxOutputTokens: null,
      })
    );
  });

  it("marks request as unbilled when usage is missing", async () => {
    const { calculateAndPersistRequestBillingSnapshot } =
      await import("../../../src/lib/services/billing-cost-service");

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
    const { resolveBillingModelPrice } =
      await import("../../../src/lib/services/billing-price-service");
    const { calculateAndPersistRequestBillingSnapshot } =
      await import("../../../src/lib/services/billing-cost-service");
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
    const { resolveBillingModelPrice } =
      await import("../../../src/lib/services/billing-price-service");
    const { calculateAndPersistRequestBillingSnapshot } =
      await import("../../../src/lib/services/billing-cost-service");

    vi.mocked(resolveBillingModelPrice).mockResolvedValueOnce({
      model: "gpt-4.1",
      source: "litellm",
      inputPricePerMillion: 2,
      outputPricePerMillion: 8,
      cacheReadInputPricePerMillion: null,
      cacheWriteInputPricePerMillion: null,
      matchedRuleType: "flat",
      matchedRuleDisplayLabel: null,
      appliedTierThreshold: null,
      modelMaxInputTokens: 200000,
      modelMaxOutputTokens: 8192,
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
    const { resolveBillingModelPrice } =
      await import("../../../src/lib/services/billing-price-service");
    const { calculateAndPersistRequestBillingSnapshot } =
      await import("../../../src/lib/services/billing-cost-service");

    vi.mocked(resolveBillingModelPrice).mockResolvedValueOnce({
      model: "gpt-4.1",
      source: "litellm",
      inputPricePerMillion: 10,
      outputPricePerMillion: 30,
      cacheReadInputPricePerMillion: null,
      cacheWriteInputPricePerMillion: null,
      matchedRuleType: "flat",
      matchedRuleDisplayLabel: null,
      appliedTierThreshold: null,
      modelMaxInputTokens: 200000,
      modelMaxOutputTokens: 8192,
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
      await import("../../../src/lib/services/billing-cost-service");

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
      await import("../../../src/lib/services/billing-cost-service");

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
    const { resolveBillingModelPrice } =
      await import("../../../src/lib/services/billing-price-service");
    const { calculateAndPersistRequestBillingSnapshot } =
      await import("../../../src/lib/services/billing-cost-service");

    vi.mocked(resolveBillingModelPrice).mockResolvedValueOnce({
      model: "gpt-4.1",
      source: "litellm",
      inputPricePerMillion: 10,
      outputPricePerMillion: 30,
      cacheReadInputPricePerMillion: null,
      cacheWriteInputPricePerMillion: null,
      matchedRuleType: "flat",
      matchedRuleDisplayLabel: null,
      appliedTierThreshold: null,
      modelMaxInputTokens: 200000,
      modelMaxOutputTokens: 8192,
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
    const { resolveBillingModelPrice } =
      await import("../../../src/lib/services/billing-price-service");
    const { calculateAndPersistRequestBillingSnapshot } =
      await import("../../../src/lib/services/billing-cost-service");

    vi.mocked(resolveBillingModelPrice).mockResolvedValueOnce({
      model: "gpt-4.1",
      source: "litellm",
      inputPricePerMillion: 2,
      outputPricePerMillion: 8,
      cacheReadInputPricePerMillion: 1,
      cacheWriteInputPricePerMillion: 3,
      matchedRuleType: "flat",
      matchedRuleDisplayLabel: null,
      appliedTierThreshold: null,
      modelMaxInputTokens: 200000,
      modelMaxOutputTokens: 8192,
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
    expect(resolveBillingModelPrice).toHaveBeenCalledWith("gpt-4.1", 500);
  });

  it("uses provider-normalized billed input tokens for threshold resolution", async () => {
    const { resolveBillingModelPrice } =
      await import("../../../src/lib/services/billing-price-service");
    const { calculateAndPersistRequestBillingSnapshot } =
      await import("../../../src/lib/services/billing-cost-service");

    vi.mocked(resolveBillingModelPrice).mockResolvedValueOnce({
      model: "claude-3-5-sonnet",
      source: "litellm",
      inputPricePerMillion: 3,
      outputPricePerMillion: 15,
      cacheReadInputPricePerMillion: null,
      cacheWriteInputPricePerMillion: null,
      matchedRuleType: "flat",
      matchedRuleDisplayLabel: null,
      appliedTierThreshold: null,
      modelMaxInputTokens: 200000,
      modelMaxOutputTokens: 8192,
    });
    upstreamFindFirstMock.mockResolvedValueOnce({
      billingInputMultiplier: 1,
      billingOutputMultiplier: 1,
    });

    await calculateAndPersistRequestBillingSnapshot({
      requestLogId: "log-anthropic-billed-input",
      apiKeyId: "key-1",
      upstreamId: "up-1",
      model: "claude-3-5-sonnet",
      usage: {
        promptTokens: 500,
        completionTokens: 100,
        totalTokens: 600,
        cacheReadTokens: 200,
        cacheWriteTokens: 300,
      },
    });

    expect(resolveBillingModelPrice).toHaveBeenCalledWith("claude-3-5-sonnet", 0);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        promptTokens: 0,
      })
    );
  });

  it("persists the matched tier threshold when billing resolves from a tier rule", async () => {
    const { resolveBillingModelPrice } =
      await import("../../../src/lib/services/billing-price-service");
    const { calculateAndPersistRequestBillingSnapshot } =
      await import("../../../src/lib/services/billing-cost-service");

    vi.mocked(resolveBillingModelPrice).mockResolvedValueOnce({
      model: "gpt-4.1",
      source: "litellm",
      inputPricePerMillion: 5,
      outputPricePerMillion: 15,
      cacheReadInputPricePerMillion: null,
      cacheWriteInputPricePerMillion: null,
      matchedRuleType: "tiered",
      matchedRuleDisplayLabel: ">128K context",
      appliedTierThreshold: 128000,
      modelMaxInputTokens: 200000,
      modelMaxOutputTokens: 8192,
    });
    upstreamFindFirstMock.mockResolvedValueOnce({
      billingInputMultiplier: 1,
      billingOutputMultiplier: 1,
    });

    const result = await calculateAndPersistRequestBillingSnapshot({
      requestLogId: "log-tier",
      apiKeyId: "key-1",
      upstreamId: "up-1",
      model: "gpt-4.1",
      usage: {
        promptTokens: 150000,
        completionTokens: 50,
        totalTokens: 150050,
      },
    });

    expect(result.status).toBe("billed");
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        priceSource: "litellm",
        matchedRuleType: "tiered",
        matchedRuleDisplayLabel: ">128K context",
        appliedTierThreshold: 128000,
        modelMaxInputTokens: 200000,
        modelMaxOutputTokens: 8192,
      })
    );
  });

  it("writes null FK columns when request_logs row was cascade-nulled after key/upstream deletion", async () => {
    // 模拟生产环境观察到的 race：冒烟测试发完请求后立刻删除了 api_key 和 upstream，
    // request_logs 行已被 cascade SET NULL；调用方仍然带着内存里的旧 id 进来，
    // 此时 snapshot 必须按 request_logs 的最终值写入 NULL，避免 FK 违例。
    requestLogsFindFirstMock.mockResolvedValueOnce({ apiKeyId: null, upstreamId: null });

    const { calculateAndPersistRequestBillingSnapshot } =
      await import("../../../src/lib/services/billing-cost-service");

    const result = await calculateAndPersistRequestBillingSnapshot({
      requestLogId: "log-fk-race",
      apiKeyId: "stale-key-id",
      upstreamId: "stale-upstream-id",
      model: "gpt-4.1-smoke",
      usage: { promptTokens: 6, completionTokens: 3, totalTokens: 9 },
    });

    expect(result.status).toBe("unbilled");
    expect(result.unbillableReason).toBe("price_not_found");
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyId: null,
        upstreamId: null,
      })
    );
  });

  it("falls back to null FK columns when request_logs row is missing", async () => {
    requestLogsFindFirstMock.mockResolvedValueOnce(undefined);

    const { calculateAndPersistRequestBillingSnapshot } =
      await import("../../../src/lib/services/billing-cost-service");

    await calculateAndPersistRequestBillingSnapshot({
      requestLogId: "log-missing",
      apiKeyId: "stale-key-id",
      upstreamId: "stale-upstream-id",
      model: null,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyId: null,
        upstreamId: null,
      })
    );
  });

  it("retries with null api_key_id when INSERT hits api_keys FK violation (drizzle-wrapped)", async () => {
    // 真实生产 race：reconcile 读到的 api_key_id 在 reconcile→INSERT 之间被并发删除，
    // INSERT 撞 FK；helper 应当捕获 PG 23503 + 对应约束名后单次重试，把 apiKeyId 置 NULL。
    // reconcile 此时还能读到旧 id（cascade 尚未触发），下一刻 INSERT 才撞 FK。
    //
    // 关键：drizzle-orm 0.45 抛出的是 DrizzleQueryError，原始 PostgresError 挂在 `.cause`，
    // 外层没有 `code` 字段。本测试用这种形状复现生产真实链路；下一个测试覆盖
    // 平铺形状（postgres-js 在少数路径上可能不经 drizzle 包装直接抛出）。
    requestLogsFindFirstMock.mockResolvedValueOnce({
      apiKeyId: "doomed-key-id",
      upstreamId: "still-valid-upstream",
    });
    const fkError = Object.assign(new Error("Failed query: insert into ..."), {
      query: "insert into request_billing_snapshots ...",
      params: ["doomed-key-id"],
      cause: {
        code: "23503",
        constraint_name: "request_billing_snapshots_api_key_id_api_keys_id_fk",
        table_name: "request_billing_snapshots",
      },
    });
    onConflictDoUpdateMock.mockRejectedValueOnce(fkError).mockResolvedValueOnce(undefined);

    const { calculateAndPersistRequestBillingSnapshot } =
      await import("../../../src/lib/services/billing-cost-service");

    await calculateAndPersistRequestBillingSnapshot({
      requestLogId: "log-fk-retry",
      apiKeyId: "doomed-key-id",
      upstreamId: "still-valid-upstream",
      model: "gpt-4.1-smoke",
      usage: { promptTokens: 6, completionTokens: 3, totalTokens: 9 },
    });

    expect(onConflictDoUpdateMock).toHaveBeenCalledTimes(2);
    expect(valuesMock).toHaveBeenCalledTimes(2);
    expect(valuesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        apiKeyId: null,
        upstreamId: "still-valid-upstream",
      })
    );
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        nulledColumn: "apiKeyId",
        constraint: "request_billing_snapshots_api_key_id_api_keys_id_fk",
      }),
      expect.stringContaining("FK violation retried")
    );
  });

  it("retries with null upstream_id when INSERT hits upstreams FK violation (flat shape)", async () => {
    // 兼容形状：PostgresError 直接冒出来（未经 DrizzleQueryError 包装），
    // 探测函数也需识别。覆盖 postgres-js 在连接级 / 异常退出路径上的情况。
    requestLogsFindFirstMock.mockResolvedValueOnce({
      apiKeyId: "still-valid-key",
      upstreamId: "doomed-upstream-id",
    });
    const fkError = Object.assign(new Error("FK violation"), {
      code: "23503",
      constraint_name: "request_billing_snapshots_upstream_id_upstreams_id_fk",
    });
    onConflictDoUpdateMock.mockRejectedValueOnce(fkError).mockResolvedValueOnce(undefined);

    const { calculateAndPersistRequestBillingSnapshot } =
      await import("../../../src/lib/services/billing-cost-service");

    await calculateAndPersistRequestBillingSnapshot({
      requestLogId: "log-upstream-retry",
      apiKeyId: "still-valid-key",
      upstreamId: "doomed-upstream-id",
      model: "gpt-4.1-smoke",
      usage: { promptTokens: 6, completionTokens: 3, totalTokens: 9 },
    });

    expect(valuesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        apiKeyId: "still-valid-key",
        upstreamId: null,
      })
    );
  });

  it("retries with null upstream_id when wrapped FK violation uses constraint field", async () => {
    requestLogsFindFirstMock.mockResolvedValueOnce({
      apiKeyId: "still-valid-key",
      upstreamId: "doomed-upstream-id",
    });
    const fkError = Object.assign(new Error("Failed query: insert into ..."), {
      cause: {
        code: "23503",
        constraint: "request_billing_snapshots_upstream_id_upstreams_id_fk",
      },
    });
    onConflictDoUpdateMock.mockRejectedValueOnce(fkError).mockResolvedValueOnce(undefined);

    const { calculateAndPersistRequestBillingSnapshot } =
      await import("../../../src/lib/services/billing-cost-service");

    await calculateAndPersistRequestBillingSnapshot({
      requestLogId: "log-wrapped-constraint-retry",
      apiKeyId: "still-valid-key",
      upstreamId: "doomed-upstream-id",
      model: "gpt-4.1-smoke",
      usage: { promptTokens: 6, completionTokens: 3, totalTokens: 9 },
    });

    expect(onConflictDoUpdateMock).toHaveBeenCalledTimes(2);
    expect(valuesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        apiKeyId: "still-valid-key",
        upstreamId: null,
      })
    );
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        nulledColumn: "upstreamId",
        constraint: "request_billing_snapshots_upstream_id_upstreams_id_fk",
      }),
      expect.stringContaining("FK violation retried")
    );
  });

  it("skips quota delta for FK-retried column to avoid db/memory state drift", async () => {
    // 重试时 upstream_id 被置 NULL，配额累加必须基于实际写入值（NULL），
    // 否则数据库快照已无 upstream 维度但内存配额仍按旧 id 累加，造成幽灵配额。
    const { resolveBillingModelPrice } =
      await import("../../../src/lib/services/billing-price-service");
    vi.mocked(resolveBillingModelPrice).mockResolvedValueOnce({
      model: "gpt-4.1",
      source: "litellm",
      inputPricePerMillion: 10,
      outputPricePerMillion: 30,
      cacheReadInputPricePerMillion: null,
      cacheWriteInputPricePerMillion: null,
      matchedRuleType: "flat",
      matchedRuleDisplayLabel: null,
      appliedTierThreshold: null,
      modelMaxInputTokens: 200000,
      modelMaxOutputTokens: 8192,
    });
    upstreamFindFirstMock.mockResolvedValueOnce({
      billingInputMultiplier: 1,
      billingOutputMultiplier: 1,
    });
    requestLogsFindFirstMock.mockResolvedValueOnce({
      apiKeyId: "key-1",
      upstreamId: "doomed-upstream-id",
    });

    const fkError = Object.assign(new Error("FK violation"), {
      code: "23503",
      constraint_name: "request_billing_snapshots_upstream_id_upstreams_id_fk",
    });
    onConflictDoUpdateMock.mockRejectedValueOnce(fkError).mockResolvedValueOnce(undefined);

    const { calculateAndPersistRequestBillingSnapshot } =
      await import("../../../src/lib/services/billing-cost-service");

    await calculateAndPersistRequestBillingSnapshot({
      requestLogId: "log-quota-retry-null",
      apiKeyId: "key-1",
      upstreamId: "doomed-upstream-id",
      model: "gpt-4.1",
      usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
    });

    const upstreamCalls = mockAdjustSpending.mock.calls.filter(
      ([id]) => id === "doomed-upstream-id"
    );
    expect(upstreamCalls).toHaveLength(0);
  });

  it("rethrows non-FK errors without retry", async () => {
    const otherError = Object.assign(new Error("unique violation"), { code: "23505" });
    onConflictDoUpdateMock.mockRejectedValueOnce(otherError);

    const { calculateAndPersistRequestBillingSnapshot } =
      await import("../../../src/lib/services/billing-cost-service");

    await expect(
      calculateAndPersistRequestBillingSnapshot({
        requestLogId: "log-other-err",
        apiKeyId: "key-1",
        upstreamId: "up-1",
        model: null,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      })
    ).rejects.toBe(otherError);

    expect(onConflictDoUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("rethrows wrapped non-FK errors without retry", async () => {
    // 防回归：wrapped 形状里的 cause.code 若不是 23503（例如 23505 唯一约束、08006 连接断开），
    // 探测函数必须返回 null，绝不能把所有带 cause 的 DrizzleQueryError 都误判为 FK 违例。
    const wrappedUniqueErr = Object.assign(new Error("Failed query: insert into ..."), {
      cause: { code: "23505", constraint_name: "some_unique_constraint" },
    });
    onConflictDoUpdateMock.mockRejectedValueOnce(wrappedUniqueErr);

    const { calculateAndPersistRequestBillingSnapshot } =
      await import("../../../src/lib/services/billing-cost-service");

    await expect(
      calculateAndPersistRequestBillingSnapshot({
        requestLogId: "log-wrapped-non-fk",
        apiKeyId: "key-1",
        upstreamId: "up-1",
        model: null,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      })
    ).rejects.toBe(wrappedUniqueErr);

    expect(onConflictDoUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("rethrows FK violation when constraint name is not recognized", async () => {
    const fkError = Object.assign(new Error("FK violation"), {
      code: "23503",
      constraint_name: "some_unrelated_constraint",
    });
    onConflictDoUpdateMock.mockRejectedValueOnce(fkError);

    const { calculateAndPersistRequestBillingSnapshot } =
      await import("../../../src/lib/services/billing-cost-service");

    await expect(
      calculateAndPersistRequestBillingSnapshot({
        requestLogId: "log-unknown-fk",
        apiKeyId: "key-1",
        upstreamId: "up-1",
        model: null,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      })
    ).rejects.toBe(fkError);

    expect(onConflictDoUpdateMock).toHaveBeenCalledTimes(1);
  });
});
