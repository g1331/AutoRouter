// @vitest-environment node
//
// User-side personal data service tests. These run the real aggregation SQL
// against a real libsql `:memory:` database (the same harness as
// user-service.test.ts) so data isolation, the redundant user_id attribution,
// and the time-window aggregates are verified against an actual database. The
// shared test setup forces DB_TYPE=postgres, so the config is mocked back to
// sqlite here to keep the day-bucket SQL on the dialect the harness runs.

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("@/lib/utils/config", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/utils/config")>();
  return { ...actual, config: { ...actual.config, dbType: "sqlite" as const } };
});

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

  // Apply the drizzle-sqlite migrations statement by statement (drizzle's own
  // libsql migrator chokes on the empty fragments left by breakpoint splitting).
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

  // Reconcile migrated tables to schema-sqlite by adding drifted columns.
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

import {
  db,
  users,
  apiKeys,
  requestLogs,
  requestBillingSnapshots,
  upstreams,
  userUpstreams,
} from "@/lib/db";
import {
  getUserOverview,
  listUserRequestLogs,
  getUserUsageStats,
  listUserUpstreamOptions,
} from "@/lib/services/user-data-service";

const DAY_MS = 24 * 60 * 60 * 1000;

async function seedUser(username: string): Promise<{ id: string }> {
  const now = new Date();
  const [row] = await db
    .insert(users)
    .values({
      username,
      passwordHash: "hashed:pw",
      displayName: username,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

async function seedApiKey(overrides: {
  userId: string | null;
  isActive?: boolean;
}): Promise<{ id: string }> {
  const now = new Date();
  const suffix = Math.random().toString(36).slice(2);
  const [row] = await db
    .insert(apiKeys)
    .values({
      keyHash: `hash-${suffix}`,
      keyPrefix: "sk-auto-test",
      name: `key-${suffix}`,
      userId: overrides.userId,
      isActive: overrides.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

async function seedRequestLog(overrides: {
  userId: string | null;
  apiKeyId?: string | null;
  createdAt?: Date;
  totalTokens?: number;
  statusCode?: number;
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(requestLogs)
    .values({
      apiKeyId: overrides.apiKeyId ?? null,
      userId: overrides.userId,
      upstreamId: null,
      method: "POST",
      path: "/v1/chat/completions",
      model: "gpt-test",
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: overrides.totalTokens ?? 30,
      statusCode: overrides.statusCode ?? 200,
      durationMs: 100,
      isStream: false,
      createdAt: overrides.createdAt ?? new Date(),
    })
    .returning();
  return row;
}

async function seedBillingSnapshot(overrides: {
  requestLogId: string;
  userId: string | null;
  finalCost?: number;
  billingStatus?: "billed" | "unbilled";
}): Promise<void> {
  const now = new Date();
  await db.insert(requestBillingSnapshots).values({
    requestLogId: overrides.requestLogId,
    apiKeyId: null,
    upstreamId: null,
    userId: overrides.userId,
    model: "gpt-test",
    billingStatus: overrides.billingStatus ?? "billed",
    promptTokens: 10,
    completionTokens: 20,
    totalTokens: 30,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    finalCost: overrides.finalCost ?? 0,
    currency: "USD",
    billedAt: now,
    createdAt: now,
  });
}

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
  await db.delete(requestBillingSnapshots);
  await db.delete(requestLogs);
  await db.delete(apiKeys);
  await db.delete(userUpstreams);
  await db.delete(upstreams);
  await db.delete(users);
});

describe("getUserOverview", () => {
  it("returns zero aggregates for a user without keys or history", async () => {
    const alice = await seedUser("alice");

    const overview = await getUserOverview(alice.id);

    expect(overview).toEqual({
      todayRequests: 0,
      monthRequests: 0,
      monthCostUsd: 0,
      totalRequests: 0,
      totalCostUsd: 0,
      activeKeyCount: 0,
      totalKeyCount: 0,
    });
  });

  it("aggregates only the caller's records and key counts", async () => {
    const alice = await seedUser("alice");
    const bob = await seedUser("bob");
    await seedApiKey({ userId: alice.id, isActive: true });
    await seedApiKey({ userId: alice.id, isActive: false });
    await seedApiKey({ userId: bob.id, isActive: true });

    const aliceLog = await seedRequestLog({ userId: alice.id });
    await seedBillingSnapshot({ requestLogId: aliceLog.id, userId: alice.id, finalCost: 1.5 });
    const bobLog = await seedRequestLog({ userId: bob.id });
    await seedBillingSnapshot({ requestLogId: bobLog.id, userId: bob.id, finalCost: 9 });
    // Ownerless legacy traffic must not attribute to anyone.
    await seedRequestLog({ userId: null });

    const overview = await getUserOverview(alice.id);

    expect(overview.todayRequests).toBe(1);
    expect(overview.totalRequests).toBe(1);
    expect(overview.monthCostUsd).toBe(1.5);
    expect(overview.totalCostUsd).toBe(1.5);
    expect(overview.activeKeyCount).toBe(1);
    expect(overview.totalKeyCount).toBe(2);
  });

  it("keeps history attributed after the producing key is deleted", async () => {
    const alice = await seedUser("alice");
    const key = await seedApiKey({ userId: alice.id });
    const log = await seedRequestLog({ userId: alice.id, apiKeyId: key.id });
    await seedBillingSnapshot({ requestLogId: log.id, userId: alice.id, finalCost: 2 });

    await db.delete(apiKeys);

    const overview = await getUserOverview(alice.id);
    expect(overview.totalRequests).toBe(1);
    expect(overview.totalCostUsd).toBe(2);
    expect(overview.totalKeyCount).toBe(0);
  });

  it("separates today, month and all-time windows", async () => {
    const alice = await seedUser("alice");
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const previousMonth = new Date(startOfMonth.getTime() - 10 * DAY_MS);

    // One request today, one earlier (previous month).
    const todayLog = await seedRequestLog({ userId: alice.id });
    await seedBillingSnapshot({ requestLogId: todayLog.id, userId: alice.id, finalCost: 1 });
    const oldLog = await seedRequestLog({ userId: alice.id, createdAt: previousMonth });
    await seedBillingSnapshot({ requestLogId: oldLog.id, userId: alice.id, finalCost: 4 });

    const overview = await getUserOverview(alice.id);

    expect(overview.todayRequests).toBe(1);
    expect(overview.monthRequests).toBe(1);
    expect(overview.monthCostUsd).toBe(1);
    expect(overview.totalRequests).toBe(2);
    expect(overview.totalCostUsd).toBe(5);
  });

  it("ignores unbilled snapshots in cost aggregates", async () => {
    const alice = await seedUser("alice");
    const log = await seedRequestLog({ userId: alice.id });
    await seedBillingSnapshot({
      requestLogId: log.id,
      userId: alice.id,
      finalCost: 7,
      billingStatus: "unbilled",
    });

    const overview = await getUserOverview(alice.id);
    expect(overview.totalRequests).toBe(1);
    expect(overview.totalCostUsd).toBe(0);
  });
});

describe("listUserRequestLogs", () => {
  it("returns only the caller's logs", async () => {
    const alice = await seedUser("alice");
    const bob = await seedUser("bob");
    await seedRequestLog({ userId: alice.id });
    await seedRequestLog({ userId: bob.id });
    await seedRequestLog({ userId: null });

    const result = await listUserRequestLogs(alice.id);

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  it("cannot be widened to foreign data through an api_key_id filter", async () => {
    const alice = await seedUser("alice");
    const bob = await seedUser("bob");
    const bobKey = await seedApiKey({ userId: bob.id });
    await seedRequestLog({ userId: bob.id, apiKeyId: bobKey.id });

    // Alice passes Bob's key id; AND semantics must yield nothing, not Bob's data.
    const result = await listUserRequestLogs(alice.id, 1, 20, { apiKeyId: bobKey.id });

    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it("returns an empty page for a user without history", async () => {
    const alice = await seedUser("alice");

    const result = await listUserRequestLogs(alice.id);

    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
    expect(result.totalPages).toBe(1);
  });
});

describe("getUserUsageStats", () => {
  it("buckets only the caller's requests by day inside the window", async () => {
    const alice = await seedUser("alice");
    const bob = await seedUser("bob");
    const now = new Date();
    const yesterday = new Date(now.getTime() - DAY_MS);
    const outsideWindow = new Date(now.getTime() - 40 * DAY_MS);

    const todayLog = await seedRequestLog({ userId: alice.id, totalTokens: 100 });
    await seedBillingSnapshot({ requestLogId: todayLog.id, userId: alice.id, finalCost: 0.5 });
    await seedRequestLog({ userId: alice.id, createdAt: yesterday, totalTokens: 50 });
    await seedRequestLog({ userId: alice.id, createdAt: outsideWindow, totalTokens: 999 });
    await seedRequestLog({ userId: bob.id, totalTokens: 777 });

    const usage = await getUserUsageStats(alice.id, "7d");

    expect(usage.range).toBe("7d");
    expect(usage.granularity).toBe("day");
    expect(usage.points).toHaveLength(2);
    const totalRequests = usage.points.reduce((acc, p) => acc + p.requestCount, 0);
    const totalTokens = usage.points.reduce((acc, p) => acc + p.totalTokens, 0);
    const totalCost = usage.points.reduce((acc, p) => acc + p.totalCostUsd, 0);
    expect(totalRequests).toBe(2);
    expect(totalTokens).toBe(150);
    expect(totalCost).toBe(0.5);
    // Points arrive in ascending time order.
    expect(usage.points[0].timestamp.getTime()).toBeLessThan(usage.points[1].timestamp.getTime());
  });

  it("includes older traffic in the 30d window", async () => {
    const alice = await seedUser("alice");
    const fifteenDaysAgo = new Date(Date.now() - 15 * DAY_MS);
    await seedRequestLog({ userId: alice.id, createdAt: fifteenDaysAgo });

    const sevenDay = await getUserUsageStats(alice.id, "7d");
    const thirtyDay = await getUserUsageStats(alice.id, "30d");

    expect(sevenDay.points).toHaveLength(0);
    expect(thirtyDay.points).toHaveLength(1);
  });

  it("returns an empty series for a user without traffic", async () => {
    const alice = await seedUser("alice");

    const usage = await getUserUsageStats(alice.id);

    expect(usage.points).toEqual([]);
  });
});

describe("listUserUpstreamOptions", () => {
  it("returns only the caller's granted upstreams as id + name, sorted by name", async () => {
    const alice = await seedUser("alice");
    const bob = await seedUser("bob");
    const upBeta = await seedUpstream("beta");
    const upAlpha = await seedUpstream("alpha");
    const upOther = await seedUpstream("other");

    await db.insert(userUpstreams).values([
      { userId: alice.id, upstreamId: upBeta.id, createdAt: new Date() },
      { userId: alice.id, upstreamId: upAlpha.id, createdAt: new Date() },
      { userId: bob.id, upstreamId: upOther.id, createdAt: new Date() },
    ]);

    const options = await listUserUpstreamOptions(alice.id);

    expect(options).toEqual([
      { id: upAlpha.id, name: "alpha" },
      { id: upBeta.id, name: "beta" },
    ]);
  });

  it("returns an empty list for a user without grants", async () => {
    const alice = await seedUser("alice");
    await seedUpstream("alpha");

    expect(await listUserUpstreamOptions(alice.id)).toEqual([]);
  });
});
