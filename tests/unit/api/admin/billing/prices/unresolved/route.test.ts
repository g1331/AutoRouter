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

const listBillingUnresolvedModelsMock = vi.fn();
vi.mock("@/lib/services/billing-price-service", () => ({
  listBillingUnresolvedModels: (...args: unknown[]) => listBillingUnresolvedModelsMock(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const AUTH_HEADER = "Bearer valid-token";

describe("GET /api/admin/billing/prices/unresolved", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 without valid auth", async () => {
    const { GET } = await import("@/app/api/admin/billing/prices/unresolved/route");
    const req = new NextRequest("http://localhost/api/admin/billing/prices/unresolved");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("should list unresolved models", async () => {
    const { GET } = await import("@/app/api/admin/billing/prices/unresolved/route");

    listBillingUnresolvedModelsMock.mockResolvedValueOnce([
      {
        model: "sample_spec",
        occurrences: 3,
        lastSeenAt: new Date("2026-02-28T00:00:00.000Z"),
        lastUpstreamId: "upstream-1",
        lastUpstreamName: "OpenAI",
        hasManualOverride: false,
      },
    ]);

    const req = new NextRequest("http://localhost/api/admin/billing/prices/unresolved", {
      headers: { authorization: AUTH_HEADER },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      items: Array<{ model: string; occurrences: number; last_seen_at: string }>;
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({
      model: "sample_spec",
      occurrences: 3,
      last_seen_at: "2026-02-28T00:00:00.000Z",
    });
  });

  it("should return 500 when listing throws", async () => {
    const { GET } = await import("@/app/api/admin/billing/prices/unresolved/route");

    listBillingUnresolvedModelsMock.mockRejectedValueOnce(new Error("boom"));
    const req = new NextRequest("http://localhost/api/admin/billing/prices/unresolved", {
      headers: { authorization: AUTH_HEADER },
    });
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});
