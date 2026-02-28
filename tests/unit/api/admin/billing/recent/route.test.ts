import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader) => authHeader === "Bearer valid-token"),
}));

const listRecentBillingDetailsMock = vi.fn();
vi.mock("@/lib/services/billing-management-service", () => ({
  listRecentBillingDetails: (...args: unknown[]) => listRecentBillingDetailsMock(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const AUTH_HEADER = "Bearer valid-token";

describe("GET /api/admin/billing/recent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 without valid auth", async () => {
    const { GET } = await import("@/app/api/admin/billing/recent/route");
    const req = new NextRequest("http://localhost/api/admin/billing/recent");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("should return paginated recent billing details", async () => {
    const { GET } = await import("@/app/api/admin/billing/recent/route");

    listRecentBillingDetailsMock.mockResolvedValueOnce({
      items: [
        {
          requestLogId: "log-1",
          createdAt: new Date("2026-02-28T00:00:00.000Z"),
          model: "gpt-4.1",
          upstreamId: "upstream-1",
          upstreamName: "OpenAI",
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          priceSource: "litellm",
          billingStatus: "billed",
          unbillableReason: null,
          baseInputPricePerMillion: 3,
          baseOutputPricePerMillion: 9,
          baseCacheReadInputPricePerMillion: 0.8,
          baseCacheWriteInputPricePerMillion: null,
          inputMultiplier: 1,
          outputMultiplier: 1,
          cacheReadCost: 0,
          cacheWriteCost: 0,
          finalCost: 0.00021,
          currency: "USD",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    const req = new NextRequest("http://localhost/api/admin/billing/recent?page=1&page_size=20", {
      headers: { authorization: AUTH_HEADER },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);

    expect(listRecentBillingDetailsMock).toHaveBeenCalledWith(1, 20);
    const body = (await res.json()) as {
      items: Array<{ request_log_id: string; final_cost: number }>;
    };
    expect(body.items[0].request_log_id).toBe("log-1");
    expect(body.items[0].final_cost).toBe(0.00021);
  });
});
