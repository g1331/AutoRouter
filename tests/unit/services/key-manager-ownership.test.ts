// @vitest-environment node
//
// Ownership scoping for the admin key list. These run against a real libsql
// `:memory:` database so the `unowned` filter and the owner-name assembly are
// verified as actual SQL (NULL semantics included) rather than as mocked call
// sequences — the mocked suite in key-manager.test.ts covers the rest of the
// service.

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("@/lib/utils/encryption", () => ({
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
  decrypt: vi.fn((value: string) => value.replace(/^encrypted:/, "")),
  EncryptionError: class EncryptionError extends Error {},
}));

vi.mock("@/lib/services/api-key-quota-tracker", () => ({
  apiKeyQuotaTracker: {
    initialize: vi.fn(async () => {}),
    getQuotaStatus: vi.fn(() => null),
    estimateRecoveryTime: vi.fn(async () => null),
    syncApiKeyFromDb: vi.fn(async () => {}),
  },
}));

vi.mock("@/lib/db", async () => {
  const { createLibsqlMemoryDbModule } = await import("../../helpers/libsql-memory-db");
  return createLibsqlMemoryDbModule();
});

import { db, users, apiKeys, apiKeyUpstreams, upstreams } from "@/lib/db";
import { listApiKeys, getApiKeyById } from "@/lib/services/key-manager";

async function seedUser(displayName: string, role: "admin" | "member"): Promise<{ id: string }> {
  const now = new Date();
  const [row] = await db
    .insert(users)
    .values({
      username: displayName.toLowerCase().replace(/\s+/g, "-"),
      passwordHash: "hashed",
      displayName,
      role,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

async function seedKey(name: string, userId: string | null): Promise<{ id: string }> {
  const now = new Date();
  const [row] = await db
    .insert(apiKeys)
    .values({
      keyHash: `hash-${name}`,
      keyPrefix: "sk-auto-test",
      name,
      userId,
      accessMode: "unrestricted",
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

beforeEach(async () => {
  await db.delete(apiKeyUpstreams);
  await db.delete(apiKeys);
  await db.delete(upstreams);
  await db.delete(users);
});

describe("listApiKeys ownership scoping", () => {
  it("keeps only unowned keys when the unowned filter is set", async () => {
    const member = await seedUser("Alice", "member");
    await seedKey("gateway-key", null);
    await seedKey("alice-key", member.id);

    const result = await listApiKeys(1, 20, { unowned: true });

    expect(result.total).toBe(1);
    expect(result.items.map((item) => item.name)).toEqual(["gateway-key"]);
    expect(result.items[0].userId).toBeNull();
    expect(result.items[0].userName).toBeNull();
  });

  it("lists owned and unowned keys together without the filter, labelling owners", async () => {
    const member = await seedUser("Alice", "member");
    const admin = await seedUser("Root", "admin");
    await seedKey("gateway-key", null);
    await seedKey("alice-key", member.id);
    await seedKey("root-key", admin.id);

    const result = await listApiKeys(1, 20, {});
    const byName = new Map(result.items.map((item) => [item.name, item]));

    expect(result.total).toBe(3);
    expect(byName.get("alice-key")).toMatchObject({ userId: member.id, userName: "Alice" });
    expect(byName.get("root-key")).toMatchObject({ userId: admin.id, userName: "Root" });
    expect(byName.get("gateway-key")).toMatchObject({ userId: null, userName: null });
  });

  it("scopes to a single owner when userId is set, ignoring the unowned filter", async () => {
    const member = await seedUser("Alice", "member");
    await seedKey("gateway-key", null);
    await seedKey("alice-key", member.id);

    const result = await listApiKeys(1, 20, { userId: member.id, unowned: true });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ name: "alice-key", userName: "Alice" });
  });

  it("combines the unowned filter with a name search", async () => {
    const member = await seedUser("Alice", "member");
    await seedKey("prod-gateway", null);
    await seedKey("dev-gateway", null);
    await seedKey("prod-alice", member.id);

    const result = await listApiKeys(1, 20, { unowned: true, search: "prod" });

    expect(result.items.map((item) => item.name)).toEqual(["prod-gateway"]);
  });

  it("resolves the owner name for a single key lookup", async () => {
    const member = await seedUser("Alice", "member");
    const owned = await seedKey("alice-key", member.id);
    const unowned = await seedKey("gateway-key", null);

    await expect(getApiKeyById(owned.id)).resolves.toMatchObject({
      userId: member.id,
      userName: "Alice",
    });
    await expect(getApiKeyById(unowned.id)).resolves.toMatchObject({
      userId: null,
      userName: null,
    });
  });
});
