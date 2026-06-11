import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock admin authorization: the route now calls requireAdmin (the role-aware
// guard) instead of validateAdminAuth. importActual keeps errorResponse and
// getPaginationParams real so response shapes are unchanged; only the gate
// decision is driven by the request token.
vi.mock("@/lib/utils/api-auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/utils/api-auth")>();
  return {
    ...actual,
    requireAdmin: vi.fn(async (request: Request) => {
      const authHeader = request.headers.get("authorization");
      if (authHeader === "Bearer valid-token") {
        return { kind: "admin_token" };
      }
      return actual.errorResponse("Unauthorized", 401);
    }),
  };
});

const getBillingOverviewStatsMock = vi.fn();
vi.mock("@/lib/services/billing-management-service", () => ({
  getBillingOverviewStats: (...args: unknown[]) => getBillingOverviewStatsMock(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const AUTH_HEADER = "Bearer valid-token";

describe("GET /api/admin/billing/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 without valid auth", async () => {
    const { GET } = await import("@/app/api/admin/billing/overview/route");
    const req = new NextRequest("http://localhost/api/admin/billing/overview");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("should return billing overview", async () => {
    const { GET } = await import("@/app/api/admin/billing/overview/route");

    getBillingOverviewStatsMock.mockResolvedValueOnce({
      todayCostUsd: 1.25,
      monthCostUsd: 12.5,
      unresolvedModelCount: 2,
      latestSync: {
        status: "success",
        source: "litellm",
        successCount: 10,
        failureCount: 0,
        failureReason: null,
        syncedAt: new Date("2026-02-28T00:00:00.000Z"),
      },
    });

    const req = new NextRequest("http://localhost/api/admin/billing/overview", {
      headers: { authorization: AUTH_HEADER },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      today_cost_usd: number;
      latest_sync: { synced_at: string };
    };
    expect(body.today_cost_usd).toBe(1.25);
    expect(body.latest_sync.synced_at).toBe("2026-02-28T00:00:00.000Z");
  });
});
