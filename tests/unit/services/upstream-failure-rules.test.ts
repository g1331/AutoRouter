import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatFailureRule,
  InvalidFailureRuleError,
  matchFailureRule,
  parseFailureRuleMatch,
  createFailureRule,
  deleteFailureRule,
  listFailureRules,
  updateFailureRule,
} from "@/lib/services/upstream-failure-rules";

const {
  mockFindFirst,
  mockFindMany,
  mockInsert,
  mockUpdate,
  mockDelete,
  mockInsertValues,
  mockInsertReturning,
  mockUpdateSet,
  mockUpdateWhere,
  mockUpdateReturning,
  mockDeleteWhere,
} = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockFindMany: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockInsertValues: vi.fn(),
  mockInsertReturning: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockUpdateReturning: vi.fn(),
  mockDeleteWhere: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  asc: vi.fn((field: unknown) => ({ op: "asc", field })),
  eq: vi.fn((field: unknown, value: unknown) => ({ op: "eq", field, value })),
  isNull: vi.fn((field: unknown) => ({ op: "isNull", field })),
  or: vi.fn((...conditions: unknown[]) => ({ op: "or", conditions })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      upstreams: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
      upstreamFailureRules: {
        findMany: (...args: unknown[]) => mockFindMany(...args),
      },
    },
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
  upstreams: {
    id: "upstreams.id",
  },
  upstreamFailureRules: {
    upstreamId: "upstream_failure_rules.upstream_id",
    priority: "upstream_failure_rules.priority",
    createdAt: "upstream_failure_rules.created_at",
  },
}));

