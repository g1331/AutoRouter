// @vitest-environment node
//
// Self-service API key management tests. The ownership, upstream-subset and
// tighten-only boundaries run against a real libsql `:memory:` database (the
// same harness as user-service.test.ts) so the enforcement is verified on
// actual rows. bcrypt and Fernet are stubbed: hashing cost and encryption are
// exercised in their own suites, and the quota tracker is mocked because its
// in-memory bookkeeping is irrelevant to ownership semantics.

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("@/lib/utils/auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/utils/auth")>();
  return {
    ...actual,
    hashApiKey: vi.fn(async (key: string) => `keyhash:${key}`),
    verifyApiKey: vi.fn(async (key: string, hash: string) => hash === `keyhash:${key}`),
  };
});

vi.mock("@/lib/utils/encryption", () => ({
  encrypt: vi.fn((value: string) => `enc:${value}`),
  decrypt: vi.fn((value: string) => value.replace(/^enc:/, "")),
  EncryptionError: class EncryptionError extends Error {},
}));

vi.mock("@/lib/services/api-key-quota-tracker", () => ({
  apiKeyQuotaTracker: {
    initialize: vi.fn(async () => {}),
    getQuotaStatus: vi.fn(() => null),
    syncApiKeyFromDb: vi.fn(async () => {}),
    estimateRecoveryTime: vi.fn(async () => null),
    adjustSpending: vi.fn(),
  },
}));

vi.mock("@/lib/db", async () => {
  const { createLibsqlMemoryDbModule } = await import("../../helpers/libsql-memory-db");
  return createLibsqlMemoryDbModule();
});

import { eq } from "drizzle-orm";
import { db, users, apiKeys, upstreams, userUpstreams, apiKeyUpstreams } from "@/lib/db";
import {
  listOwnApiKeys,
  createOwnApiKey,
  updateOwnApiKey,
  deleteOwnApiKey,
  KeyOwnershipError,
  UpstreamNotAllowedError,
  SpendingRuleRelaxationError,
  AdminLockedKeyError,
} from "@/lib/services/user-key-service";

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

