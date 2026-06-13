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

const updateUpstreamBillingMultipliersMock = vi.fn();
vi.mock("@/lib/services/billing-management-service", () => ({
  updateUpstreamBillingMultipliers: (...args: unknown[]) =>
    updateUpstreamBillingMultipliersMock(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const AUTH_HEADER = "Bearer valid-token";

describe("PUT /api/admin/billing/upstream-multipliers/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 without valid auth", async () => {
    const { PUT } = await import("@/app/api/admin/billing/upstream-multipliers/[id]/route");
    const req = new NextRequest(
      "http://localhost/api/admin/billing/upstream-multipliers/upstream-1",
      {
        method: "PUT",
        body: JSON.stringify({ input_multiplier: 1 }),
      }
    );
    const res = await PUT(req, { params: Promise.resolve({ id: "upstream-1" }) });
    expect(res.status).toBe(401);
  });

  it("should return 400 when body does not include any multiplier", async () => {
    const { PUT } = await import("@/app/api/admin/billing/upstream-multipliers/[id]/route");
    const req = new NextRequest(
      "http://localhost/api/admin/billing/upstream-multipliers/upstream-1",
      {
        method: "PUT",
        headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    const res = await PUT(req, { params: Promise.resolve({ id: "upstream-1" }) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("At least one multiplier must be provided");
  });

  it("should return 404 when upstream not found", async () => {
    const { PUT } = await import("@/app/api/admin/billing/upstream-multipliers/[id]/route");

    updateUpstreamBillingMultipliersMock.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/admin/billing/upstream-multipliers/missing", {
      method: "PUT",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ input_multiplier: 1 }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("should update upstream multipliers", async () => {
    const { PUT } = await import("@/app/api/admin/billing/upstream-multipliers/[id]/route");

    updateUpstreamBillingMultipliersMock.mockResolvedValueOnce({
      id: "upstream-1",
      name: "OpenAI",
      isActive: true,
      billingInputMultiplier: 1,
      billingOutputMultiplier: 1.2,
    });

    const req = new NextRequest(
      "http://localhost/api/admin/billing/upstream-multipliers/upstream-1",
      {
        method: "PUT",
        headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
        body: JSON.stringify({ output_multiplier: 1.2 }),
      }
    );
    const res = await PUT(req, { params: Promise.resolve({ id: "upstream-1" }) });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { id: string; output_multiplier: number };
    expect(body.id).toBe("upstream-1");
    expect(body.output_multiplier).toBe(1.2);
  });
});
