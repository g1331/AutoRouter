import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader) => authHeader === "Bearer valid-token"),
}));

const listBillingModelPricesMock = vi.fn();
vi.mock("@/lib/services/billing-price-service", () => ({
  listBillingModelPrices: (...args: unknown[]) => listBillingModelPricesMock(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const AUTH_HEADER = "Bearer valid-token";

describe("GET /api/admin/billing/prices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 without valid auth", async () => {
    const { GET } = await import("@/app/api/admin/billing/prices/route");
    const req = new NextRequest("http://localhost/api/admin/billing/prices");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("should return 400 for unsupported source", async () => {
    const { GET } = await import("@/app/api/admin/billing/prices/route");
    const req = new NextRequest("http://localhost/api/admin/billing/prices?source=openrouter", {
      headers: { authorization: AUTH_HEADER },
    });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("source must be litellm");
  });

  it("should return 400 for invalid active_only", async () => {
    const { GET } = await import("@/app/api/admin/billing/prices/route");
    const req = new NextRequest("http://localhost/api/admin/billing/prices?active_only=maybe", {
      headers: { authorization: AUTH_HEADER },
    });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("active_only must be true or false");
  });

  it("should list paginated model prices and pass normalized params to service", async () => {
    const { GET } = await import("@/app/api/admin/billing/prices/route");

    listBillingModelPricesMock.mockResolvedValueOnce({
      items: [
        {
          id: "price-1",
          model: "gpt-4.1",
          inputPricePerMillion: 3,
          outputPricePerMillion: 9,
          cacheReadInputPricePerMillion: 0.8,
          cacheWriteInputPricePerMillion: null,
          source: "litellm",
          isActive: true,
          syncedAt: new Date("2026-02-28T00:00:00.000Z"),
          updatedAt: new Date("2026-02-28T00:00:00.000Z"),
        },
      ],
      total: 1,
      page: 2,
      pageSize: 10,
      totalPages: 3,
    });

    const req = new NextRequest(
      "http://localhost/api/admin/billing/prices?page=2&page_size=10&model=%20gpt-4.1%20&source=litellm&active_only=true",
      { headers: { authorization: AUTH_HEADER } }
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    expect(listBillingModelPricesMock).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      modelQuery: "gpt-4.1",
      source: "litellm",
      activeOnly: true,
    });

    const body = (await res.json()) as {
      items: Array<{ model: string; source: string; synced_at: string }>;
      total: number;
      page: number;
      page_size: number;
      total_pages: number;
    };

    expect(body.total).toBe(1);
    expect(body.page).toBe(2);
    expect(body.page_size).toBe(10);
    expect(body.total_pages).toBe(3);
    expect(body.items[0].model).toBe("gpt-4.1");
    expect(body.items[0].source).toBe("litellm");
    expect(body.items[0].synced_at).toBe("2026-02-28T00:00:00.000Z");
  });
});
