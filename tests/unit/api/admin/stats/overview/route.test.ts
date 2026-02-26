import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/admin/stats/overview/route";
import { getOverviewStats } from "@/lib/services/stats-service";

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader) => authHeader === "Bearer valid-admin-token"),
}));

vi.mock("@/lib/services/stats-service", () => ({
  getOverviewStats: vi.fn(),
}));

describe("GET /api/admin/stats/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when auth is invalid", async () => {
    const request = new Request("http://localhost/api/admin/stats/overview", {
      headers: { authorization: "Bearer invalid-token" },
    });

    const response = await GET(request);
    expect(response.status).toBe(401);

    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("returns overview metrics including ttft and cache hit rate", async () => {
    vi.mocked(getOverviewStats).mockResolvedValue({
      todayRequests: 123,
      avgResponseTimeMs: 456.7,
      totalTokensToday: 8901,
      successRateToday: 98.5,
      avgTtftMs: 222.3,
      cacheHitRate: 44.4,
    });

    const request = new Request("http://localhost/api/admin/stats/overview", {
      headers: { authorization: "Bearer valid-admin-token" },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toEqual({
      today_requests: 123,
      avg_response_time_ms: 456.7,
      total_tokens_today: 8901,
      success_rate_today: 98.5,
      avg_ttft_ms: 222.3,
      cache_hit_rate: 44.4,
    });
  });

  it("returns 500 when service throws", async () => {
    vi.mocked(getOverviewStats).mockRejectedValue(new Error("db failed"));

    const request = new Request("http://localhost/api/admin/stats/overview", {
      headers: { authorization: "Bearer valid-admin-token" },
    });

    const response = await GET(request);
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data.error).toBe("Internal server error");
  });
});
