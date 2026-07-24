import { and, count, desc, eq, inArray, ne, or } from "drizzle-orm";
import { db, users, apiKeys, userUpstreams, upstreams, type User } from "../db";
import { caseInsensitiveLike } from "../db/sql-helpers";
import { hashPassword, isPasswordStrong, normalizeUsername, verifyPassword } from "../utils/auth";
import { getUsersMonthUsage } from "./user-data-service";
import { alignMemberKeysToGrants } from "./member-key-alignment";
import { getPortalSettings } from "./portal-settings-service";
import { createLogger } from "../utils/logger";

const log = createLogger("user-service");

export type UserRole = "admin" | "member";

/**
 * Raised when a user lookup cannot find a persisted record.
 */
export class UserNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserNotFoundError";
  }
}

/**
 * Raised when a username collides with an existing (case-insensitive) account.
 */
export class UsernameConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsernameConflictError";
  }
}

/**
 * Raised when a password fails the minimum strength requirement.
 */
export class WeakPasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeakPasswordError";
  }
}

/**
 * Raised when an operation would deactivate, delete, or demote the last active
 * admin, which would lock every admin out of the management surface.
 */
export class LastActiveAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LastActiveAdminError";
  }
}

/**
 * Raised when an API key ownership assignment references a missing key.
 */
export class ApiKeyOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiKeyOwnershipError";
  }
}

/**
 * Raised when an available-upstream assignment references missing upstreams.
 */
export class UpstreamAssignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamAssignmentError";
  }
}

/**
 * Raised when a username is empty after normalization. A username consisting
 * only of whitespace passes a raw `min(1)` length check but normalizes to an
 * empty string, which would violate the "username MUST be non-empty" invariant.
 */
export class InvalidUsernameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUsernameError";
  }
}

/**
 * Raised when the self-service password change is given a wrong current
 * password. Distinct from WeakPasswordError so the route can keep the two
 * rejection reasons apart without leaking which credential check failed
 * beyond what the caller already knows.
 */
export class InvalidCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCredentialsError";
  }
}

function normalizeRole(role: string | null | undefined): UserRole {
  return role === "admin" ? "admin" : "member";
}

/**
 * Detect a unique-constraint violation across PostgreSQL and SQLite. PostgreSQL
 * raises "duplicate key value violates unique constraint"; SQLite raises
 * "UNIQUE constraint failed". A pre-check narrows the common case, but a
 * concurrent insert can still race past it, so callers also catch this.
 */
export function isUniqueViolation(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return message.includes("unique") || message.includes("duplicate");
}

/**
 * Detect a foreign-key-constraint violation across PostgreSQL and SQLite.
 * PostgreSQL raises "violates foreign key constraint"; SQLite raises "FOREIGN
 * KEY constraint failed". An upstream validated moments earlier can still be
 * deleted concurrently before the dependent insert lands, so callers catch this.
 */
export function isForeignKeyViolation(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return message.includes("foreign key");
}

export interface UserCreateInput {
  username: string;
  password: string;
  displayName: string;
  role?: UserRole;
}

