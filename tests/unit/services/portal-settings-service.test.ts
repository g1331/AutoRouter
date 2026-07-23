// @vitest-environment node
//
// Portal settings singleton and the member key -> grant realignment it drives.
// Both run against a real libsql `:memory:` database (the same harness as
// user-key-service.test.ts) so the singleton row semantics and the rewritten
// api_key_upstreams links are verified on actual rows rather than on mocks.

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("@/lib/db", async () => {
  const { createLibsqlMemoryDbModule } = await import("../../helpers/libsql-memory-db");
  return createLibsqlMemoryDbModule();
});

import { eq } from "drizzle-orm";
import {
  db,
  users,
  apiKeys,
  upstreams,
  userUpstreams,
  apiKeyUpstreams,
  portalSettings,
} from "@/lib/db";
import { getPortalSettings, updatePortalSettings } from "@/lib/services/portal-settings-service";
import {
  alignMemberKeysToGrants,
  alignAllMemberKeysToGrants,
} from "@/lib/services/member-key-alignment";

async function seedUser(username: string, role: "admin" | "member" = "member") {
  const now = new Date();
  const [row] = await db
    .insert(users)
    .values({
      username,
      passwordHash: "hashed:pw",
      displayName: username,
      role,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

async function seedUpstream(name: string) {
  const now = new Date();
  const [row] = await db
    .insert(upstreams)
    .values({
      name,
      baseUrl: "https://example.test",
      apiKeyEncrypted: "enc:test",
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

async function grantUpstreams(userId: string, upstreamIds: string[]) {
  if (upstreamIds.length === 0) {
    return;
  }
  const now = new Date();
  await db
    .insert(userUpstreams)
    .values(upstreamIds.map((upstreamId) => ({ userId, upstreamId, createdAt: now })));
}

async function seedKey(
  name: string,
  options: {
    userId?: string | null;
    accessMode?: string;
    upstreamIds?: string[];
  } = {}
) {
  const now = new Date();
  const [row] = await db
    .insert(apiKeys)
    .values({
      keyHash: `keyhash:${name}`,
      keyPrefix: "sk-test",
      name,
      userId: options.userId ?? null,
      accessMode: options.accessMode ?? "restricted",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const upstreamIds = options.upstreamIds ?? [];
  if (upstreamIds.length > 0) {
    await db
      .insert(apiKeyUpstreams)
      .values(upstreamIds.map((upstreamId) => ({ apiKeyId: row.id, upstreamId, createdAt: now })));
  }
  return row;
}

async function linkedUpstreamIds(apiKeyId: string): Promise<string[]> {
  const rows = await db
    .select({ upstreamId: apiKeyUpstreams.upstreamId })
    .from(apiKeyUpstreams)
    .where(eq(apiKeyUpstreams.apiKeyId, apiKeyId));
  return rows.map((row) => row.upstreamId).sort();
}

beforeEach(async () => {
  await db.delete(apiKeyUpstreams);
  await db.delete(apiKeys);
  await db.delete(userUpstreams);
  await db.delete(upstreams);
  await db.delete(users);
  await db.delete(portalSettings);
});

describe("getPortalSettings", () => {
  it("creates the singleton row hidden by default", async () => {
    const settings = await getPortalSettings();

    expect(settings.exposeUpstreams).toBe(false);

    const rows = await db.select().from(portalSettings);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("default");
  });

  it("reuses the existing row instead of inserting a second one", async () => {
    await updatePortalSettings({ exposeUpstreams: true });

    const settings = await getPortalSettings();

    expect(settings.exposeUpstreams).toBe(true);
    expect(await db.select().from(portalSettings)).toHaveLength(1);
  });
});

describe("updatePortalSettings", () => {
  it("persists the exposure flag", async () => {
    const updated = await updatePortalSettings({ exposeUpstreams: true });

    expect(updated.exposeUpstreams).toBe(true);
    const [row] = await db.select().from(portalSettings);
    expect(row.exposeUpstreams).toBe(true);
  });

  it("keeps the current value when the flag is omitted", async () => {
    await updatePortalSettings({ exposeUpstreams: true });

    const updated = await updatePortalSettings({});

    expect(updated.exposeUpstreams).toBe(true);
  });

  it("realigns member keys to their grants when exposure is turned off", async () => {
    const member = await seedUser("member-a");
    const granted = await seedUpstream("granted");
    const other = await seedUpstream("other");
    await grantUpstreams(member.id, [granted.id, other.id]);
    // Picked by the member while upstreams were visible: a strict subset.
    const key = await seedKey("member key", {
      userId: member.id,
      upstreamIds: [granted.id],
    });

    await updatePortalSettings({ exposeUpstreams: true });
    await updatePortalSettings({ exposeUpstreams: false });

    expect(await linkedUpstreamIds(key.id)).toEqual([granted.id, other.id].sort());
  });

  it("leaves member keys alone while exposure stays on", async () => {
    const member = await seedUser("member-a");
    const granted = await seedUpstream("granted");
    const other = await seedUpstream("other");
    await grantUpstreams(member.id, [granted.id, other.id]);
    const key = await seedKey("member key", { userId: member.id, upstreamIds: [granted.id] });

    await updatePortalSettings({ exposeUpstreams: true });

    expect(await linkedUpstreamIds(key.id)).toEqual([granted.id]);
  });
});

describe("alignMemberKeysToGrants", () => {
  it("rewrites the upstream links to the owner's grant set", async () => {
    const member = await seedUser("member-a");
    const first = await seedUpstream("first");
    const second = await seedUpstream("second");
    const revoked = await seedUpstream("revoked");
    await grantUpstreams(member.id, [first.id, second.id]);
    const key = await seedKey("member key", { userId: member.id, upstreamIds: [revoked.id] });

    const result = await alignMemberKeysToGrants(member.id);

    expect(result).toEqual({ inspectedKeys: 1, alignedKeys: 1 });
    expect(await linkedUpstreamIds(key.id)).toEqual([first.id, second.id].sort());
  });

  it("forces the key back to restricted so it can never mean 'all upstreams'", async () => {
    const member = await seedUser("member-a");
    const granted = await seedUpstream("granted");
    await grantUpstreams(member.id, [granted.id]);
    const key = await seedKey("loose key", {
      userId: member.id,
      accessMode: "unrestricted",
      upstreamIds: [granted.id],
    });

    await alignMemberKeysToGrants(member.id);

    const row = await db.query.apiKeys.findFirst({ where: eq(apiKeys.id, key.id) });
    expect(row?.accessMode).toBe("restricted");
  });

  it("fails closed when the owner has no grants left", async () => {
    const member = await seedUser("member-a");
    const revoked = await seedUpstream("revoked");
    const key = await seedKey("member key", { userId: member.id, upstreamIds: [revoked.id] });

    await alignMemberKeysToGrants(member.id);

    expect(await linkedUpstreamIds(key.id)).toEqual([]);
    const row = await db.query.apiKeys.findFirst({ where: eq(apiKeys.id, key.id) });
    expect(row?.accessMode).toBe("restricted");
  });

  it("does not rewrite a key that already matches its grants", async () => {
    const member = await seedUser("member-a");
    const granted = await seedUpstream("granted");
    await grantUpstreams(member.id, [granted.id]);
    await seedKey("member key", { userId: member.id, upstreamIds: [granted.id] });

    const result = await alignMemberKeysToGrants(member.id);

    expect(result).toEqual({ inspectedKeys: 1, alignedKeys: 0 });
  });

  it("only drops revoked upstreams in intersect mode", async () => {
    const member = await seedUser("member-a");
    const kept = await seedUpstream("kept");
    const revoked = await seedUpstream("revoked");
    const neverPicked = await seedUpstream("never-picked");
    await grantUpstreams(member.id, [kept.id, neverPicked.id]);
    const key = await seedKey("member key", {
      userId: member.id,
      upstreamIds: [kept.id, revoked.id],
    });

    await alignMemberKeysToGrants(member.id, { mode: "intersect" });

    expect(await linkedUpstreamIds(key.id)).toEqual([kept.id]);
  });

  it("skips keys owned by an admin", async () => {
    const admin = await seedUser("admin-a", "admin");
    const granted = await seedUpstream("granted");
    const other = await seedUpstream("other");
    await grantUpstreams(admin.id, [granted.id]);
    const key = await seedKey("admin key", { userId: admin.id, upstreamIds: [other.id] });

    const result = await alignMemberKeysToGrants(admin.id);

    expect(result).toEqual({ inspectedKeys: 0, alignedKeys: 0 });
    expect(await linkedUpstreamIds(key.id)).toEqual([other.id]);
  });

  it("runs inside a caller-supplied transaction", async () => {
    const member = await seedUser("member-a");
    const granted = await seedUpstream("granted");
    await grantUpstreams(member.id, [granted.id]);
    const key = await seedKey("member key", { userId: member.id });

    await db.transaction(async (tx) => {
      await alignMemberKeysToGrants(member.id, { executor: tx });
    });

    expect(await linkedUpstreamIds(key.id)).toEqual([granted.id]);
  });
});

describe("alignAllMemberKeysToGrants", () => {
  it("aligns every member-owned key and leaves admin-owned keys untouched", async () => {
    const member = await seedUser("member-a");
    const admin = await seedUser("admin-a", "admin");
    const first = await seedUpstream("first");
    const second = await seedUpstream("second");
    await grantUpstreams(member.id, [first.id]);
    await grantUpstreams(admin.id, [first.id]);

    const memberKey = await seedKey("member key", {
      userId: member.id,
      upstreamIds: [second.id],
    });
    const adminKey = await seedKey("admin key", {
      userId: admin.id,
      upstreamIds: [second.id],
    });
    const unownedKey = await seedKey("unowned key", { upstreamIds: [second.id] });

    const result = await alignAllMemberKeysToGrants();

    expect(result).toEqual({ inspectedKeys: 1, alignedKeys: 1 });
    expect(await linkedUpstreamIds(memberKey.id)).toEqual([first.id]);
    expect(await linkedUpstreamIds(adminKey.id)).toEqual([second.id]);
    expect(await linkedUpstreamIds(unownedKey.id)).toEqual([second.id]);
  });
});
