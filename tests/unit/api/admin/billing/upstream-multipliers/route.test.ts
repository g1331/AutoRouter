import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader) => authHeader === "Bearer valid-token"),
}));

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