export interface UserUpdateInput {
  displayName?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface UserListItem {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  apiKeyCount: number;
  /** Month-to-date request count over the request_logs user_id snapshot. */
  monthRequests: number;
  /** Month-to-date billed cost in USD, same accounting basis as getUserOverview. */
  monthCostUsd: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedUsers {
  items: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /**
   * Count of active admins across the entire users table, not just the current
   * page. The admin console uses this to decide whether a row is the last active
   * admin even when admins span multiple pages; the service still enforces the
   * invariant authoritatively, so this is a display-only aid.
   */
  activeAdminTotal: number;
}

function toListItem(
  row: User,
  apiKeyCount: number,
  monthUsage?: { requests: number; costUsd: number }
): UserListItem {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: normalizeRole(row.role),
    isActive: row.isActive,
    apiKeyCount,
    monthRequests: monthUsage?.requests ?? 0,
    monthCostUsd: monthUsage?.costUsd ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Create a new user. The username is normalized (trimmed, lowercased) and must
 * be unique case-insensitively; the password is bcrypt-hashed and never stored
 * in plaintext.
 *
 * @param input - The new user's username, password, display name, and role
 * @returns The created user as a list item (with zero owned keys)
 */
export async function createUser(input: UserCreateInput): Promise<UserListItem> {
  const username = normalizeUsername(input.username);
  if (!username) {
    throw new InvalidUsernameError("Username must not be empty");
  }
  if (!isPasswordStrong(input.password)) {
    throw new WeakPasswordError("Password does not meet the minimum length requirement");
  }
  const displayName = input.displayName.trim();
  const role = normalizeRole(input.role);
  const now = new Date();

  // Friendly pre-check; the unique index is the authoritative guard against a
  // concurrent insert that races past this lookup.
  const existing = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (existing) {
    throw new UsernameConflictError(`Username already exists: ${username}`);
  }

  const passwordHash = await hashPassword(input.password);

  let created: User;
  try {
    const [row] = await db
      .insert(users)
      .values({
        username,
        passwordHash,
        displayName,
        role,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    created = row;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new UsernameConflictError(`Username already exists: ${username}`);
    }
    throw err;
  }

  log.info({ userId: created.id, username, role }, "created user");
  return toListItem(created, 0);
}

/**
 * List users with pagination, aggregating each user's owned API key count via a
 * left join so users without keys report zero rather than being dropped. Each
 * page is enriched with month-to-date usage aggregates in one grouped query.
 *
 * @param page - 1-based page number
 * @param pageSize - Page size, clamped to [1, 100]
 * @param search - Optional case-insensitive substring match on username/display name
 * @returns A page of users with owned key counts and month-to-date usage
 */
export async function listUsers(
  page: number = 1,
  pageSize: number = 20,
  search?: string
): Promise<PaginatedUsers> {
  page = Math.max(1, page);
  pageSize = Math.min(100, Math.max(1, pageSize));

  const needle = search?.trim();
  const searchCondition = needle
    ? or(
        caseInsensitiveLike(users.username, needle),
        caseInsensitiveLike(users.displayName, needle)
      )
    : undefined;

  const offset = (page - 1) * pageSize;
  // The count, admin-count, and page queries are independent — run them together.
  const [[{ value: total }], [{ value: activeAdminTotal }], rows] = await Promise.all([
    db.select({ value: count() }).from(users).where(searchCondition),
    db
      .select({ value: count() })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.isActive, true))),
    db
      .select({
        id: users.id,
        username: users.username,
        passwordHash: users.passwordHash,
        displayName: users.displayName,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        apiKeyCount: count(apiKeys.id),
      })
      .from(users)
      .leftJoin(apiKeys, eq(apiKeys.userId, users.id))
      .where(searchCondition)
      .groupBy(users.id)
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset(offset),
  ]);

  const monthUsage = await getUsersMonthUsage(rows.map((row) => row.id));

  const items = rows.map((row) =>
    toListItem(
      {
        id: row.id,
        username: row.username,
        passwordHash: row.passwordHash,
        displayName: row.displayName,
        role: row.role,
        isActive: row.isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      Number(row.apiKeyCount),
      monthUsage.get(row.id)
    )
  );

  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

  return { items, total, page, pageSize, totalPages, activeAdminTotal };
}

/**
 * Fetch a single user by id with its owned API key count.
 *
 * @param id - The user id
 * @returns The user list item, or null when no such user exists
 */
export async function getUserById(id: string): Promise<UserListItem | null> {
  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!user) {
    return null;
  }
  const [[{ value: apiKeyCount }], monthUsage] = await Promise.all([
    db.select({ value: count() }).from(apiKeys).where(eq(apiKeys.userId, id)),
    getUsersMonthUsage([id]),
  ]);
  return toListItem(user, apiKeyCount, monthUsage.get(id));
}

/**
 * Options for the admin mutations that are normally bounded by the "keep at
 * least one active admin" guard. When the caller is the ADMIN_TOKEN super-admin
 * — a credential that lives outside the users table and can always administer
 * the system — the guard serves no purpose, so the route passes
 * `bypassLastActiveAdminGuard: true` to allow deleting or demoting the final
 * active admin user. Account-based admins never set it and stay guarded.
 */
export interface LastAdminGuardOptions {
  bypassLastActiveAdminGuard?: boolean;
}

/**
 * Update a user's profile fields (display name, role, active state). Role
 * demotion and deactivation are guarded inside a transaction so the system can
 * never lose its last active admin (see {@link LastActiveAdminError}), unless
 * the caller is the ADMIN_TOKEN super-admin (see {@link LastAdminGuardOptions}).
 *
 * @param id - The user id
 * @param input - The fields to change; omitted fields are left untouched
 * @param options - Guard-bypass flags for the ADMIN_TOKEN super-admin
 * @returns The updated user list item
 */
export async function updateUser(
  id: string,
  input: UserUpdateInput,
  options: LastAdminGuardOptions = {}
): Promise<UserListItem> {
  const now = new Date();

  const updated = await db.transaction(async (tx) => {
    const target = await tx.query.users.findFirst({ where: eq(users.id, id) });
    if (!target) {
      throw new UserNotFoundError(`User not found: ${id}`);
    }

    const nextRole =
      input.role !== undefined ? normalizeRole(input.role) : normalizeRole(target.role);
    const nextActive = input.isActive !== undefined ? input.isActive : target.isActive;
    const wasActiveAdmin = target.role === "admin" && target.isActive;
    const losesAdminCapability = !(nextRole === "admin" && nextActive);

    if (!options.bypassLastActiveAdminGuard && wasActiveAdmin && losesAdminCapability) {
      const [{ value: others }] = await tx
        .select({ value: count() })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.isActive, true), ne(users.id, id)));
      if (others === 0) {
        throw new LastActiveAdminError("Cannot demote or deactivate the last active admin user");
      }
    }

