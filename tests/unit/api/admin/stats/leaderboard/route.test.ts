import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/admin/stats/leaderboard/route";
import { getLeaderboardStats, getRankings } from "@/lib/services/stats-service";

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
      if (authHeader === "Bearer valid-admin-token") {
        return { kind: "admin_token" };
      }
      return actual.errorResponse("Unauthorized", 401);
    }),
  };
});

vi.mock("@/lib/services/stats-service", () => ({
  getLeaderboardStats: vi.fn(),
  getRankings: vi.fn(),
  LEADERBOARD_DIMENSIONS: ["upstreams", "models", "api_keys", "users"],
  LEADERBOARD_SORT_FIELDS: ["requests", "tokens", "cost", "ttft", "tps", "cache_hit", "error_rate"],
}));

const metrics = {
  requestCount: 88,
  totalTokens: 9999,
  totalCostUsd: 1.5,
  avgTtftMs: 1222.2,
  avgTps: 66.6,
  cacheHitRate: 12.5,
  errorRate: 2.3,
};

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
      apiKeys: [],
      upstreams: [
        {
          id: "up-1",
          name: "OpenAI",
          providerType: "openai",
          ...metrics,
          modelDistribution: [{ name: "gpt-5", count: 88 }],
        },
      ],
      models: [],
      users: [
        {
          id: "user-1",
          username: "alice",
          displayName: "Alice",
          ...metrics,
          requestCount: 50,
          totalTokens: 3210,
          modelDistribution: [{ name: "gpt-5", count: 50 }],
        },
      ],
    });

    const request = new Request(
      "http://localhost/api/admin/stats/leaderboard?range=7d&limit=5&tz_offset=-300",
      {
        headers: { authorization: "Bearer valid-admin-token" },
      }
    );

    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(getLeaderboardStats).toHaveBeenCalledWith("7d", 5, undefined, undefined, -300);
    expect(getRankings).not.toHaveBeenCalled();

    const data = await response.json();
    expect(data.upstreams[0]).toEqual({
      id: "up-1",
      name: "OpenAI",
      provider_type: "openai",
      request_count: 88,
      total_tokens: 9999,
      total_cost_usd: 1.5,
      avg_ttft_ms: 1222.2,
      avg_tps: 66.6,
      cache_hit_rate: 12.5,
      error_rate: 2.3,
      model_distribution: [{ name: "gpt-5", count: 88 }],
    });
    expect(data.users[0]).toMatchObject({
      id: "user-1",
      username: "alice",
      display_name: "Alice",
      request_count: 50,
      total_tokens: 3210,
      total_cost_usd: 1.5,
      model_distribution: [{ name: "gpt-5", count: 50 }],
    });
  });

  it("returns a single-dimension ranking when dimension is provided", async () => {
    vi.mocked(getRankings).mockResolvedValue({
      range: "7d",
      dimension: "models",
      sortBy: "cost",
      order: "asc",
      items: [
        {
          model: "gpt-5",
          ...metrics,
          upstreamDistribution: [{ name: "OpenAI", count: 88 }],
          comparison: { prevRank: 2, prevRequestCount: 40 },
        },
      ],
    });

    const request = new Request(
      "http://localhost/api/admin/stats/leaderboard?dimension=models&sort_by=cost&order=asc&compare=true&limit=50",
      {
        headers: { authorization: "Bearer valid-admin-token" },
      }
    );

    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(getLeaderboardStats).not.toHaveBeenCalled();
    expect(getRankings).toHaveBeenCalledWith({
      dimension: "models",
      sortBy: "cost",
      order: "asc",
      rangeType: "7d",
      limit: 50,
      customStart: undefined,
      customEnd: undefined,
      tzOffsetMinutes: 0,
      compare: true,
    });

    const data = await response.json();
    expect(data).toEqual({
      range: "7d",
      dimension: "models",
      sort_by: "cost",
      order: "asc",
      items: [
        {
          model: "gpt-5",
          request_count: 88,
          total_tokens: 9999,
          total_cost_usd: 1.5,
          avg_ttft_ms: 1222.2,
          avg_tps: 66.6,
          cache_hit_rate: 12.5,
          error_rate: 2.3,
          upstream_distribution: [{ name: "OpenAI", count: 88 }],
          comparison: { prev_rank: 2, prev_request_count: 40 },
        },
      ],
    });
  });

  it("rejects an invalid dimension with 400", async () => {
    const request = new Request("http://localhost/api/admin/stats/leaderboard?dimension=bogus", {
      headers: { authorization: "Bearer valid-admin-token" },
    });

    const response = await GET(request);
    expect(response.status).toBe(400);
    expect(getRankings).not.toHaveBeenCalled();
  });

  it("rejects an invalid sort_by with 400", async () => {
    const request = new Request(
      "http://localhost/api/admin/stats/leaderboard?dimension=models&sort_by=bogus",
      {
        headers: { authorization: "Bearer valid-admin-token" },
      }
    );

    const response = await GET(request);
    expect(response.status).toBe(400);
    expect(getRankings).not.toHaveBeenCalled();
  });

  it("rejects an invalid order with 400", async () => {
    const request = new Request(
      "http://localhost/api/admin/stats/leaderboard?dimension=models&order=sideways",
      {
        headers: { authorization: "Bearer valid-admin-token" },
      }
    );

    const response = await GET(request);
    expect(response.status).toBe(400);
    expect(getRankings).not.toHaveBeenCalled();
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
