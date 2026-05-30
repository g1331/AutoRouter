import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getLivePulseSnapshotMock } = vi.hoisted(() => ({
  getLivePulseSnapshotMock: vi.fn(),
}));

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader) => authHeader === "Bearer valid-token"),
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("@/lib/services/live-pulse-service", () => ({
  getLivePulseSnapshot: (...args: unknown[]) => getLivePulseSnapshotMock(...args),
}));

const AUTH_HEADER = "Bearer valid-token";

const SNAPSHOT = {
  requestsPerMinute: 12,
  errorRatePct: 0,
  avgLatencyMs: 100,
  tokensPerMinute: 3400,
  sampleCount: 12,
  windowSeconds: 60,
  generatedAt: "2026-05-30T00:00:00.000Z",
  gateway: { healthyUpstreams: 2, totalUpstreams: 2, openCircuitBreakers: 0 },
};

describe("admin stats live route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects the snapshot request without admin auth and leaks no metrics", async () => {
    const { GET } = await import("@/app/api/admin/stats/live/route");

    const response = await GET(
      new NextRequest("http://localhost/api/admin/stats/live?mode=snapshot")
    );

    expect(response.status).toBe(401);
    expect(getLivePulseSnapshotMock).not.toHaveBeenCalled();
  });

  it("rejects the SSE stream request without admin auth", async () => {
    const { GET } = await import("@/app/api/admin/stats/live/route");

    const response = await GET(new NextRequest("http://localhost/api/admin/stats/live"));

    expect(response.status).toBe(401);
    expect(getLivePulseSnapshotMock).not.toHaveBeenCalled();
  });

  it("rejects requests carrying an invalid admin token", async () => {
    const { GET } = await import("@/app/api/admin/stats/live/route");

    const response = await GET(
      new NextRequest("http://localhost/api/admin/stats/live?mode=snapshot", {
        headers: { authorization: "Bearer wrong-token" },
      })
    );

    expect(response.status).toBe(401);
    expect(getLivePulseSnapshotMock).not.toHaveBeenCalled();
  });

  it("returns a one-shot snapshot for authenticated ?mode=snapshot requests", async () => {
    getLivePulseSnapshotMock.mockResolvedValueOnce(SNAPSHOT);
    const { GET } = await import("@/app/api/admin/stats/live/route");

    const response = await GET(
      new NextRequest("http://localhost/api/admin/stats/live?mode=snapshot", {
        headers: { authorization: AUTH_HEADER },
      })
    );

    expect(response.status).toBe(200);
    expect(getLivePulseSnapshotMock).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual(SNAPSHOT);
  });
});
