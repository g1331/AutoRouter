import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/admin/stats/timeseries/route";
import { getTimeseriesStats } from "@/lib/services/stats-service";

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
  getTimeseriesStats: vi.fn(),
}));

describe("GET /api/admin/stats/timeseries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when auth is invalid", async () => {
    const request = new Request("http://localhost/api/admin/stats/timeseries", {
      headers: { authorization: "Bearer invalid-token" },
    });

    const response = await GET(request);
    expect(response.status).toBe(401);

    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("passes metric query to service and returns transformed stats data", async () => {
    vi.mocked(getTimeseriesStats).mockResolvedValue({
      range: "30d",
      granularity: "day",
      series: [
        {
          upstreamId: "up-1",
          upstreamName: "OpenAI",
          data: [
            {
              timestamp: new Date("2026-02-01T00:00:00.000Z"),
              requestCount: 120,
              totalTokens: 9000,
              avgDurationMs: 1500.5,
              avgTtftMs: 980.1,
              avgTps: 57.8,
            },
          ],
        },
      ],
      totalSeries: [
        {
          timestamp: new Date("2026-02-01T00:00:00.000Z"),
          requestCount: 120,
          totalTokens: 9000,
          avgDurationMs: 1500.5,
          avgTtftMs: 980.1,
          avgTps: 57.8,
        },
      ],
      periodSummary: {
        requestCount: 120,
        totalTokens: 9000,
        avgTtftMs: 980.1,
        avgDurationMs: 1500.5,
        avgTps: 57.8,
        totalCost: 0,
      },
    });

    const request = new Request(
      "http://localhost/api/admin/stats/timeseries?range=30d&metric=tps",
      {
        headers: { authorization: "Bearer valid-admin-token" },
      }
    );

    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(getTimeseriesStats).toHaveBeenCalledWith("30d", "tps", undefined, undefined);

    const data = await response.json();
    expect(data.range).toBe("30d");
    expect(data.granularity).toBe("day");
    expect(data.series[0].upstream_id).toBe("up-1");
    expect(data.total_series[0]).toEqual({
      timestamp: "2026-02-01T00:00:00.000Z",
      request_count: 120,
      total_tokens: 9000,
      avg_duration_ms: 1500.5,
      avg_ttft_ms: 980.1,
      avg_tps: 57.8,
    });
    expect(data.series[0].data[0]).toEqual({
      timestamp: "2026-02-01T00:00:00.000Z",
      request_count: 120,
      total_tokens: 9000,
      avg_duration_ms: 1500.5,
      avg_ttft_ms: 980.1,
      avg_tps: 57.8,
    });
    expect(data.period_summary).toEqual({
      request_count: 120,
      total_tokens: 9000,
      avg_ttft_ms: 980.1,
      avg_duration_ms: 1500.5,
      avg_tps: 57.8,
      total_cost: 0,
    });
  });

  it("returns 500 when service throws", async () => {
    vi.mocked(getTimeseriesStats).mockRejectedValue(new Error("db failed"));

    const request = new Request("http://localhost/api/admin/stats/timeseries", {
      headers: { authorization: "Bearer valid-admin-token" },
    });

    const response = await GET(request);
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data.error).toBe("Internal server error");
  });
});
