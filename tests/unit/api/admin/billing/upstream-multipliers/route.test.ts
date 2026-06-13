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

const listUpstreamBillingMultipliersMock = vi.fn();
vi.mock("@/lib/services/billing-management-service", () => ({
  listUpstreamBillingMultipliers: (...args: unknown[]) =>
    listUpstreamBillingMultipliersMock(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const AUTH_HEADER = "Bearer valid-token";

describe("GET /api/admin/billing/upstream-multipliers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 without valid auth", async () => {
    const { GET } = await import("@/app/api/admin/billing/upstream-multipliers/route");
    const req = new NextRequest("http://localhost/api/admin/billing/upstream-multipliers");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("should list upstream multipliers", async () => {
    const { GET } = await import("@/app/api/admin/billing/upstream-multipliers/route");

    listUpstreamBillingMultipliersMock.mockResolvedValueOnce([
      {
        id: "upstream-1",
        name: "OpenAI",
        isActive: true,
        inputMultiplier: 1,
        outputMultiplier: 1.2,
      },
    ]);

    const req = new NextRequest("http://localhost/api/admin/billing/upstream-multipliers", {
      headers: { authorization: AUTH_HEADER },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      total: number;
      items: Array<{ output_multiplier: number }>;
    };
    expect(body.total).toBe(1);
    expect(body.items[0].output_multiplier).toBe(1.2);
  });
});
