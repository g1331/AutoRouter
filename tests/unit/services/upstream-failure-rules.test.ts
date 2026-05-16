import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatFailureRule,
  InvalidFailureRuleError,
  matchFailureRule,
  parseFailureRuleMatch,
  createFailureRule,
} from "@/lib/services/upstream-failure-rules";

const { mockFindFirst, mockFindMany } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockFindMany: vi.fn(),
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
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(),
      })),
    })),
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

  it("rejects rules without any match condition", async () => {
    await expect(
      createFailureRule({
        name: "Empty rule",
        match: {},
      })
    ).rejects.toBeInstanceOf(InvalidFailureRuleError);
  });
});
