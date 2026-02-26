import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/admin/stats/leaderboard/route";
import { getLeaderboardStats } from "@/lib/services/stats-service";

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader) => authHeader === "Bearer valid-admin-token"),
}));

vi.mock("@/lib/services/stats-service", () => ({
  getLeaderboardStats: vi.fn(),
}));

describe("GET /api/admin/stats/leaderboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when auth is invalid", async () => {
    const request = new Request("http://localhost/api/admin/stats/leaderboard", {
      headers: { authorization: "Bearer invalid-token" },
    });

    const response = await GET(request);
    expect(response.status).toBe(401);

    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("returns upstream performance fields including avg_ttft_ms and avg_tps", async () => {
    vi.mocked(getLeaderboardStats).mockResolvedValue({
      range: "7d",
      apiKeys: [
        {
          id: "key-1",
          name: "Prod Key",
          keyPrefix: "sk-prod",
          requestCount: 123,
          totalTokens: 4567,
        },
      ],
      upstreams: [
        {
          id: "up-1",
          name: "OpenAI",
          providerType: "openai",
          requestCount: 88,
          totalTokens: 9999,
          avgTtftMs: 1222.2,
          avgTps: 66.6,
        },
      ],
      models: [
        {
          model: "gpt-5",
          requestCount: 66,
          totalTokens: 7777,
        },
      ],
    });

    const request = new Request("http://localhost/api/admin/stats/leaderboard?range=7d&limit=5", {
      headers: { authorization: "Bearer valid-admin-token" },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(getLeaderboardStats).toHaveBeenCalledWith("7d", 5);

    const data = await response.json();
    expect(data.upstreams[0]).toEqual({
      id: "up-1",
      name: "OpenAI",
      provider_type: "openai",
      request_count: 88,
      total_tokens: 9999,
      avg_ttft_ms: 1222.2,
      avg_tps: 66.6,
    });
  });

  it("returns 500 when service throws", async () => {
    vi.mocked(getLeaderboardStats).mockRejectedValue(new Error("db failed"));

    const request = new Request("http://localhost/api/admin/stats/leaderboard", {
      headers: { authorization: "Bearer valid-admin-token" },
    });

    const response = await GET(request);
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data.error).toBe("Internal server error");
  });
});