    const updateData: Partial<{
      displayName: string;
      role: UserRole;
      isActive: boolean;
      updatedAt: Date;
    }> = { updatedAt: now };
    if (input.displayName !== undefined) {
      updateData.displayName = input.displayName.trim();
    }
    if (input.role !== undefined) {
      updateData.role = nextRole;
    }
    if (input.isActive !== undefined) {
      updateData.isActive = input.isActive;
    }

    const [row] = await tx.update(users).set(updateData).where(eq(users.id, id)).returning();
    if (!row) {
      throw new UserNotFoundError(`User not found: ${id}`);
    }
    return row;
  });

  const [[{ value: apiKeyCount }], monthUsage] = await Promise.all([
    db.select({ value: count() }).from(apiKeys).where(eq(apiKeys.userId, id)),
    getUsersMonthUsage([id]),
  ]);

  log.info({ userId: id, role: updated.role, isActive: updated.isActive }, "updated user");
  return toListItem(updated, apiKeyCount, monthUsage.get(id));
}

/**
 * Change a user's username. The new value is normalized and must remain unique
 * case-insensitively (excluding the user's own current record).
 *
 * @param id - The user id
 * @param rawUsername - The new username, before normalization
 * @returns The updated user list item
 */
export async function changeUsername(id: string, rawUsername: string): Promise<UserListItem> {
  const username = normalizeUsername(rawUsername);
  if (!username) {
    throw new InvalidUsernameError("Username must not be empty");
  }
  const now = new Date();

  // Resolve the target user first so a missing user surfaces as a 404 even when
  // the requested name happens to be taken by someone else (otherwise the
  // conflict pre-check below would mask the real cause with a 409).
  const target = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!target) {
    throw new UserNotFoundError(`User not found: ${id}`);
  }

  const conflict = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (conflict && conflict.id !== id) {
    throw new UsernameConflictError(`Username already exists: ${username}`);
  }

  let updated: User;
  try {
    const [row] = await db
      .update(users)
      .set({ username, updatedAt: now })
      .where(eq(users.id, id))
      .returning();
    if (!row) {
      throw new UserNotFoundError(`User not found: ${id}`);
    }
    updated = row;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new UsernameConflictError(`Username already exists: ${username}`);
    }
    throw err;
  }

  const [[{ value: apiKeyCount }], monthUsage] = await Promise.all([
    db.select({ value: count() }).from(apiKeys).where(eq(apiKeys.userId, id)),
    getUsersMonthUsage([id]),
  ]);

  log.info({ userId: id, username }, "changed username");
  return toListItem(updated, apiKeyCount, monthUsage.get(id));
}

