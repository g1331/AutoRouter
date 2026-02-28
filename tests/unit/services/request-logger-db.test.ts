import { describe, it, expect, vi, beforeEach } from "vitest";

const dbInsertMock = vi.fn();
const dbUpdateMock = vi.fn();
const dbSelectMock = vi.fn();
const requestLogsFindManyMock = vi.fn();

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
    createdAt: "created_at",
  },
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    and: vi.fn((...args) => ({ __op: "and", args })),
    count: vi.fn(() => ({ __op: "count" })),
    desc: vi.fn((arg) => ({ __op: "desc", arg })),
    eq: vi.fn((a, b) => ({ __op: "eq", a, b })),
    gte: vi.fn((a, b) => ({ __op: "gte", a, b })),
    lte: vi.fn((a, b) => ({ __op: "lte", a, b })),
  };
});

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
      upstreamId: "upstream-1",
      method: "POST",
      path: "/v1/chat/completions",
      model: "gpt-4.1",
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      cachedTokens: 1,
      reasoningTokens: 2,
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
        upstreamId: "upstream-1",
        method: "POST",
        path: "/v1/chat/completions",
        model: "gpt-4.1",
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        cachedTokens: 1,
        reasoningTokens: 2,
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
        sessionId: "sid",
        affinityHit: true,
        affinityMigrated: false,
        ttftMs: 99,
        isStream: true,
        sessionIdCompensated: true,
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
        cachedTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        routingDurationMs: null,
        errorMessage: null,
        routingType: null,
        priorityTier: null,
        failoverAttempts: 0,
        failoverHistory: null,
        routingDecision: null,
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
    expect(result.items[0].failoverHistory).toEqual([{ upstream_id: "u2" }]);
    expect(result.items[0].routingDecision).toEqual({ chosen_upstream_id: "u1" });
    expect(result.items[0].billingStatus).toBeNull();
    expect(result.items[0].priceSource).toBeNull();
    expect(result.items[1].failoverHistory).toBeNull();
    expect(result.items[1].routingDecision).toBeNull();
  });
});
