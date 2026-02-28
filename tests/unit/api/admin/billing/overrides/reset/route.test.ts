import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader) => authHeader === "Bearer valid-token"),
}));

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
