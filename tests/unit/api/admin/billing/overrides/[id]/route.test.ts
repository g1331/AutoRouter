import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader) => authHeader === "Bearer valid-token"),
}));

const updateBillingManualPriceOverrideMock = vi.fn();
const deleteBillingManualPriceOverrideMock = vi.fn();
vi.mock("@/lib/services/billing-price-service", () => ({
  updateBillingManualPriceOverride: (...args: unknown[]) =>
    updateBillingManualPriceOverrideMock(...args),
  deleteBillingManualPriceOverride: (...args: unknown[]) =>
    deleteBillingManualPriceOverrideMock(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const AUTH_HEADER = "Bearer valid-token";

describe("PUT /api/admin/billing/overrides/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 without valid auth", async () => {
    const { PUT } = await import("@/app/api/admin/billing/overrides/[id]/route");
    const req = new NextRequest("http://localhost/api/admin/billing/overrides/override-1", {
      method: "PUT",
      body: JSON.stringify({ input_price_per_million: 1 }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: "override-1" }) });
    expect(res.status).toBe(401);
  });

  it("should return 400 on validation error", async () => {
    const { PUT } = await import("@/app/api/admin/billing/overrides/[id]/route");
    const req = new NextRequest("http://localhost/api/admin/billing/overrides/override-1", {
      method: "PUT",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ input_price_per_million: "bad" }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: "override-1" }) });
    expect(res.status).toBe(400);
  });

  it("should return 404 when override does not exist", async () => {
    const { PUT } = await import("@/app/api/admin/billing/overrides/[id]/route");

    updateBillingManualPriceOverrideMock.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/admin/billing/overrides/missing", {
      method: "PUT",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ input_price_per_million: 1 }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("should update override", async () => {
    const { PUT } = await import("@/app/api/admin/billing/overrides/[id]/route");

    updateBillingManualPriceOverrideMock.mockResolvedValueOnce({
      id: "override-1",
      model: "sample_spec",
      inputPricePerMillion: 1,
      outputPricePerMillion: 2,
      cacheReadInputPricePerMillion: null,
      cacheWriteInputPricePerMillion: null,
      note: null,
      hasOfficialPrice: false,
      createdAt: new Date("2026-02-28T00:00:00.000Z"),
      updatedAt: new Date("2026-02-28T00:00:00.000Z"),
    });

    const req = new NextRequest("http://localhost/api/admin/billing/overrides/override-1", {
      method: "PUT",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ input_price_per_million: 1 }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: "override-1" }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; model: string };
    expect(body.id).toBe("override-1");
    expect(body.model).toBe("sample_spec");
  });
});

describe("DELETE /api/admin/billing/overrides/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 without valid auth", async () => {
    const { DELETE } = await import("@/app/api/admin/billing/overrides/[id]/route");
    const req = new NextRequest("http://localhost/api/admin/billing/overrides/override-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "override-1" }) });
    expect(res.status).toBe(401);
  });

  it("should return 404 when override does not exist", async () => {
    const { DELETE } = await import("@/app/api/admin/billing/overrides/[id]/route");

    deleteBillingManualPriceOverrideMock.mockResolvedValueOnce(false);
    const req = new NextRequest("http://localhost/api/admin/billing/overrides/missing", {
      method: "DELETE",
      headers: { authorization: AUTH_HEADER },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("should return 204 when deleted", async () => {
    const { DELETE } = await import("@/app/api/admin/billing/overrides/[id]/route");

    deleteBillingManualPriceOverrideMock.mockResolvedValueOnce(true);
    const req = new NextRequest("http://localhost/api/admin/billing/overrides/override-1", {
      method: "DELETE",
      headers: { authorization: AUTH_HEADER },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "override-1" }) });
    expect(res.status).toBe(204);
  });
});
