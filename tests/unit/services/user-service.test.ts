// @vitest-environment node
//
// User management service tests. These exercise the real service logic against
// a real libsql `:memory:` database — the same SQLite stack AutoRouter uses at
// runtime (`@libsql/client` + `drizzle-orm/libsql`) — so aggregation, the
// last-active-admin lock, unique constraints, and the delete-detaches-keys
// transaction are verified against an actual database rather than mocked call
// sequences. This covers the SQLite dbType end to end; the PostgreSQL dbType
// shares the same drizzle API and a mirrored schema, and the only dialect-
// specific surface (the unique-violation error text) is covered explicitly by
// the isUniqueViolation cases below. Password hashing is mocked to a fast stub
// since bcrypt cost is irrelevant here and exercised in auth.test.ts.

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("@/lib/utils/auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/utils/auth")>();
  return {
    ...actual,
    hashPassword: vi.fn(async (password: string) => `hashed:${password}`),
    verifyPassword: vi.fn(async (password: string, hash: string) => hash === `hashed:${password}`),
  };
});

vi.mock("@/lib/db", async () => {
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  const { is } = await import("drizzle-orm");
  const { SQLiteTable, getTableConfig } = await import("drizzle-orm/sqlite-core");
  const fs = await import("fs");
  const pathMod = await import("path");
  const schema = await import("@/lib/db/schema-sqlite");

  // A bare ":memory:" libsql database is scoped to a single connection, so the
  // migration connection and drizzle's query connection would see different
  // empty databases. A shared-cache in-memory URI gives every connection in
  // this process the same backing store while staying file-free.
  const client = createClient({ url: "file::memory:?cache=shared" });

  // Apply the drizzle-sqlite migrations statement by statement. drizzle's libsql
  // migrator instead batches every fragment including the empty pieces left by
  // `--> statement-breakpoint` splitting, which makes libsql raise a spurious
  // "not an error"; splitting and dropping empties ourselves avoids that.
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

  // The drizzle-sqlite migrations have drifted from schema-sqlite: some columns
  // (for example upstreams.official_website_url) are recorded in the snapshot
  // metadata but no .sql migration ever adds them, and some tables in the schema
  // are never created by any .sql migration at all. The user-management tests
  // only touch users / api_keys / upstreams / user_upstreams, which the
  // migrations do create. Reconcile every migrated table to schema-sqlite by
  // adding any missing columns (added nullable, which is enough to insert and
  // read rows in tests), and skip tables the migrations never created.
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

import { eq } from "drizzle-orm";
import { db, users, apiKeys, upstreams, userUpstreams } from "@/lib/db";
import {
  createUser,
  listUsers,
  getUserById,
  updateUser,
  changeUsername,
  resetPassword,
  changeOwnPassword,
  deleteUser,
  assignApiKeyOwnership,
  revokeApiKeyOwnership,
  getUserUpstreams,
  setUserUpstreams,
  isUniqueViolation,
  isForeignKeyViolation,
  UserNotFoundError,
  UsernameConflictError,
  WeakPasswordError,
  LastActiveAdminError,
  ApiKeyOwnershipError,
  UpstreamAssignmentError,
  InvalidUsernameError,
  InvalidCredentialsError,
} from "@/lib/services/user-service";

const NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000";

async function seedApiKey(overrides: {
  name?: string;
  keyHash?: string;
  keyPrefix?: string;
  userId?: string | null;
}): Promise<{ id: string }> {
  const now = new Date();
  const suffix = overrides.keyHash ?? overrides.name ?? Math.random().toString(36).slice(2);
  const [row] = await db
    .insert(apiKeys)
    .values({
      keyHash: `hash-${suffix}`,
      keyPrefix: "sk-auto-test",
      name: overrides.name ?? "key",
      userId: overrides.userId ?? null,
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
      apiKeyEncrypted: "encrypted:test",
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

beforeEach(async () => {
  await db.delete(userUpstreams);
  await db.delete(apiKeys);
  await db.delete(upstreams);
  await db.delete(users);
});

describe("user-service", () => {
  describe("createUser", () => {
    it("creates a member user, normalizing username and trimming display name", async () => {
      const user = await createUser({
        username: "  Alice  ",
        password: "password123",
        displayName: "  Alice Smith  ",
      });

      expect(user.username).toBe("alice");
      expect(user.displayName).toBe("Alice Smith");
      expect(user.role).toBe("member");
      expect(user.isActive).toBe(true);
      expect(user.apiKeyCount).toBe(0);

      const [persisted] = await db.select().from(users).where(eq(users.id, user.id));
      expect(persisted.username).toBe("alice");
      expect(persisted.passwordHash).toBe("hashed:password123");
    });

    it("creates an admin user when role is admin", async () => {
      const user = await createUser({
        username: "root",
        password: "password123",
        displayName: "Root",
        role: "admin",
      });
      expect(user.role).toBe("admin");
    });

    it("rejects a password shorter than the minimum length", async () => {
      await expect(
        createUser({ username: "bob", password: "short", displayName: "Bob" })
      ).rejects.toBeInstanceOf(WeakPasswordError);
    });

    it("rejects a duplicate username case-insensitively", async () => {
      await createUser({ username: "Alice", password: "password123", displayName: "Alice" });
      await expect(
        createUser({ username: "alice", password: "password123", displayName: "Other" })
      ).rejects.toBeInstanceOf(UsernameConflictError);
    });

    it("rejects a whitespace-only username that normalizes to empty", async () => {
      await expect(
        createUser({ username: "   ", password: "password123", displayName: "Blank" })
      ).rejects.toBeInstanceOf(InvalidUsernameError);
    });
  });

  describe("listUsers", () => {
    it("paginates and aggregates owned API key counts", async () => {
      const a = await createUser({ username: "a", password: "password123", displayName: "A" });
      const b = await createUser({ username: "b", password: "password123", displayName: "B" });
      await createUser({ username: "c", password: "password123", displayName: "C" });

      await seedApiKey({ name: "k1", userId: a.id });
      await seedApiKey({ name: "k2", userId: a.id });
      await seedApiKey({ name: "k3", userId: b.id });
      await seedApiKey({ name: "orphan", userId: null });

      const page1 = await listUsers(1, 2);
      expect(page1.total).toBe(3);
      expect(page1.totalPages).toBe(2);
      expect(page1.items).toHaveLength(2);

      const page2 = await listUsers(2, 2);
      expect(page2.items).toHaveLength(1);

      const all = await listUsers(1, 50);
      const counts = Object.fromEntries(all.items.map((u) => [u.username, u.apiKeyCount]));
      expect(counts.a).toBe(2);
      expect(counts.b).toBe(1);
      expect(counts.c).toBe(0);
    });

    it("reports the table-wide active admin total independent of the page", async () => {
      await createUser({
        username: "admin1",
        password: "password123",
        displayName: "A1",
        role: "admin",
      });
      await createUser({
        username: "admin2",
        password: "password123",
        displayName: "A2",
        role: "admin",
      });
      const inactive = await createUser({
        username: "admin3",
        password: "password123",
        displayName: "A3",
        role: "admin",
      });
      await updateUser(inactive.id, { isActive: false });
      await createUser({ username: "member1", password: "password123", displayName: "M1" });

      // Page size 1 returns a single item, but the active admin total reflects
      // every active admin in the table (admin1 + admin2; admin3 is inactive).
      const page = await listUsers(1, 1);
      expect(page.items).toHaveLength(1);
      expect(page.activeAdminTotal).toBe(2);
    });
  });

  describe("getUserById", () => {
    it("returns the user with its owned key count", async () => {
      const u = await createUser({ username: "u", password: "password123", displayName: "U" });
      await seedApiKey({ name: "k", userId: u.id });

      const fetched = await getUserById(u.id);
      expect(fetched?.id).toBe(u.id);
      expect(fetched?.apiKeyCount).toBe(1);
    });

    it("returns null for a missing user", async () => {
      expect(await getUserById(NONEXISTENT_ID)).toBeNull();
    });
  });

  describe("updateUser", () => {
    it("updates the display name", async () => {
      const u = await createUser({ username: "u", password: "password123", displayName: "Old" });
      const updated = await updateUser(u.id, { displayName: "New" });
      expect(updated.displayName).toBe("New");
    });

    it("demotes an admin when another active admin remains", async () => {
      await createUser({
        username: "admin1",
        password: "password123",
        displayName: "A1",
        role: "admin",
      });
      const admin2 = await createUser({
        username: "admin2",
        password: "password123",
        displayName: "A2",
        role: "admin",
      });
      const updated = await updateUser(admin2.id, { role: "member" });
      expect(updated.role).toBe("member");
    });

    it("refuses to demote the last active admin", async () => {
      const admin = await createUser({
        username: "admin",
        password: "password123",
        displayName: "Admin",
        role: "admin",
      });
      await createUser({
        username: "m",
        password: "password123",
        displayName: "M",
        role: "member",
      });
      await expect(updateUser(admin.id, { role: "member" })).rejects.toBeInstanceOf(
        LastActiveAdminError
      );
    });

    it("refuses to deactivate the last active admin", async () => {
      const admin = await createUser({
        username: "admin",
        password: "password123",
        displayName: "Admin",
        role: "admin",
      });
      await expect(updateUser(admin.id, { isActive: false })).rejects.toBeInstanceOf(
        LastActiveAdminError
      );
    });

    it("deactivates a non-last admin", async () => {
      await createUser({
        username: "admin1",
        password: "password123",
        displayName: "A1",
        role: "admin",
      });
      const admin2 = await createUser({
        username: "admin2",
        password: "password123",
        displayName: "A2",
        role: "admin",
      });
      const updated = await updateUser(admin2.id, { isActive: false });
      expect(updated.isActive).toBe(false);
    });

    it("throws for a missing user", async () => {
      await expect(updateUser(NONEXISTENT_ID, { displayName: "X" })).rejects.toBeInstanceOf(
        UserNotFoundError
      );
    });
  });

  describe("changeUsername", () => {
    it("changes and normalizes the username", async () => {
      const u = await createUser({ username: "old", password: "password123", displayName: "U" });
      const updated = await changeUsername(u.id, "  NewName  ");
      expect(updated.username).toBe("newname");
    });

    it("allows setting the username to its own current value", async () => {
      const u = await createUser({ username: "same", password: "password123", displayName: "U" });
      const updated = await changeUsername(u.id, "SAME");
      expect(updated.username).toBe("same");
    });

    it("rejects a conflicting username", async () => {
      await createUser({ username: "taken", password: "password123", displayName: "T" });
      const u = await createUser({ username: "other", password: "password123", displayName: "O" });
      await expect(changeUsername(u.id, "taken")).rejects.toBeInstanceOf(UsernameConflictError);
    });

    it("throws for a missing user", async () => {
      await expect(changeUsername(NONEXISTENT_ID, "x")).rejects.toBeInstanceOf(UserNotFoundError);
    });

    it("reports a missing user even when the requested name is already taken", async () => {
      await createUser({ username: "taken", password: "password123", displayName: "T" });
      // The target id does not exist; the missing-user check must win over the
      // name-conflict pre-check so callers get a 404 rather than a misleading 409.
      await expect(changeUsername(NONEXISTENT_ID, "taken")).rejects.toBeInstanceOf(
        UserNotFoundError
      );
    });

    it("rejects a whitespace-only username that normalizes to empty", async () => {
      const u = await createUser({ username: "u", password: "password123", displayName: "U" });
      await expect(changeUsername(u.id, "   ")).rejects.toBeInstanceOf(InvalidUsernameError);
    });
  });

  describe("resetPassword", () => {
    it("updates the password hash", async () => {
      const u = await createUser({ username: "u", password: "password123", displayName: "U" });
      await resetPassword(u.id, "newpassword123");
      const [persisted] = await db.select().from(users).where(eq(users.id, u.id));
      expect(persisted.passwordHash).toBe("hashed:newpassword123");
    });

    it("rejects a weak password", async () => {
      const u = await createUser({ username: "u", password: "password123", displayName: "U" });
      await expect(resetPassword(u.id, "short")).rejects.toBeInstanceOf(WeakPasswordError);
    });

    it("throws for a missing user", async () => {
      await expect(resetPassword(NONEXISTENT_ID, "newpassword123")).rejects.toBeInstanceOf(
        UserNotFoundError
      );
    });
  });

  describe("changeOwnPassword", () => {
    it("updates the hash after verifying the current password", async () => {
      const u = await createUser({ username: "u", password: "password123", displayName: "U" });
      await changeOwnPassword(u.id, "password123", "newpassword123");
      const [persisted] = await db.select().from(users).where(eq(users.id, u.id));
      expect(persisted.passwordHash).toBe("hashed:newpassword123");
    });

    it("rejects a wrong current password and keeps the stored hash", async () => {
      const u = await createUser({ username: "u", password: "password123", displayName: "U" });
      await expect(
        changeOwnPassword(u.id, "wrongpassword", "newpassword123")
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
      const [persisted] = await db.select().from(users).where(eq(users.id, u.id));
      expect(persisted.passwordHash).toBe("hashed:password123");
    });

    it("rejects a weak new password", async () => {
      const u = await createUser({ username: "u", password: "password123", displayName: "U" });
      await expect(changeOwnPassword(u.id, "password123", "short")).rejects.toBeInstanceOf(
        WeakPasswordError
      );
    });

    it("throws for a missing user", async () => {
      await expect(
        changeOwnPassword(NONEXISTENT_ID, "password123", "newpassword123")
      ).rejects.toBeInstanceOf(UserNotFoundError);
    });
  });

  describe("deleteUser", () => {
    it("deletes the user and detaches owned API keys in one transaction", async () => {
      const u = await createUser({ username: "u", password: "password123", displayName: "U" });
      const key = await seedApiKey({ name: "k", userId: u.id });

      await deleteUser(u.id);

      const remainingUser = await db.select().from(users).where(eq(users.id, u.id));
      expect(remainingUser).toHaveLength(0);

      const [detachedKey] = await db.select().from(apiKeys).where(eq(apiKeys.id, key.id));
      expect(detachedKey).toBeDefined();
      expect(detachedKey.userId).toBeNull();
    });

    it("refuses to delete the last active admin", async () => {
      const admin = await createUser({
        username: "admin",
        password: "password123",
        displayName: "Admin",
        role: "admin",
      });
      await expect(deleteUser(admin.id)).rejects.toBeInstanceOf(LastActiveAdminError);
    });

    it("deletes a non-last admin", async () => {
      await createUser({
        username: "admin1",
        password: "password123",
        displayName: "A1",
        role: "admin",
      });
      const admin2 = await createUser({
        username: "admin2",
        password: "password123",
        displayName: "A2",
        role: "admin",
      });
      await deleteUser(admin2.id);
      expect(await getUserById(admin2.id)).toBeNull();
    });

    it("throws for a missing user", async () => {
      await expect(deleteUser(NONEXISTENT_ID)).rejects.toBeInstanceOf(UserNotFoundError);
    });
  });

  describe("assignApiKeyOwnership / revokeApiKeyOwnership", () => {
    it("assigns ownership to an existing user", async () => {
      const u = await createUser({ username: "u", password: "password123", displayName: "U" });
      const key = await seedApiKey({ name: "k", userId: null });

      await assignApiKeyOwnership(key.id, u.id);

      const [persisted] = await db.select().from(apiKeys).where(eq(apiKeys.id, key.id));
      expect(persisted.userId).toBe(u.id);
    });

    it("rejects assignment to a missing user", async () => {
      const key = await seedApiKey({ name: "k", userId: null });
      await expect(assignApiKeyOwnership(key.id, NONEXISTENT_ID)).rejects.toBeInstanceOf(
        UserNotFoundError
      );
    });

    it("rejects assignment of a missing key", async () => {
      const u = await createUser({ username: "u", password: "password123", displayName: "U" });
      await expect(assignApiKeyOwnership(NONEXISTENT_ID, u.id)).rejects.toBeInstanceOf(
        ApiKeyOwnershipError
      );
    });

    it("revokes ownership", async () => {
      const u = await createUser({ username: "u", password: "password123", displayName: "U" });
      const key = await seedApiKey({ name: "k", userId: u.id });

      await revokeApiKeyOwnership(key.id);

      const [persisted] = await db.select().from(apiKeys).where(eq(apiKeys.id, key.id));
      expect(persisted.userId).toBeNull();
    });

    it("rejects revoking a missing key", async () => {
      await expect(revokeApiKeyOwnership(NONEXISTENT_ID)).rejects.toBeInstanceOf(
        ApiKeyOwnershipError
      );
    });
  });

  describe("getUserUpstreams / setUserUpstreams", () => {
    it("replaces the available upstream set and reads it back", async () => {
      const u = await createUser({ username: "u", password: "password123", displayName: "U" });
      const up1 = await seedUpstream("up1");
      const up2 = await seedUpstream("up2");

      const result = await setUserUpstreams(u.id, [up1.id, up2.id]);
      expect(new Set(result)).toEqual(new Set([up1.id, up2.id]));

      const persisted = await getUserUpstreams(u.id);
      expect(new Set(persisted)).toEqual(new Set([up1.id, up2.id]));
    });

    it("deduplicates repeated upstream ids", async () => {
      const u = await createUser({ username: "u", password: "password123", displayName: "U" });
      const up1 = await seedUpstream("up1");

      const result = await setUserUpstreams(u.id, [up1.id, up1.id]);
      expect(result).toHaveLength(1);

      const persisted = await getUserUpstreams(u.id);
      expect(persisted).toEqual([up1.id]);
    });

    it("clears the set when given an empty array", async () => {
      const u = await createUser({ username: "u", password: "password123", displayName: "U" });
      const up1 = await seedUpstream("up1");
      await setUserUpstreams(u.id, [up1.id]);

      await setUserUpstreams(u.id, []);
      expect(await getUserUpstreams(u.id)).toEqual([]);
    });

    it("rejects a missing user", async () => {
      const up1 = await seedUpstream("up1");
      await expect(setUserUpstreams(NONEXISTENT_ID, [up1.id])).rejects.toBeInstanceOf(
        UserNotFoundError
      );
    });

    it("rejects unknown upstream ids", async () => {
      const u = await createUser({ username: "u", password: "password123", displayName: "U" });
      await expect(setUserUpstreams(u.id, [NONEXISTENT_ID])).rejects.toBeInstanceOf(
        UpstreamAssignmentError
      );
    });
  });

  describe("isUniqueViolation", () => {
    it("recognizes the PostgreSQL unique violation message", () => {
      expect(isUniqueViolation(new Error("duplicate key value violates unique constraint"))).toBe(
        true
      );
    });

    it("recognizes the SQLite unique violation message", () => {
      expect(isUniqueViolation(new Error("UNIQUE constraint failed: users.username"))).toBe(true);
    });

    it("returns false for unrelated errors", () => {
      expect(isUniqueViolation(new Error("connection reset"))).toBe(false);
    });
  });

  describe("isForeignKeyViolation", () => {
    it("recognizes the PostgreSQL foreign key violation message", () => {
      expect(isForeignKeyViolation(new Error("insert violates foreign key constraint"))).toBe(true);
    });

    it("recognizes the SQLite foreign key violation message", () => {
      expect(isForeignKeyViolation(new Error("FOREIGN KEY constraint failed"))).toBe(true);
    });

    it("returns false for unrelated errors", () => {
      expect(isForeignKeyViolation(new Error("connection reset"))).toBe(false);
    });
  });
});
