import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Route-layer tests for the user-side personal data endpoints. The aggregation
// logic runs against a real database in tests/unit/services/
// user-data-service.test.ts; here the service is mocked so these tests focus on
// the route concerns: the requireUser guard (401 unauthenticated, 403 for the
// ADMIN_TOKEN super-admin who has no personal data scope), the forced owner
// scope taken from the authenticated principal (an external user_id parameter
// must be ignored), filter parsing, and the response shape.

vi.mock("@/lib/utils/api-auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/utils/api-auth")>();
  return {
    ...actual,
    requireUser: vi.fn(async (request: Request) => {
      const authHeader = request.headers.get("authorization");
      if (authHeader === "Bearer member-token") {
        return { kind: "user", userId: SELF_ID, role: "member", username: "alice" };
      }
      if (authHeader === "Bearer valid-admin-token") {
        return { kind: "admin_token" };
      }
      return actual.errorResponse("Unauthorized", 401);
    }),
  };
});

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("@/lib/services/user-data-service", () => ({
  getUserOverview: vi.fn(),
  listUserRequestLogs: vi.fn(),
  getUserUsageStats: vi.fn(),
  listUserUpstreamOptions: vi.fn(),
}));

import * as userDataService from "@/lib/services/user-data-service";
import { GET as overviewRoute } from "@/app/api/user/overview/route";
import { GET as logsRoute } from "@/app/api/user/logs/route";
import { GET as usageRoute } from "@/app/api/user/usage/route";
import { GET as upstreamsRoute } from "@/app/api/user/upstreams/route";

const SELF_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER = "Bearer member-token";
const ADMIN_TOKEN = "Bearer valid-admin-token";

function makeRequest(url: string, authHeader: string | null): NextRequest {
  const headers = new Headers();
  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  return new NextRequest(url, { headers });
}

function makeOverview() {
  return {
    todayRequests: 3,
    monthRequests: 10,
    monthCostUsd: 1.25,
    totalRequests: 42,
    totalCostUsd: 9.5,
    activeKeyCount: 2,
    totalKeyCount: 3,
  };
}

function makeEmptyLogsPage() {
  return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
}

function makeUsage() {
  return {
    range: "7d" as const,
    granularity: "day" as const,
    points: [
      {
        timestamp: new Date("2026-06-10T00:00:00.000Z"),
        requestCount: 2,
        totalTokens: 100,
        totalCostUsd: 0.5,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("user routes — guard", () => {
  it.each([
    ["overview", () => overviewRoute(makeRequest("http://localhost/api/user/overview", null))],
    ["logs", () => logsRoute(makeRequest("http://localhost/api/user/logs", null))],
    ["usage", () => usageRoute(makeRequest("http://localhost/api/user/usage", null))],
    ["upstreams", () => upstreamsRoute(makeRequest("http://localhost/api/user/upstreams", null))],
  ])("rejects an unauthenticated request to %s with 401", async (_name, invoke) => {
    const res = await invoke();
    expect(res.status).toBe(401);
  });

  it.each([
    [
      "overview",
      () => overviewRoute(makeRequest("http://localhost/api/user/overview", ADMIN_TOKEN)),
    ],
    ["logs", () => logsRoute(makeRequest("http://localhost/api/user/logs", ADMIN_TOKEN))],
    ["usage", () => usageRoute(makeRequest("http://localhost/api/user/usage", ADMIN_TOKEN))],
    [
      "upstreams",
      () => upstreamsRoute(makeRequest("http://localhost/api/user/upstreams", ADMIN_TOKEN)),
    ],
  ])("rejects the ADMIN_TOKEN identity on %s with 403", async (_name, invoke) => {
    const res = await invoke();
    expect(res.status).toBe(403);
    expect(userDataService.getUserOverview).not.toHaveBeenCalled();
    expect(userDataService.listUserRequestLogs).not.toHaveBeenCalled();
    expect(userDataService.getUserUsageStats).not.toHaveBeenCalled();
    expect(userDataService.listUserUpstreamOptions).not.toHaveBeenCalled();
  });
});

describe("GET /api/user/upstreams", () => {
  it("returns the caller's granted upstream options", async () => {
    vi.mocked(userDataService.listUserUpstreamOptions).mockResolvedValue([
      { id: "33333333-3333-4333-8333-333333333333", name: "alpha" },
    ]);

    const res = await upstreamsRoute(makeRequest("http://localhost/api/user/upstreams", MEMBER));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      items: [{ id: "33333333-3333-4333-8333-333333333333", name: "alpha" }],
    });
    expect(userDataService.listUserUpstreamOptions).toHaveBeenCalledWith(SELF_ID);
  });
});

describe("GET /api/user/overview", () => {
  it("returns the caller's overview in snake_case", async () => {
    vi.mocked(userDataService.getUserOverview).mockResolvedValue(makeOverview());

    const res = await overviewRoute(makeRequest("http://localhost/api/user/overview", MEMBER));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      today_requests: 3,
      month_requests: 10,
      month_cost_usd: 1.25,
      total_requests: 42,
      total_cost_usd: 9.5,
      active_key_count: 2,
      total_key_count: 3,
    });
    expect(userDataService.getUserOverview).toHaveBeenCalledWith(SELF_ID);
  });
});