async function seedUpstream(name: string): Promise<{ id: string }> {
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

async function grantUpstreams(userId: string, upstreamIds: string[]): Promise<void> {
  const now = new Date();
  await db
    .insert(userUpstreams)
    .values(upstreamIds.map((upstreamId) => ({ userId, upstreamId, createdAt: now })));
}

beforeEach(async () => {
  await db.delete(apiKeyUpstreams);
  await db.delete(apiKeys);
  await db.delete(userUpstreams);
  await db.delete(upstreams);
  await db.delete(users);
});

describe("createOwnApiKey", () => {
  it("forces ownership to the caller and restricted access mode", async () => {
    const alice = await seedUser("alice");
    const upstream = await seedUpstream("granted");
    await grantUpstreams(alice.id, [upstream.id]);

    const result = await createOwnApiKey(alice.id, {
      name: "my key",
      upstreamIds: [upstream.id],
    });

    expect(result.accessMode).toBe("restricted");
    expect(result.upstreamIds).toEqual([upstream.id]);

    const row = await db.query.apiKeys.findFirst({ where: eq(apiKeys.id, result.id) });
    expect(row?.userId).toBe(alice.id);
    expect(row?.accessMode).toBe("restricted");
  });

  it("rejects upstreams outside the caller's granted set", async () => {
    const alice = await seedUser("alice");
    const granted = await seedUpstream("granted");
    const foreign = await seedUpstream("foreign");
    await grantUpstreams(alice.id, [granted.id]);

    await expect(
      createOwnApiKey(alice.id, { name: "my key", upstreamIds: [granted.id, foreign.id] })
    ).rejects.toBeInstanceOf(UpstreamNotAllowedError);

    const rows = await db.query.apiKeys.findMany();
    expect(rows).toHaveLength(0);
  });

  it("rejects any upstream when the user has no grants at all", async () => {
    const alice = await seedUser("alice");
    const upstream = await seedUpstream("ungranted");

    await expect(
      createOwnApiKey(alice.id, { name: "my key", upstreamIds: [upstream.id] })
    ).rejects.toBeInstanceOf(UpstreamNotAllowedError);
  });
});

describe("updateOwnApiKey", () => {
  it("rejects operating on another user's key without revealing it exists", async () => {
    const alice = await seedUser("alice");
    const bob = await seedUser("bob");
    const upstream = await seedUpstream("granted");
    await grantUpstreams(bob.id, [upstream.id]);
    const bobKey = await createOwnApiKey(bob.id, { name: "bob key", upstreamIds: [upstream.id] });

    await expect(updateOwnApiKey(alice.id, bobKey.id, { name: "stolen" })).rejects.toBeInstanceOf(
      KeyOwnershipError
    );

    const row = await db.query.apiKeys.findFirst({ where: eq(apiKeys.id, bobKey.id) });
    expect(row?.name).toBe("bob key");
  });

  it("rejects claiming an ownerless key", async () => {
    const alice = await seedUser("alice");
    const now = new Date();
    const [orphan] = await db
      .insert(apiKeys)
      .values({
        keyHash: "keyhash:orphan",
        keyPrefix: "sk-auto-orph",
        name: "orphan",
        userId: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await expect(updateOwnApiKey(alice.id, orphan.id, { name: "claimed" })).rejects.toBeInstanceOf(
      KeyOwnershipError
    );
  });

  it("rejects widening the upstream set beyond the granted subset", async () => {
    const alice = await seedUser("alice");
    const granted = await seedUpstream("granted");
    const foreign = await seedUpstream("foreign");
    await grantUpstreams(alice.id, [granted.id]);
    const key = await createOwnApiKey(alice.id, { name: "my key", upstreamIds: [granted.id] });

    await expect(
      updateOwnApiKey(alice.id, key.id, { upstreamIds: [granted.id, foreign.id] })
    ).rejects.toBeInstanceOf(UpstreamNotAllowedError);
  });

  it("allows tightening an existing spending limit", async () => {
    const alice = await seedUser("alice");
    const upstream = await seedUpstream("granted");
    await grantUpstreams(alice.id, [upstream.id]);
    const key = await createOwnApiKey(alice.id, {
      name: "my key",
      upstreamIds: [upstream.id],
      spendingRules: [{ period_type: "daily", limit: 10 }],
    });

    const updated = await updateOwnApiKey(alice.id, key.id, {
      spendingRules: [{ period_type: "daily", limit: 5 }],
    });

    expect(updated.spendingRules).toEqual([{ period_type: "daily", limit: 5 }]);
  });

  it("rejects raising an existing spending limit", async () => {
    const alice = await seedUser("alice");
    const upstream = await seedUpstream("granted");
    await grantUpstreams(alice.id, [upstream.id]);
    const key = await createOwnApiKey(alice.id, {
      name: "my key",
      upstreamIds: [upstream.id],
      spendingRules: [{ period_type: "daily", limit: 10 }],
    });

    await expect(
      updateOwnApiKey(alice.id, key.id, { spendingRules: [{ period_type: "daily", limit: 20 }] })
    ).rejects.toBeInstanceOf(SpendingRuleRelaxationError);
  });

  it("rejects clearing a non-empty rule set", async () => {
    const alice = await seedUser("alice");
    const upstream = await seedUpstream("granted");
    await grantUpstreams(alice.id, [upstream.id]);
    const key = await createOwnApiKey(alice.id, {
      name: "my key",
      upstreamIds: [upstream.id],
      spendingRules: [{ period_type: "daily", limit: 10 }],
    });

    await expect(updateOwnApiKey(alice.id, key.id, { spendingRules: null })).rejects.toBeInstanceOf(
      SpendingRuleRelaxationError
    );
    await expect(updateOwnApiKey(alice.id, key.id, { spendingRules: [] })).rejects.toBeInstanceOf(
      SpendingRuleRelaxationError
    );
  });

  it("rejects dropping one of several existing rules", async () => {
    const alice = await seedUser("alice");
    const upstream = await seedUpstream("granted");
    await grantUpstreams(alice.id, [upstream.id]);
    const key = await createOwnApiKey(alice.id, {
      name: "my key",
      upstreamIds: [upstream.id],
      spendingRules: [
        { period_type: "daily", limit: 10 },
        { period_type: "monthly", limit: 100 },
      ],
    });

    await expect(
      updateOwnApiKey(alice.id, key.id, { spendingRules: [{ period_type: "daily", limit: 10 }] })
    ).rejects.toBeInstanceOf(SpendingRuleRelaxationError);
  });

  it("allows adding rules where none existed and toggling active state", async () => {
    const alice = await seedUser("alice");
    const upstream = await seedUpstream("granted");
    await grantUpstreams(alice.id, [upstream.id]);
    const key = await createOwnApiKey(alice.id, { name: "my key", upstreamIds: [upstream.id] });

    const withRules = await updateOwnApiKey(alice.id, key.id, {
      spendingRules: [{ period_type: "daily", limit: 3 }],
      isActive: false,
    });

    expect(withRules.spendingRules).toEqual([{ period_type: "daily", limit: 3 }]);
    expect(withRules.isActive).toBe(false);
  });

  it("lets the member re-enable a key they disabled themselves", async () => {
    const alice = await seedUser("alice");
    const upstream = await seedUpstream("granted");
    await grantUpstreams(alice.id, [upstream.id]);
    const key = await createOwnApiKey(alice.id, { name: "my key", upstreamIds: [upstream.id] });

    await updateOwnApiKey(alice.id, key.id, { isActive: false });
    const reenabled = await updateOwnApiKey(alice.id, key.id, { isActive: true });

    expect(reenabled.isActive).toBe(true);
    const row = await db.query.apiKeys.findFirst({ where: eq(apiKeys.id, key.id) });
    // A member-initiated disable never sets the admin lock.
    expect(row?.disabledByAdmin).toBe(false);
  });

  it("refuses to re-enable a key an admin disabled and leaves it inactive", async () => {
    const alice = await seedUser("alice");
    const upstream = await seedUpstream("granted");
    await grantUpstreams(alice.id, [upstream.id]);
    const key = await createOwnApiKey(alice.id, { name: "my key", upstreamIds: [upstream.id] });

    // Simulate an admin disabling the key (sets the lock alongside is_active).
    await db
      .update(apiKeys)
      .set({ isActive: false, disabledByAdmin: true })
      .where(eq(apiKeys.id, key.id));

    await expect(updateOwnApiKey(alice.id, key.id, { isActive: true })).rejects.toBeInstanceOf(
      AdminLockedKeyError
    );

    const row = await db.query.apiKeys.findFirst({ where: eq(apiKeys.id, key.id) });
    expect(row?.isActive).toBe(false);
    expect(row?.disabledByAdmin).toBe(true);
  });

  it("still lets the member edit other fields of an admin-disabled key without lifting the lock", async () => {
    const alice = await seedUser("alice");
    const upstream = await seedUpstream("granted");
    await grantUpstreams(alice.id, [upstream.id]);
    const key = await createOwnApiKey(alice.id, { name: "my key", upstreamIds: [upstream.id] });

    await db
      .update(apiKeys)
      .set({ isActive: false, disabledByAdmin: true })
      .where(eq(apiKeys.id, key.id));

    const updated = await updateOwnApiKey(alice.id, key.id, { name: "renamed" });

    expect(updated.name).toBe("renamed");
    expect(updated.isActive).toBe(false);
    const row = await db.query.apiKeys.findFirst({ where: eq(apiKeys.id, key.id) });
    expect(row?.disabledByAdmin).toBe(true);
  });
});

describe("deleteOwnApiKey", () => {
  it("rejects deleting another user's key and leaves it intact", async () => {
    const alice = await seedUser("alice");
    const bob = await seedUser("bob");
    const upstream = await seedUpstream("granted");
    await grantUpstreams(bob.id, [upstream.id]);
    const bobKey = await createOwnApiKey(bob.id, { name: "bob key", upstreamIds: [upstream.id] });

    await expect(deleteOwnApiKey(alice.id, bobKey.id)).rejects.toBeInstanceOf(KeyOwnershipError);

    const row = await db.query.apiKeys.findFirst({ where: eq(apiKeys.id, bobKey.id) });
    expect(row).toBeDefined();
  });

  it("deletes the caller's own key", async () => {
    const alice = await seedUser("alice");
    const upstream = await seedUpstream("granted");
    await grantUpstreams(alice.id, [upstream.id]);
    const key = await createOwnApiKey(alice.id, { name: "my key", upstreamIds: [upstream.id] });

    await deleteOwnApiKey(alice.id, key.id);

    const row = await db.query.apiKeys.findFirst({ where: eq(apiKeys.id, key.id) });
    expect(row).toBeUndefined();
  });
});

describe("listOwnApiKeys", () => {
  it("lists only the caller's keys", async () => {
    const alice = await seedUser("alice");
    const bob = await seedUser("bob");
    const upstream = await seedUpstream("granted");
    await grantUpstreams(alice.id, [upstream.id]);
    await grantUpstreams(bob.id, [upstream.id]);
    await createOwnApiKey(alice.id, { name: "alice key", upstreamIds: [upstream.id] });
    await createOwnApiKey(bob.id, { name: "bob key", upstreamIds: [upstream.id] });

    const result = await listOwnApiKeys(alice.id);

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("alice key");
  });
});
