// @vitest-environment node
//
// Timeseries stats tests against a real libsql `:memory:` database (same
// harness as user-service.test.ts). Regression focus: requests that never
// reached an upstream (upstream_id IS NULL — routing failures, model-list
// calls) must be counted in the period totals and surface as the "Unknown"
// series, matching the overview/leaderboard request counts.

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// stats-service only reads config.dbType; keep the mock minimal so the real
// zod env validation never runs in tests.
vi.mock("@/lib/utils/config", () => ({
  config: { dbType: "sqlite" },
}));

vi.mock("@/lib/services/billing-cost-service", () => ({
  calculateAndPersistRequestBillingSnapshot: vi.fn(),
}));

vi.mock("@/lib/db", async () => {
  const { createLibsqlMemoryDbModule } = await import("../../helpers/libsql-memory-db");
  return createLibsqlMemoryDbModule();
});

import { db, requestLogs, upstreams } from "@/lib/db";
import { getTimeseriesStats } from "@/lib/services/stats-service";

async function seedUpstream(name: string): Promise<{ id: string }> {
  const now = new Date();
  const [row] = await db
    .insert(upstreams)
    .values({
      name,
      baseUrl: "https://example.test",
      apiKeyEncrypted: "encrypted:test",
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

beforeEach(async () => {
  await db.delete(requestLogs);
  await db.delete(upstreams);
});

describe("getTimeseriesStats", () => {
  it("counts requests without an upstream in totals and as the Unknown series", async () => {
    const upstream = await seedUpstream("primary");
    const now = new Date();

    await db.insert(requestLogs).values([
      {
        method: "POST",
        path: "/v1/chat/completions",
        upstreamId: upstream.id,
        statusCode: 200,
        totalTokens: 100,
        createdAt: now,
      },
      {
        method: "POST",
        path: "/v1/chat/completions",
        upstreamId: upstream.id,
        statusCode: 200,
        totalTokens: 50,
        createdAt: now,
      },
      // Routing failure: never reached an upstream.
      {
        method: "POST",
        path: "/v1/chat/completions",
        upstreamId: null,
        statusCode: 503,
        totalTokens: 0,
        createdAt: now,
      },
    ]);

    const result = await getTimeseriesStats("today", "requests");

    const totalRequests = result.totalSeries.reduce((acc, p) => acc + p.requestCount, 0);
    const totalTokens = result.totalSeries.reduce((acc, p) => acc + p.totalTokens, 0);
    expect(totalRequests).toBe(3);
    expect(totalTokens).toBe(150);

    // The whole-period aggregate matches the bucket totals exactly.
    expect(result.periodSummary.requestCount).toBe(3);
    expect(result.periodSummary.totalTokens).toBe(150);

    const names = result.series.map((s) => s.upstreamName);
    expect(names).toContain("primary");
    expect(names).toContain("Unknown");

    const unknown = result.series.find((s) => s.upstreamId === null);
    expect(unknown?.data.reduce((acc, p) => acc + p.requestCount, 0)).toBe(1);

    // Unknown sorts after named upstreams.
    expect(names[names.length - 1]).toBe("Unknown");
  });

  it("returns an empty series set when there are no logs in range", async () => {
    const result = await getTimeseriesStats("today", "requests");
    expect(result.series).toEqual([]);
    expect(result.totalSeries).toEqual([]);
    expect(result.periodSummary).toEqual({
      requestCount: 0,
      totalTokens: 0,
      avgTtftMs: 0,
      avgDurationMs: 0,
      avgTps: 0,
      totalCost: 0,
    });
  });
});
