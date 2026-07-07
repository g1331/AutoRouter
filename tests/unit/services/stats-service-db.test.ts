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
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  const { is } = await import("drizzle-orm");
  const { SQLiteTable, getTableConfig } = await import("drizzle-orm/sqlite-core");
  const fs = await import("fs");
  const pathMod = await import("path");
  const schema = await import("@/lib/db/schema-sqlite");

  // Shared-cache in-memory URI so every connection sees the same store.
  const client = createClient({ url: "file::memory:?cache=shared" });

  // Apply drizzle-sqlite migrations statement by statement (the libsql
  // migrator chokes on empty fragments left by statement-breakpoint splits).
  const dir = pathMod.resolve(process.cwd(), "drizzle-sqlite");
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const raw = fs.readFileSync(pathMod.join(dir, file), "utf8");
    const statements = raw
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await client.execute(stmt);
    }
  }

  // Reconcile migration drift against schema-sqlite by adding any missing
  // columns to tables the migrations did create (see user-service.test.ts).
  for (const exported of Object.values(schema)) {
    if (!is(exported, SQLiteTable)) {
      continue;
    }
    const cfg = getTableConfig(exported);
    const info = await client.execute(`PRAGMA table_info(\`${cfg.name}\`)`);
    if (info.rows.length === 0) {
      continue;
    }
    const existing = new Set(info.rows.map((row) => String(row.name)));
    for (const column of cfg.columns) {
      if (!existing.has(column.name)) {
        await client.execute(
          `ALTER TABLE \`${cfg.name}\` ADD COLUMN \`${column.name}\` ${column.getSQLType()}`
        );
      }
    }
  }

  const db = drizzle(client, { schema });
  return { db, ...schema };
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
  });
});
