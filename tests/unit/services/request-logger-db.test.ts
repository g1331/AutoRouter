import { describe, it, expect, vi, beforeEach } from "vitest";

const dbInsertMock = vi.fn();
const dbUpdateMock = vi.fn();
const dbSelectMock = vi.fn();
const requestLogsFindManyMock = vi.fn();
const calculateAndPersistRequestBillingSnapshotMock = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: unknown[]) => dbInsertMock(...args),
    update: (...args: unknown[]) => dbUpdateMock(...args),
    select: (...args: unknown[]) => dbSelectMock(...args),
    query: {
      requestLogs: {
        findMany: (...args: unknown[]) => requestLogsFindManyMock(...args),
      },
    },
  },
  requestLogs: {
    id: "id",
    apiKeyId: "api_key_id",
    upstreamId: "upstream_id",
    statusCode: "status_code",
    model: "model",
    createdAt: "created_at",
  },
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    and: vi.fn((...args) => ({ __op: "and", args })),
    asc: vi.fn((arg) => ({ __op: "asc", arg })),
    count: vi.fn(() => ({ __op: "count" })),
    desc: vi.fn((arg) => ({ __op: "desc", arg })),
    eq: vi.fn((a, b) => ({ __op: "eq", a, b })),
    gte: vi.fn((a, b) => ({ __op: "gte", a, b })),
    isNull: vi.fn((arg) => ({ __op: "isNull", arg })),
    lt: vi.fn((a, b) => ({ __op: "lt", a, b })),
    lte: vi.fn((a, b) => ({ __op: "lte", a, b })),
    sql: Object.assign(
      vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
        __op: "sql",
        strings,
        values,
      })),
      actual.sql
    ),
  };
});

vi.mock("@/lib/services/billing-cost-service", () => ({
  calculateAndPersistRequestBillingSnapshot: (...args: unknown[]) =>
    calculateAndPersistRequestBillingSnapshotMock(...args),
}));

