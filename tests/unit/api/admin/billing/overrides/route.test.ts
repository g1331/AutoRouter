import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader) => authHeader === "Bearer valid-token"),
}));

const listBillingManualPriceOverridesMock = vi.fn();
const createBillingManualPriceOverrideMock = vi.fn();
vi.mock("@/lib/services/billing-price-service", () => ({
  listBillingManualPriceOverrides: (...args: unknown[]) =>
    listBillingManualPriceOverridesMock(...args),
  createBillingManualPriceOverride: (...args: unknown[]) =>
    createBillingManualPriceOverrideMock(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const AUTH_HEADER = "Bearer valid-token";

describe("GET /api/admin/billing/overrides", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 without valid auth", async () => {
    const { GET } = await import("@/app/api/admin/billing/overrides/route");
    const req = new NextRequest("http://localhost/api/admin/billing/overrides");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("should list manual overrides", async () => {
    const { GET } = await import("@/app/api/admin/billing/overrides/route");

    listBillingManualPriceOverridesMock.mockResolvedValueOnce([
      {
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
      },
    ]);

    const req = new NextRequest("http://localhost/api/admin/billing/overrides", {
      headers: { authorization: AUTH_HEADER },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      items: Array<{ model: string; has_official_price?: boolean }>;
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.items[0].model).toBe("sample_spec");
    expect(body.items[0].has_official_price).toBe(false);
  });
});

describe("POST /api/admin/billing/overrides", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 without valid auth", async () => {
    const { POST } = await import("@/app/api/admin/billing/overrides/route");
    const req = new NextRequest("http://localhost/api/admin/billing/overrides", {
      method: "POST",
      body: JSON.stringify({ model: "x", input_price_per_million: 1, output_price_per_million: 2 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("should return 400 on validation error", async () => {
    const { POST } = await import("@/app/api/admin/billing/overrides/route");
    const req = new NextRequest("http://localhost/api/admin/billing/overrides", {
      method: "POST",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ model: "" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Validation error");
  });

  it("should create manual override", async () => {
    const { POST } = await import("@/app/api/admin/billing/overrides/route");

    createBillingManualPriceOverrideMock.mockResolvedValueOnce({
      id: "override-1",
      model: "sample_spec",
      inputPricePerMillion: 1,
      outputPricePerMillion: 2,
      cacheReadInputPricePerMillion: null,
      cacheWriteInputPricePerMillion: null,
      note: "note",
      hasOfficialPrice: false,
      createdAt: new Date("2026-02-28T00:00:00.000Z"),
      updatedAt: new Date("2026-02-28T00:00:00.000Z"),
    });

    const req = new NextRequest("http://localhost/api/admin/billing/overrides", {
      method: "POST",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({
        model: "sample_spec",
        input_price_per_million: 1,
        output_price_per_million: 2,
        note: "note",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    const body = (await res.json()) as { model: string; input_price_per_million: number };
    expect(body.model).toBe("sample_spec");
    expect(body.input_price_per_million).toBe(1);
  });
});