/**
 * Reset a user's password to a new bcrypt hash after enforcing minimum strength.
 *
 * @param id - The user id
 * @param newPassword - The new plaintext password
 */
export async function resetPassword(id: string, newPassword: string): Promise<void> {
  if (!isPasswordStrong(newPassword)) {
    throw new WeakPasswordError("Password does not meet the minimum length requirement");
  }
  const passwordHash = await hashPassword(newPassword);
  const now = new Date();

  const [row] = await db
    .update(users)
    .set({ passwordHash, updatedAt: now })
    .where(eq(users.id, id))
    .returning();
  if (!row) {
    throw new UserNotFoundError(`User not found: ${id}`);
  }

  log.info({ userId: id }, "reset user password");
}

/**
 * Self-service password change: verifies the current password before applying
 * the same strength check and hashing as the admin reset. The userId always
 * comes from the authenticated principal, never from request parameters.
 *
 * @param id - The authenticated user's id
 * @param currentPassword - The current plaintext password to verify
 * @param newPassword - The new plaintext password
 */
export async function changeOwnPassword(
  id: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!user) {
    throw new UserNotFoundError(`User not found: ${id}`);
  }

  const matches = await verifyPassword(currentPassword, user.passwordHash);
  if (!matches) {
    throw new InvalidCredentialsError("Current password is incorrect");
  }

  if (!isPasswordStrong(newPassword)) {
    throw new WeakPasswordError("Password does not meet the minimum length requirement");
  }

  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, id));

  log.info({ userId: id }, "user changed own password");
}

/**
 * Delete a user. Owned API keys are detached (user_id set to NULL) in the same
 * transaction as the delete so SQLite — which does not enforce foreign keys at
 * runtime — cannot leave dangling ownership, and a concurrent self-service key
 * creation cannot slip a hanging reference past the cleanup. The last active
 * admin is protected from deletion unless the caller is the ADMIN_TOKEN
 * super-admin (see {@link LastAdminGuardOptions}).
 *
 * @param id - The user id
 * @param options - Guard-bypass flags for the ADMIN_TOKEN super-admin
 */
export async function deleteUser(id: string, options: LastAdminGuardOptions = {}): Promise<void> {
  const now = new Date();

  await db.transaction(async (tx) => {
    const target = await tx.query.users.findFirst({ where: eq(users.id, id) });
    if (!target) {
      throw new UserNotFoundError(`User not found: ${id}`);
    }

    if (!options.bypassLastActiveAdminGuard && target.role === "admin" && target.isActive) {
      const [{ value: others }] = await tx
        .select({ value: count() })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.isActive, true), ne(users.id, id)));
      if (others === 0) {
        throw new LastActiveAdminError("Cannot delete the last active admin user");
      }
    }

    await tx.update(apiKeys).set({ userId: null, updatedAt: now }).where(eq(apiKeys.userId, id));
    await tx.delete(users).where(eq(users.id, id));
  });

  log.info({ userId: id }, "deleted user");
}

/**
 * Assign ownership of an existing API key to a user, after verifying the target
 * user exists.
 *
 * @param keyId - The API key id
 * @param userId - The user to own the key
 */
