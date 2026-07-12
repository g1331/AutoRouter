import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getRequestLogWindowStatsMock } = vi.hoisted(() => ({
  getRequestLogWindowStatsMock: vi.fn(),
}));

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

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("@/lib/services/request-logger", () => ({
  getRequestLogWindowStats: (...args: unknown[]) => getRequestLogWindowStatsMock(...args),
}));

const AUTH_HEADER = "Bearer valid-token";

function makeStats() {
  return {
    total: 10,
    streamCount: 4,
    slowCount: 1,
    p50TtftMs: 800,
    p90TtftMs: 2400,
    p50Tps: 42.5,
  };
}

describe("admin logs stats route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects requests without admin auth", async () => {
    const { GET } = await import("@/app/api/admin/logs/stats/route");

    const response = await GET(new NextRequest("http://localhost/api/admin/logs/stats"));

    expect(response.status).toBe(401);
    expect(getRequestLogWindowStatsMock).not.toHaveBeenCalled();
  });

  it("returns window stats in snake_case", async () => {
    const { GET } = await import("@/app/api/admin/logs/stats/route");
    getRequestLogWindowStatsMock.mockResolvedValueOnce(makeStats());

    const response = await GET(
      new NextRequest("http://localhost/api/admin/logs/stats", {
        headers: { authorization: AUTH_HEADER },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      total: 10,
      stream_count: 4,
      slow_count: 1,
      p50_ttft_ms: 800,
      p90_ttft_ms: 2400,
      p50_tps: 42.5,
    });
    expect(getRequestLogWindowStatsMock).toHaveBeenCalledWith({});
  });

  it("forwards the shared filter surface into the service", async () => {
    const { GET } = await import("@/app/api/admin/logs/stats/route");
    getRequestLogWindowStatsMock.mockResolvedValueOnce(makeStats());

    const response = await GET(
      new NextRequest(
        "http://localhost/api/admin/logs/stats?user_id=user-1&upstream_id=up-1&api_key_id=key-1" +
          "&status_code=429&model=gpt-4&ttft_min_ms=5000&tps_max=30" +
          "&start_time=2026-07-01T00:00:00.000Z",
        { headers: { authorization: AUTH_HEADER } }
      )
    );

    expect(response.status).toBe(200);
    expect(getRequestLogWindowStatsMock).toHaveBeenCalledWith({
      userId: "user-1",
      upstreamId: "up-1",
      apiKeyId: "key-1",
      statusCode: 429,
      model: "gpt-4",
      ttftMinMs: 5000,
      tpsMax: 30,
      startTime: new Date("2026-07-01T00:00:00.000Z"),
    });
  });

  it.each([
    ["status_code=abc", "non-numeric status_code"],
    ["status_class=3xx", "invalid status_class"],
    ["tps_max=0", "non-positive tps_max"],
    ["start_time=not-a-date", "invalid start_time"],
  ])("rejects %s with 400 (%s)", async (query) => {
    const { GET } = await import("@/app/api/admin/logs/stats/route");

    const response = await GET(
      new NextRequest(`http://localhost/api/admin/logs/stats?${query}`, {
        headers: { authorization: AUTH_HEADER },
      })
    );

    expect(response.status).toBe(400);
    expect(getRequestLogWindowStatsMock).not.toHaveBeenCalled();
  });
});