describe("request-logger (db flows)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updateRequestLog returns null when no fields are provided", async () => {
    const { updateRequestLog } = await import("@/lib/services/request-logger");

    const result = await updateRequestLog("log-1", {});
    expect(result).toBeNull();
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("updateRequestLog updates fields and serializes failoverHistory/routingDecision", async () => {
    const { updateRequestLog } = await import("@/lib/services/request-logger");

    const returningMock = vi.fn().mockResolvedValueOnce([{ id: "log-1" }]);
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    dbUpdateMock.mockReturnValueOnce({ set: setMock });

    const result = await updateRequestLog("log-1", {
      apiKeyId: "key-1",
      apiKeyName: "Production Key",
      apiKeyPrefix: "sk-prod",
      upstreamId: "upstream-1",
      method: "POST",
      path: "/v1/chat/completions",
      model: "gpt-4.1",
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      cachedTokens: 1,
      reasoningTokens: 2,
      reasoningEffort: "high",
      cacheCreationTokens: 3,
      cacheReadTokens: 4,
      statusCode: 200,
      durationMs: 123,
      routingDurationMs: 45,
      errorMessage: null,
      routingType: "group",
      priorityTier: "tier-1",
      failoverAttempts: 2,
      failoverHistory: [
        {
          upstream_id: "u2",
          upstream_name: "backup",
          attempted_at: "2026-02-28T00:00:00.000Z",
          error_type: "timeout",
          error_message: "timeout",
          status_code: null,
        },
      ],
      routingDecision: { chosen_upstream_id: "u1" },
      thinkingConfig: {
        provider: "openai",
        protocol: "openai_chat",
        mode: "reasoning",
        level: "high",
        budget_tokens: null,
        include_thoughts: null,
        source_paths: ["reasoning_effort"],
      },
      sessionId: "sid",
      affinityHit: true,
      affinityMigrated: false,
      ttftMs: 99,
      isStream: true,
      sessionIdCompensated: true,
      headerDiff: { inbound_count: 1, outbound_count: 1 },
    });

    expect(result).not.toBeNull();
    expect(dbUpdateMock).toHaveBeenCalledTimes(1);

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyId: "key-1",
        apiKeyName: "Production Key",
        apiKeyPrefix: "sk-prod",
        upstreamId: "upstream-1",
        method: "POST",
        path: "/v1/chat/completions",
        model: "gpt-4.1",
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        cachedTokens: 1,
        reasoningTokens: 2,
        reasoningEffort: "high",
        cacheCreationTokens: 3,
        cacheReadTokens: 4,
        statusCode: 200,
        durationMs: 123,
        routingDurationMs: 45,
        routingType: "group",
        priorityTier: "tier-1",
        failoverAttempts: 2,
        failoverHistory: expect.stringContaining("upstream_id"),
        routingDecision: expect.stringContaining("chosen_upstream_id"),
        thinkingConfig: expect.stringContaining('"provider":"openai"'),
        sessionId: "sid",
        affinityHit: true,
        affinityMigrated: false,
        ttftMs: 99,
        isStream: true,
        sessionIdCompensated: true,
      })
    );
  });

  it("logRequestStart persists isStream when provided", async () => {
    const { logRequestStart } = await import("@/lib/services/request-logger");

    const returningMock = vi.fn().mockResolvedValueOnce([{ id: "log-stream-start" }]);
    const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
    dbInsertMock.mockReturnValueOnce({ values: valuesMock });

    await logRequestStart({
      apiKeyId: "key-1",
      apiKeyName: "Production Key",
      apiKeyPrefix: "sk-prod",
      userId: "user-1",
      upstreamId: null,
      method: "POST",
      path: "/v1/chat/completions",
      model: "gpt-4.1",
      isStream: true,
      reasoningEffort: "enabled",
      routingType: "tiered",
      sessionId: "sid-1",
    });

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyId: "key-1",
        apiKeyName: "Production Key",
        apiKeyPrefix: "sk-prod",
        userId: "user-1",
        method: "POST",
        path: "/v1/chat/completions",
        model: "gpt-4.1",
        isStream: true,
        reasoningEffort: "enabled",
        statusCode: null,
        durationMs: null,
      })
    );
  });

  it("logRequest applies defaults for optional fields", async () => {
    const { logRequest } = await import("@/lib/services/request-logger");

    const returningMock = vi.fn().mockResolvedValueOnce([{ id: "log-1" }]);
    const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
    dbInsertMock.mockReturnValueOnce({ values: valuesMock });

    await logRequest({
      apiKeyId: null,
      apiKeyName: "Transient Key",
      apiKeyPrefix: "sk-temp",
      upstreamId: "upstream-1",
      method: "POST",
      path: "/v1/chat/completions",
      model: "gpt-4.1",
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
      statusCode: 200,
      durationMs: 10,
    });

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyName: "Transient Key",
        apiKeyPrefix: "sk-temp",
        // The owner snapshot defaults to NULL for ownerless / legacy traffic.
        userId: null,
        cachedTokens: 0,
        reasoningTokens: 0,
        reasoningEffort: null,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        routingDurationMs: null,
        errorMessage: null,
        routingType: null,
        priorityTier: null,
        failoverAttempts: 0,
        failoverHistory: null,
        routingDecision: null,
        thinkingConfig: null,
        affinityHit: false,
        affinityMigrated: false,
        ttftMs: null,
        isStream: false,
        sessionIdCompensated: false,
        headerDiff: null,
        createdAt: expect.any(Date),
      })
    );
  });

  it("listRequestLogs supports filters, parses JSON fields, and includes billing snapshot when present", async () => {
    const { listRequestLogs } = await import("@/lib/services/request-logger");

    const whereMock = vi.fn().mockResolvedValueOnce([{ value: 2 }]);
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    dbSelectMock.mockReturnValueOnce({ from: fromMock });

    requestLogsFindManyMock.mockResolvedValueOnce([
      {
        id: "log-1",
        apiKeyId: "key-1",
        upstreamId: "upstream-1",
        upstream: { name: "U1" },
        method: "POST",
        path: "/v1/chat/completions",
        model: "gpt-4.1",
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
        cachedTokens: 0,
        reasoningTokens: 0,
        reasoningEffort: "medium",
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        statusCode: 200,
        durationMs: 10,
        routingDurationMs: null,
        errorMessage: null,
        routingType: "group",
        priorityTier: null,
        groupName: "g",
        lbStrategy: "round_robin",
        failoverAttempts: 1,
        failoverHistory: JSON.stringify([{ upstream_id: "u2" }]),
        routingDecision: JSON.stringify({ chosen_upstream_id: "u1" }),
        thinkingConfig: JSON.stringify({
          provider: "openai",
          protocol: "openai_chat",
          mode: "reasoning",
          level: "high",
          budget_tokens: null,
          include_thoughts: null,
          source_paths: ["reasoning_effort"],
        }),
        sessionId: null,
        affinityHit: false,
        affinityMigrated: false,
        ttftMs: null,
        isStream: false,
        sessionIdCompensated: false,
        headerDiff: null,
        billingSnapshot: {
          billingStatus: "unknown",
          unbillableReason: null,
          priceSource: "bad",
          baseInputPricePerMillion: 3,
          baseOutputPricePerMillion: 9,
          baseCacheReadInputPricePerMillion: null,
          baseCacheWriteInputPricePerMillion: null,
          inputMultiplier: 1,
          outputMultiplier: 1,
          promptTokens: 1,
          cacheReadCost: 0,
          cacheWriteCost: 0,
          finalCost: 0.00001,
          currency: "USD",
          billedAt: null,
        },
        createdAt: new Date("2026-02-28T00:00:00.000Z"),
      },
      {
        id: "log-2",
        apiKeyId: null,
        upstreamId: null,
        upstream: null,
        method: null,
        path: null,
        model: null,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
        reasoningEffort: null,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        statusCode: null,
        durationMs: null,
        routingDurationMs: null,
        errorMessage: "err",
        routingType: null,
        priorityTier: null,
        groupName: null,
        lbStrategy: null,
        failoverAttempts: 0,
        failoverHistory: "not-json",
        routingDecision: "not-json",
        thinkingConfig: "not-json",
        sessionId: null,
        affinityHit: false,
        affinityMigrated: false,
        ttftMs: null,
        isStream: false,
        sessionIdCompensated: false,
        headerDiff: null,
        billingSnapshot: null,
        createdAt: new Date("2026-02-28T00:00:00.000Z"),
      },
    ]);

    const result = await listRequestLogs(1, 20, {
      apiKeyId: "key-1",
      upstreamId: "upstream-1",
      statusCode: 200,
      startTime: new Date("2026-02-27T00:00:00.000Z"),
      endTime: new Date("2026-03-01T00:00:00.000Z"),
    });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].upstreamName).toBe("U1");
    expect(result.items[0].reasoningEffort).toBe("medium");
    expect(result.items[0].failoverHistory).toEqual([{ upstream_id: "u2" }]);
    expect(result.items[0].routingDecision).toEqual({ chosen_upstream_id: "u1" });
    expect(result.items[0].thinkingConfig).toEqual({
      provider: "openai",
      protocol: "openai_chat",
      mode: "reasoning",
      level: "high",
      budget_tokens: null,
      include_thoughts: null,
      source_paths: ["reasoning_effort"],
    });
    expect(result.items[0].billingStatus).toBeNull();
    expect(result.items[0].priceSource).toBeNull();
    expect(result.items[1].reasoningEffort).toBeNull();
    expect(result.items[1].failoverHistory).toBeNull();
    expect(result.items[1].routingDecision).toBeNull();
    expect(result.items[1].thinkingConfig).toBeNull();
  });

  it("listRequestLogs adds an eq filter on requestLogs.id when filters.id is set", async () => {
    const { listRequestLogs } = await import("@/lib/services/request-logger");
    const { eq } = await import("drizzle-orm");

    const whereMock = vi.fn().mockResolvedValueOnce([{ value: 1 }]);
    dbSelectMock.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({ where: whereMock }),
    });
    requestLogsFindManyMock.mockResolvedValueOnce([
      {
        id: "log-focus",
        apiKeyId: null,
        upstreamId: null,
        upstream: null,
        method: null,
        path: null,
        model: null,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
        reasoningEffort: null,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        statusCode: 200,
        durationMs: 1,
        routingDurationMs: null,
        errorMessage: null,
        routingType: null,
        priorityTier: null,
        groupName: null,
        lbStrategy: null,
        failoverAttempts: 0,
        failoverHistory: null,
        routingDecision: null,
        thinkingConfig: null,
        sessionId: null,
        affinityHit: false,
        affinityMigrated: false,
        ttftMs: null,
        isStream: false,
        sessionIdCompensated: false,
        headerDiff: null,
        billingSnapshot: null,
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    ]);

    const result = await listRequestLogs(1, 1, { id: "log-focus" });

    expect(eq).toHaveBeenCalledWith("id", "log-focus");
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe("log-focus");
  });

  it("listRequestLogs returns an empty result set when filters.id does not match", async () => {
    const { listRequestLogs } = await import("@/lib/services/request-logger");

    const whereMock = vi.fn().mockResolvedValueOnce([{ value: 0 }]);
    dbSelectMock.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({ where: whereMock }),
    });
    requestLogsFindManyMock.mockResolvedValueOnce([]);

    const result = await listRequestLogs(1, 1, { id: "missing" });

    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
  });

  it.each([
    ["2xx", 200, 300],
    ["4xx", 400, 500],
    ["5xx", 500, 600],
  ] as const)(
    "listRequestLogs maps statusClass %s to the [%i, %i) range on statusCode",
    async (statusClass, min, max) => {
      const { listRequestLogs } = await import("@/lib/services/request-logger");
      const { gte, lt } = await import("drizzle-orm");
      vi.mocked(gte).mockClear();
      vi.mocked(lt).mockClear();

      const whereMock = vi.fn().mockResolvedValueOnce([{ value: 0 }]);
      dbSelectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({ where: whereMock }),
      });
      requestLogsFindManyMock.mockResolvedValueOnce([]);

      await listRequestLogs(1, 20, { statusClass });

      expect(gte).toHaveBeenCalledWith("status_code", min);
      expect(lt).toHaveBeenCalledWith("status_code", max);
    }
  );

  it("listRequestLogs ignores statusClass when an exact statusCode is set", async () => {
    const { listRequestLogs } = await import("@/lib/services/request-logger");
    const { eq, gte, lt } = await import("drizzle-orm");

    const whereMock = vi.fn().mockResolvedValueOnce([{ value: 0 }]);
    dbSelectMock.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({ where: whereMock }),
    });
    requestLogsFindManyMock.mockResolvedValueOnce([]);

    await listRequestLogs(1, 20, { statusCode: 404, statusClass: "5xx" });

    expect(eq).toHaveBeenCalledWith("status_code", 404);
    expect(gte).not.toHaveBeenCalled();
    expect(lt).not.toHaveBeenCalled();
  });

  it("listRequestLogs matches model case-insensitively via lower(...) like", async () => {
    const { listRequestLogs } = await import("@/lib/services/request-logger");
    const { sql } = await import("drizzle-orm");

    const whereMock = vi.fn().mockResolvedValueOnce([{ value: 0 }]);
    dbSelectMock.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({ where: whereMock }),
    });
    requestLogsFindManyMock.mockResolvedValueOnce([]);

    await listRequestLogs(1, 20, { model: "  GPT-4  " });

    const sqlMock = vi.mocked(sql);
    expect(sqlMock).toHaveBeenCalledTimes(1);
    // Trimmed + lowercased needle wrapped in like wildcards.
    expect(sqlMock.mock.calls[0].slice(1)).toEqual(["model", "%gpt-4%"]);
  });

  it("reconcileStaleInProgressRequestLogs skips streams and persists billing snapshots", async () => {
    const { reconcileStaleInProgressRequestLogs } = await import("@/lib/services/request-logger");

    const now = new Date("2026-03-07T12:00:00.000Z");
    requestLogsFindManyMock.mockResolvedValueOnce([
      {
        id: "log-stale",
        createdAt: new Date("2026-03-07T11:40:00.000Z"),
        isStream: false,
      },
      {
        id: "log-active-stream",
        createdAt: new Date("2026-03-07T11:40:00.000Z"),
        isStream: true,
      },
      {
        id: "log-fresh",
        createdAt: new Date("2026-03-07T11:58:00.000Z"),
        isStream: false,
      },
    ]);

    const returningMock = vi.fn().mockResolvedValueOnce([
      {
        id: "log-stale",
        statusCode: 520,
        apiKeyId: "key-1",
        upstreamId: "upstream-1",
        model: "gpt-4.1",
      },
    ]);
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    dbUpdateMock.mockReturnValue({ set: setMock });
    calculateAndPersistRequestBillingSnapshotMock.mockResolvedValueOnce({
      status: "unbilled",
      unbillableReason: "usage_missing",
      finalCost: null,
      source: null,
    });

    const reconciled = await reconcileStaleInProgressRequestLogs({ now });

    expect(reconciled).toBe(1);
    expect(requestLogsFindManyMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 520,
        errorMessage: expect.stringContaining("stale reconciliation timeout window"),
      })
    );
    expect(whereMock).toHaveBeenCalledTimes(1);
    expect(calculateAndPersistRequestBillingSnapshotMock).toHaveBeenCalledTimes(1);
    expect(calculateAndPersistRequestBillingSnapshotMock).toHaveBeenCalledWith({
      requestLogId: "log-stale",
      apiKeyId: "key-1",
      upstreamId: "upstream-1",
      model: "gpt-4.1",
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    });
  });

  it("reconcileStaleInProgressRequestLogs clamps overflow durationMs before updating", async () => {
    const { reconcileStaleInProgressRequestLogs } = await import("@/lib/services/request-logger");

    const int4Max = 2_147_483_647;
    const now = new Date("2026-03-07T12:00:00.000Z");
    requestLogsFindManyMock.mockResolvedValueOnce([
      {
        id: "log-overflow",
        createdAt: new Date(now.getTime() - int4Max - 1_000),
        isStream: false,
      },
    ]);

    const returningMock = vi.fn().mockResolvedValueOnce([
      {
        id: "log-overflow",
        statusCode: 520,
        apiKeyId: null,
        upstreamId: null,
        model: null,
      },
    ]);
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    const setMock = vi.fn().mockImplementation((values) => {
      if (typeof values.durationMs === "number" && values.durationMs > int4Max) {
        throw new RangeError("integer out of range");
      }
      return { where: whereMock };
    });
    dbUpdateMock.mockReturnValue({ set: setMock });
    calculateAndPersistRequestBillingSnapshotMock.mockResolvedValueOnce({
      status: "unbilled",
      unbillableReason: "usage_missing",
      finalCost: null,
      source: null,
    });

    await expect(reconcileStaleInProgressRequestLogs({ now })).resolves.toBe(1);
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        durationMs: int4Max,
      })
    );
  });
});