export async function assignApiKeyOwnership(keyId: string, userId: string): Promise<void> {
  const now = new Date();

  await db.transaction(async (tx) => {
    const user = await tx.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) {
      throw new UserNotFoundError(`User not found: ${userId}`);
    }

    const [row] = await tx
      .update(apiKeys)
      .set({ userId, updatedAt: now })
      .where(eq(apiKeys.id, keyId))
      .returning();
    if (!row) {
      throw new ApiKeyOwnershipError(`API key not found: ${keyId}`);
    }
  });

  log.info({ keyId, userId }, "assigned API key ownership");
}

/**
 * Revoke ownership of an API key, detaching it (user_id set to NULL).
 *
 * @param keyId - The API key id
 */
export async function revokeApiKeyOwnership(keyId: string): Promise<void> {
  const now = new Date();
  const [row] = await db
    .update(apiKeys)
    .set({ userId: null, updatedAt: now })
    .where(eq(apiKeys.id, keyId))
    .returning();
  if (!row) {
    throw new ApiKeyOwnershipError(`API key not found: ${keyId}`);
  }

  log.info({ keyId }, "revoked API key ownership");
}

/**
 * Fetch the set of upstreams an admin has made available to a user for
 * self-service key authorization.
 *
 * @param userId - The user id
 * @returns The list of upstream ids open to the user
 */
export async function getUserUpstreams(userId: string): Promise<string[]> {
  const links = await db.query.userUpstreams.findMany({
    where: eq(userUpstreams.userId, userId),
  });
  return links.map((link) => link.upstreamId);
}

/**
 * Replace the set of upstreams available to a user. Validates the user exists
 * and every upstream id is real, then swaps the association set atomically.
 *
 * @param userId - The user id
 * @param upstreamIds - The complete new set of available upstream ids
 * @returns The persisted set of upstream ids
 */
export async function setUserUpstreams(userId: string, upstreamIds: string[]): Promise<string[]> {
  const normalizedIds = Array.from(new Set(upstreamIds));
  const now = new Date();
  const { exposeUpstreams } = await getPortalSettings();

  const persisted = await db.transaction(async (tx) => {
    const user = await tx.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) {
      throw new UserNotFoundError(`User not found: ${userId}`);
    }

    if (normalizedIds.length > 0) {
      const valid = await tx.query.upstreams.findMany({
        where: inArray(upstreams.id, normalizedIds),
      });
      if (valid.length !== normalizedIds.length) {
        const validIds = new Set(valid.map((u) => u.id));
        const invalidIds = normalizedIds.filter((upstreamId) => !validIds.has(upstreamId));
        throw new UpstreamAssignmentError(`Invalid upstream IDs: ${invalidIds.join(", ")}`);
      }
    }

    await tx.delete(userUpstreams).where(eq(userUpstreams.userId, userId));
    if (normalizedIds.length > 0) {
      try {
        await tx.insert(userUpstreams).values(
          normalizedIds.map((upstreamId) => ({
            userId,
            upstreamId,
            createdAt: now,
          }))
        );
      } catch (err) {
        // An upstream validated above can be deleted concurrently before this
        // insert lands; classify the resulting foreign-key violation as a 400
        // assignment error rather than letting it surface as a generic 500.
        if (isForeignKeyViolation(err)) {
          throw new UpstreamAssignmentError("One or more upstreams no longer exist");
        }
        throw err;
      }
    }

    // Keys owned by the user follow the grant set inside the same transaction.
    // While upstreams are hidden the key set *is* the grant set; while they are
    // visible the member's own selection is kept, minus whatever was revoked —
    // otherwise a revoked upstream would stay routable through existing keys.
    await alignMemberKeysToGrants(userId, {
      mode: exposeUpstreams ? "intersect" : "replace",
      executor: tx,
    });

    return normalizedIds;
  });

  log.info({ userId, upstreams: persisted.length }, "set user available upstreams");
  return persisted;
}