function makeRule(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-05-16T08:00:00.000Z");

  return {
    id: "rule-1",
    upstreamId: null,
    name: "Ignore rate limit",
    enabled: true,
    priority: 0,
    match: {
      statusCodes: [429],
      errorTypes: ["http_429"],
      bodyPattern: "rate",
      headerName: "x-error-code",
      headerPattern: "rate_limited",
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("upstream-failure-rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockReturnValue({
      values: mockInsertValues.mockReturnValue({
        returning: mockInsertReturning,
      }),
    });
    mockUpdate.mockReturnValue({
      set: mockUpdateSet.mockReturnValue({
        where: mockUpdateWhere.mockReturnValue({
          returning: mockUpdateReturning,
        }),
      }),
    });
    mockDelete.mockReturnValue({
      where: mockDeleteWhere,
    });
  });

  it("matches enabled global failure rules against status, error, body, and headers", async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: "upstream-1",
      failureRuleConfig: { useGlobalRules: true },
    });
    mockFindMany.mockResolvedValueOnce([
      makeRule({ id: "disabled-rule", enabled: false }),
      makeRule({ id: "global-rule", upstreamId: null }),
    ]);

    const result = await matchFailureRule({
      upstreamId: "upstream-1",
      statusCode: 429,
      errorType: "http_429",
      responseBodyText: '{"error":{"message":"rate limited"}}',
      responseHeaders: new Headers({ "x-error-code": "rate_limited" }),
    });

    expect(result).toEqual({
      id: "global-rule",
      name: "Ignore rate limit",
      scope: "global",
    });
  });

  it("matches local rules when an upstream disables global rules", async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: "upstream-1",
      failureRuleConfig: { useGlobalRules: false },
    });
    mockFindMany.mockResolvedValueOnce([
      makeRule({
        id: "local-rule",
        upstreamId: "upstream-1",
        name: "Local business error",
        match: {
          statusCodes: [400],
          errorTypes: null,
          bodyPattern: "insufficient_quota",
          headerName: null,
          headerPattern: null,
        },
      }),
    ]);

    const result = await matchFailureRule({
      upstreamId: "upstream-1",
      statusCode: 400,
      responseBodyText: '{"code":"insufficient_quota"}',
    });

    expect(result).toEqual({
      id: "local-rule",
      name: "Local business error",
      scope: "upstream",
    });
  });

  it("returns null when no rule matches the failure evidence", async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: "upstream-1",
      failureRuleConfig: { useGlobalRules: true },
    });
    mockFindMany.mockResolvedValueOnce([makeRule()]);

    const result = await matchFailureRule({
      upstreamId: "upstream-1",
      statusCode: 500,
      errorType: "http_500",
      responseBodyText: '{"error":"server error"}',
      responseHeaders: { "x-error-code": "server_error" },
    });

    expect(result).toBeNull();
  });

  it("returns null when the upstream does not exist", async () => {
    mockFindFirst.mockResolvedValueOnce(null);

    const result = await matchFailureRule({
      upstreamId: "missing-upstream",
      statusCode: 429,
      errorType: "http_429",
    });

    expect(result).toBeNull();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("falls back to error message and case-insensitive record headers", async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: "upstream-1",
      failureRuleConfig: { useGlobalRules: true },
    });
    mockFindMany.mockResolvedValueOnce([
      makeRule({
        id: "message-rule",
        upstreamId: null,
        match: {
          statusCodes: null,
          errorTypes: null,
          bodyPattern: "quota",
          headerName: "x-error-code",
          headerPattern: "rate_limited",
        },
      }),
    ]);

    const result = await matchFailureRule({
      upstreamId: "upstream-1",
      errorMessage: "quota exceeded",
      responseHeaders: { "X-Error-Code": "rate_limited" },
    });

    expect(result).toEqual({
      id: "message-rule",
      name: "Ignore rate limit",
      scope: "global",
    });
  });

  it("skips invalid regex rules during matching", async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: "upstream-1",
      failureRuleConfig: { useGlobalRules: true },
    });
    mockFindMany.mockResolvedValueOnce([
      makeRule({
        id: "invalid-regex",
        match: {
          statusCodes: null,
          errorTypes: null,
          bodyPattern: "[",
          headerName: null,
          headerPattern: null,
        },
      }),
      makeRule({
        id: "valid-rule",
        match: {
          statusCodes: null,
          errorTypes: null,
          bodyPattern: "quota",
          headerName: null,
          headerPattern: null,
        },
      }),
    ]);

    const result = await matchFailureRule({
      upstreamId: "upstream-1",
      responseBodyText: "quota exceeded",
    });

    expect(result?.id).toBe("valid-rule");
  });

  it("lists all, global, and upstream scoped rules", async () => {
    mockFindMany.mockResolvedValue([]);

    await listFailureRules();
    await listFailureRules(null);
    await listFailureRules("upstream-1");

    expect(mockFindMany).toHaveBeenCalledTimes(3);
    expect(mockFindMany.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        where: undefined,
      })
    );
    expect(mockFindMany.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({ op: "isNull" }),
      })
    );
    expect(mockFindMany.mock.calls[2][0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({ op: "eq", value: "upstream-1" }),
      })
    );
  });

  it("formats and parses public rule match fields", () => {
    const formatted = formatFailureRule(makeRule());

    expect(formatted.match).toEqual({
      status_codes: [429],
      error_types: ["http_429"],
      body_pattern: "rate",
      header_name: "x-error-code",
      header_pattern: "rate_limited",
    });
    expect(parseFailureRuleMatch(formatted.match)).toEqual({
      statusCodes: [429],
      errorTypes: ["http_429"],
      bodyPattern: "rate",
      headerName: "x-error-code",
      headerPattern: "rate_limited",
    });
  });

  it("creates rules with normalized match values", async () => {
    const created = makeRule({
      id: "created-rule",
      upstreamId: null,
      enabled: true,
      priority: 7,
    });
    mockInsertReturning.mockResolvedValueOnce([created]);

    const result = await createFailureRule({
      name: "Created",
      enabled: undefined,
      priority: 7,
      match: {
        statusCodes: [429, 429],
        errorTypes: ["http_429", "http_429"],
        bodyPattern: " quota ",
        headerName: " x-error-code ",
        headerPattern: " rate_limited ",
      },
    });

    expect(result).toBe(created);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        upstreamId: null,
        name: "Created",
        enabled: true,
        priority: 7,
        match: {
          statusCodes: [429],
          errorTypes: ["http_429"],
          bodyPattern: "quota",
          headerName: "x-error-code",
          headerPattern: "rate_limited",
        },
      })
    );
  });

  it("rejects local rule creation for missing upstreams", async () => {
    mockFindFirst.mockResolvedValueOnce(null);

    await expect(
      createFailureRule({
        upstreamId: "missing-upstream",
        name: "Missing upstream",
        match: { statusCodes: [429] },
      })
    ).rejects.toThrow("Upstream not found: missing-upstream");
  });

  it("rejects invalid body and header regex patterns", async () => {
    await expect(
      createFailureRule({
        name: "Invalid body",
        match: { bodyPattern: "[" },
      })
    ).rejects.toThrow("body_pattern must be a valid regular expression");

    await expect(
      createFailureRule({
        name: "Invalid header",
        match: { headerName: "x-error-code", headerPattern: "[" },
      })
    ).rejects.toThrow("header_pattern must be a valid regular expression");
  });

  it("updates rules and returns null when no row is updated", async () => {
    const updated = makeRule({ id: "updated-rule", name: "Updated" });
    mockUpdateReturning.mockResolvedValueOnce([updated]).mockResolvedValueOnce([]);

    await expect(
      updateFailureRule("rule-1", {
        name: "Updated",
        enabled: false,
        priority: 9,
        match: { errorTypes: ["timeout"] },
      })
    ).resolves.toBe(updated);

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Updated",
        enabled: false,
        priority: 9,
        match: {
          statusCodes: null,
          errorTypes: ["timeout"],
          bodyPattern: null,
          headerName: null,
          headerPattern: null,
        },
      })
    );

    await expect(updateFailureRule("missing-rule", {})).resolves.toBeNull();
  });

  it("deletes rules and reports whether rows were returned", async () => {
    mockDeleteWhere.mockResolvedValueOnce([{ id: "rule-1" }]).mockResolvedValueOnce([]);

    await expect(deleteFailureRule("rule-1")).resolves.toBe(true);
    await expect(deleteFailureRule("rule-2")).resolves.toBe(false);
  });

  it("rejects rules without any match condition", async () => {
    await expect(
      createFailureRule({
        name: "Empty rule",
        match: {},
      })
    ).rejects.toBeInstanceOf(InvalidFailureRuleError);
  });

  it("rejects rules containing unknown FailoverErrorType values", async () => {
    await expect(
      createFailureRule({
        name: "Unknown error type",
        match: { errorTypes: ["http_500", "timeout"] },
      })
    ).rejects.toThrow(/Unknown error types: http_500/);

    await expect(
      updateFailureRule("rule-1", {
        match: { errorTypes: ["definitely_not_a_real_type"] },
      })
    ).rejects.toBeInstanceOf(InvalidFailureRuleError);
  });

  it("tolerates legacy rules with unknown errorTypes when matching evidence", async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: "upstream-1",
      failureRuleConfig: { useGlobalRules: true },
    });
    mockFindMany.mockResolvedValueOnce([
      makeRule({
        id: "legacy-rule",
        match: {
          statusCodes: null,
          errorTypes: ["http_500", "timeout"],
          bodyPattern: null,
          headerName: null,
          headerPattern: null,
        },
      }),
    ]);

    const result = await matchFailureRule({
      upstreamId: "upstream-1",
      errorType: "timeout",
    });

    expect(result?.id).toBe("legacy-rule");
  });
});
