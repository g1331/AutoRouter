import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader) => authHeader === "Bearer valid-token"),
}));

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
