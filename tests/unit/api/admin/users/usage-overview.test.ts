import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Route-layer tests for the admin-side single-user usage endpoints. The
// aggregation logic runs against a real database in tests/unit/services/
// user-data-service.test.ts; here the service is mocked so these tests focus on
// the route concerns: the requireAdmin guard (401 unauthenticated, 403 for a
// member, pass for an admin-capable principal), the target user-existence check
// (404 when the user does not exist), the userId taken from the route, range
// parsing, and the response shape.

vi.mock("@/lib/utils/api-auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/utils/api-auth")>();
  return {
    ...actual,
    requireAdmin: vi.fn(async (request: Request) => {
      const authHeader = request.headers.get("authorization");
      if (authHeader === "Bearer valid-admin-token") {
        return { kind: "admin_token" };
      }
      if (authHeader === "Bearer member-token") {
        return actual.errorResponse("Forbidden", 403);
      }
      return actual.errorResponse("Unauthorized", 401);
    }),
  };
});

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("@/lib/services/user-service", () => ({
  getUserById: vi.fn(),
}));

vi.mock("@/lib/services/user-data-service", () => ({
  getUserOverview: vi.fn(),
  getUserUsageStats: vi.fn(),
}));

import * as userService from "@/lib/services/user-service";
import * as userDataService from "@/lib/services/user-data-service";
import { GET as overviewRoute } from "@/app/api/admin/users/[id]/overview/route";
import { GET as usageRoute } from "@/app/api/admin/users/[id]/usage/route";

const TARGET_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER = "Bearer member-token";
const ADMIN = "Bearer valid-admin-token";

function makeRequest(url: string, authHeader: string | null): NextRequest {
  const headers = new Headers();
  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  return new NextRequest(url, { headers });
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
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

function makeUser() {
  return {
    id: TARGET_ID,
    username: "alice",
    displayName: "Alice",
    role: "member" as const,
    isActive: true,
    apiKeyCount: 3,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin user usage routes — guard", () => {
  it.each([
    [
      "overview",
      () =>
        overviewRoute(
          makeRequest(`http://localhost/api/admin/users/${TARGET_ID}/overview`, null),
          makeContext(TARGET_ID)
        ),
    ],
    [
      "usage",
      () =>
        usageRoute(
          makeRequest(`http://localhost/api/admin/users/${TARGET_ID}/usage`, null),
          makeContext(TARGET_ID)
        ),
    ],
  ])("rejects an unauthenticated request to %s with 401", async (_name, invoke) => {
    const res = await invoke();
    expect(res.status).toBe(401);
    expect(userService.getUserById).not.toHaveBeenCalled();
  });

  it.each([
    [
      "overview",
      () =>
        overviewRoute(
          makeRequest(`http://localhost/api/admin/users/${TARGET_ID}/overview`, MEMBER),
          makeContext(TARGET_ID)
        ),
    ],
    [
      "usage",
      () =>
        usageRoute(
          makeRequest(`http://localhost/api/admin/users/${TARGET_ID}/usage`, MEMBER),
          makeContext(TARGET_ID)
        ),
    ],
  ])("rejects a member on %s with 403", async (_name, invoke) => {
    const res = await invoke();
    expect(res.status).toBe(403);
    expect(userService.getUserById).not.toHaveBeenCalled();
    expect(userDataService.getUserOverview).not.toHaveBeenCalled();
    expect(userDataService.getUserUsageStats).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/users/[id]/overview", () => {
  it("returns the target user's overview in snake_case", async () => {
    vi.mocked(userService.getUserById).mockResolvedValue(makeUser());
    vi.mocked(userDataService.getUserOverview).mockResolvedValue(makeOverview());

    const res = await overviewRoute(
      makeRequest(`http://localhost/api/admin/users/${TARGET_ID}/overview`, ADMIN),
      makeContext(TARGET_ID)
    );
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
    expect(userDataService.getUserOverview).toHaveBeenCalledWith(TARGET_ID);
  });

  it("returns 404 when the target user does not exist", async () => {
    vi.mocked(userService.getUserById).mockResolvedValue(null);

    const res = await overviewRoute(
      makeRequest(`http://localhost/api/admin/users/${TARGET_ID}/overview`, ADMIN),
      makeContext(TARGET_ID)
    );
    expect(res.status).toBe(404);
    expect(userDataService.getUserOverview).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/users/[id]/usage", () => {
  it("defaults to the 7d range and returns ISO timestamps", async () => {
    vi.mocked(userService.getUserById).mockResolvedValue(makeUser());
    vi.mocked(userDataService.getUserUsageStats).mockResolvedValue(makeUsage());

    const res = await usageRoute(
      makeRequest(`http://localhost/api/admin/users/${TARGET_ID}/usage`, ADMIN),
      makeContext(TARGET_ID)
    );
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
    expect(userDataService.getUserUsageStats).toHaveBeenCalledWith(TARGET_ID, "7d");
  });

  it("accepts the 30d range", async () => {
    vi.mocked(userService.getUserById).mockResolvedValue(makeUser());
    vi.mocked(userDataService.getUserUsageStats).mockResolvedValue({
      ...makeUsage(),
      range: "30d" as const,
    });

    const res = await usageRoute(
      makeRequest(`http://localhost/api/admin/users/${TARGET_ID}/usage?range=30d`, ADMIN),
      makeContext(TARGET_ID)
    );
    expect(res.status).toBe(200);
    expect(userDataService.getUserUsageStats).toHaveBeenCalledWith(TARGET_ID, "30d");
  });

  it("falls back to 7d on an unknown range value", async () => {
    vi.mocked(userService.getUserById).mockResolvedValue(makeUser());
    vi.mocked(userDataService.getUserUsageStats).mockResolvedValue(makeUsage());

    const res = await usageRoute(
      makeRequest(`http://localhost/api/admin/users/${TARGET_ID}/usage?range=all-time`, ADMIN),
      makeContext(TARGET_ID)
    );
    expect(res.status).toBe(200);
    expect(userDataService.getUserUsageStats).toHaveBeenCalledWith(TARGET_ID, "7d");
  });

  it("returns 404 when the target user does not exist", async () => {
    vi.mocked(userService.getUserById).mockResolvedValue(null);

    const res = await usageRoute(
      makeRequest(`http://localhost/api/admin/users/${TARGET_ID}/usage`, ADMIN),
      makeContext(TARGET_ID)
    );
    expect(res.status).toBe(404);
    expect(userDataService.getUserUsageStats).not.toHaveBeenCalled();
  });
});
