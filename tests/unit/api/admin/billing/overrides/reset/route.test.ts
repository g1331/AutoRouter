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

const deleteBillingManualPriceOverridesByModelsMock = vi.fn();
vi.mock("@/lib/services/billing-price-service", () => ({
  deleteBillingManualPriceOverridesByModels: deleteBillingManualPriceOverridesByModelsMock,
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const AUTH_HEADER = "Bearer valid-token";

describe("POST /api/admin/billing/overrides/reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 without valid auth", async () => {
    const { POST } = await import("@/app/api/admin/billing/overrides/reset/route");

    const request = new NextRequest("http://localhost/api/admin/billing/overrides/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ models: ["gpt-4.1"] }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("should return 400 for invalid payload", async () => {
    const { POST } = await import("@/app/api/admin/billing/overrides/reset/route");

    const request = new NextRequest("http://localhost/api/admin/billing/overrides/reset", {
      method: "POST",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ models: [] }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("should reset overrides and return missing official models", async () => {
    const { POST } = await import("@/app/api/admin/billing/overrides/reset/route");

    deleteBillingManualPriceOverridesByModelsMock.mockResolvedValueOnce({
      deletedCount: 2,
      missingOfficialModels: ["sample_spec"],
    });

    const request = new NextRequest("http://localhost/api/admin/billing/overrides/reset", {
      method: "POST",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ models: ["gpt-4.1", "sample_spec"] }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      deleted_count: number;
      missing_official_models: string[];
    };
    expect(body).toEqual({
      deleted_count: 2,
      missing_official_models: ["sample_spec"],
    });
    expect(deleteBillingManualPriceOverridesByModelsMock).toHaveBeenCalledWith([
      "gpt-4.1",
      "sample_spec",
    ]);
  });
});