describe("GET /api/user/logs", () => {
  it("scopes the query to the authenticated user", async () => {
    vi.mocked(userDataService.listUserRequestLogs).mockResolvedValue(makeEmptyLogsPage());

    const res = await logsRoute(makeRequest("http://localhost/api/user/logs", MEMBER));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(0);
    expect(userDataService.listUserRequestLogs).toHaveBeenCalledWith(SELF_ID, 1, 20, {});
  });

  it("ignores an externally supplied user_id parameter", async () => {
    vi.mocked(userDataService.listUserRequestLogs).mockResolvedValue(makeEmptyLogsPage());

    const res = await logsRoute(
      makeRequest(`http://localhost/api/user/logs?user_id=${OTHER_ID}`, MEMBER)
    );
    expect(res.status).toBe(200);
    // The owner scope still comes from the principal, never from the query.
    expect(userDataService.listUserRequestLogs).toHaveBeenCalledWith(SELF_ID, 1, 20, {});
  });

  it("parses pagination and the supported filters", async () => {
    vi.mocked(userDataService.listUserRequestLogs).mockResolvedValue(makeEmptyLogsPage());

    const res = await logsRoute(
      makeRequest(
        "http://localhost/api/user/logs?page=2&page_size=50&api_key_id=key-1&status_code=429" +
          "&start_time=2026-06-01T00:00:00.000Z&end_time=2026-06-10T00:00:00.000Z",
        MEMBER
      )
    );
    expect(res.status).toBe(200);
    expect(userDataService.listUserRequestLogs).toHaveBeenCalledWith(SELF_ID, 2, 50, {
      apiKeyId: "key-1",
      statusCode: 429,
      startTime: new Date("2026-06-01T00:00:00.000Z"),
      endTime: new Date("2026-06-10T00:00:00.000Z"),
    });
  });
});

describe("GET /api/user/usage", () => {
  it("defaults to the 7d range and returns ISO timestamps", async () => {
    vi.mocked(userDataService.getUserUsageStats).mockResolvedValue(makeUsage());

    const res = await usageRoute(makeRequest("http://localhost/api/user/usage", MEMBER));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      range: "7d",
      granularity: "day",
      points: [
        {
          timestamp: "2026-06-10T00:00:00.000Z",
          request_count: 2,
          total_tokens: 100,
          total_cost_usd: 0.5,
        },
      ],
    });
    expect(userDataService.getUserUsageStats).toHaveBeenCalledWith(SELF_ID, "7d");
  });

  it("accepts the 30d range", async () => {
    vi.mocked(userDataService.getUserUsageStats).mockResolvedValue({
      ...makeUsage(),
      range: "30d" as const,
    });

    const res = await usageRoute(makeRequest("http://localhost/api/user/usage?range=30d", MEMBER));
    expect(res.status).toBe(200);
    expect(userDataService.getUserUsageStats).toHaveBeenCalledWith(SELF_ID, "30d");
  });

  it("falls back to 7d on an unknown range value", async () => {
    vi.mocked(userDataService.getUserUsageStats).mockResolvedValue(makeUsage());

    const res = await usageRoute(
      makeRequest("http://localhost/api/user/usage?range=all-time", MEMBER)
    );
    expect(res.status).toBe(200);
    expect(userDataService.getUserUsageStats).toHaveBeenCalledWith(SELF_ID, "7d");
  });
});
