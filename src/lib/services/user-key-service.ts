import { eq } from "drizzle-orm";
import { db, apiKeys } from "../db";
import {
  createApiKey,
  updateApiKey,
  deleteApiKey,
  listApiKeys,
  type ApiKeyCreateResult,
  type ApiKeyListItem,
  type ApiKeyUpdateInput,
  type PaginatedApiKeys,
} from "./key-manager";
import { getUserUpstreams } from "./user-service";
import { parseSpendingRules } from "./spending-rules";
import type { SpendingRule } from "./upstream-quota-tracker";
import { createLogger } from "../utils/logger";

const log = createLogger("user-key-service");

// Self-service API key management (decision 8). Every operation is scoped to
// the caller's userId taken from the authenticated principal. The server-side
// boundaries enforced here, independent of any UI restriction:
// - new keys are owned by the caller and forced to access_mode=restricted;
// - authorized upstreams must stay inside the caller's user_upstreams set;
// - keys owned by someone else (or by nobody) cannot be read, updated,
//   deleted, or claimed;
// - ownership can never be changed from this surface (the input types carry
//   no owner field);
// - spending rules can only be tightened: existing rules cannot be removed or
//   raised, and a non-empty rule set cannot be cleared.

/**
 * Raised when a key does not exist or is not owned by the caller. The two
 * cases are deliberately indistinguishable so a member cannot probe which key
 * ids exist.
 */
export class KeyOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyOwnershipError";
  }
}

/**
 * Raised when a requested upstream set escapes the caller's user_upstreams
 * allowance.
 */
export class UpstreamNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamNotAllowedError";
  }
}

/**
 * Raised when a spending-rule change would relax the existing cost boundary:
 * clearing a non-empty rule set, dropping an existing rule, or raising a limit.
 */
export class SpendingRuleRelaxationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpendingRuleRelaxationError";
  }
}

/**
 * Raised when a member tries to re-enable a key that an admin has disabled. The
 * admin lock takes priority: only an admin can restore such a key, so the
 * member is denied (decision: admin disable is irreversible from the portal).
 */
export class AdminLockedKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminLockedKeyError";
  }
}

export interface UserKeyCreateInput {
  name: string;
  upstreamIds: string[];
  description?: string | null;
  spendingRules?: SpendingRule[] | null;
}

export interface UserKeyUpdateInput {
  name?: string;
  description?: string | null;
  isActive?: boolean;
  upstreamIds?: string[];
  spendingRules?: SpendingRule[] | null;
}

function ruleKey(rule: SpendingRule): string {
  return rule.period_type === "rolling" ? `rolling:${rule.period_hours ?? 24}` : rule.period_type;
}

/**
 * Enforce the tighten-only contract for spending rules. Every existing rule
 * must survive under the same period key with an equal or lower limit; new
 * rules are additional constraints and therefore always allowed.
 */
function assertSpendingRulesTightened(
  existing: SpendingRule[] | null,
  next: SpendingRule[] | null
): void {
  if (!existing || existing.length === 0) {
    return;
  }
  if (!next || next.length === 0) {
    throw new SpendingRuleRelaxationError("Existing spending rules cannot be cleared");
  }

  const nextByKey = new Map(next.map((rule) => [ruleKey(rule), rule]));
  for (const rule of existing) {
    const replacement = nextByKey.get(ruleKey(rule));
    if (!replacement) {
      throw new SpendingRuleRelaxationError(
        `Existing spending rule (${ruleKey(rule)}) cannot be removed`
      );
    }
    if (replacement.limit > rule.limit) {
      throw new SpendingRuleRelaxationError(
        `Spending limit for ${ruleKey(rule)} can only be tightened (current ${rule.limit})`
      );
    }
  }
}

async function assertUpstreamsAllowed(userId: string, upstreamIds: string[]): Promise<void> {
  const allowed = new Set(await getUserUpstreams(userId));
  const outside = upstreamIds.filter((id) => !allowed.has(id));
  if (outside.length > 0) {
    throw new UpstreamNotAllowedError(`Upstreams not granted to this user: ${outside.join(", ")}`);
  }
}

async function requireOwnedKey(userId: string, keyId: string) {
  const key = await db.query.apiKeys.findFirst({ where: eq(apiKeys.id, keyId) });
  if (!key || key.userId !== userId) {
    throw new KeyOwnershipError(`API key not found: ${keyId}`);
  }
  return key;
}

/**
 * List the caller's own API keys.
 */
export async function listOwnApiKeys(
  userId: string,
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedApiKeys> {
  return listApiKeys(page, pageSize, { userId });
}

/**
 * Create a key owned by the caller. Ownership and restricted access mode are
 * forced server-side; the upstream set must stay inside user_upstreams.
 */
export async function createOwnApiKey(
  userId: string,
  input: UserKeyCreateInput
): Promise<ApiKeyCreateResult> {
  await assertUpstreamsAllowed(userId, input.upstreamIds);

  const result = await createApiKey({
    name: input.name,
    upstreamIds: input.upstreamIds,
    accessMode: "restricted",
    userId,
    description: input.description ?? null,
    spendingRules: input.spendingRules ?? null,
  });

  log.info({ userId, keyPrefix: result.keyPrefix }, "user created self-service API key");
  return result;
}

/**
 * Update one of the caller's own keys. Ownership is asserted first; upstream
 * changes are bounded by user_upstreams and spending rules can only tighten.
 */
export async function updateOwnApiKey(
  userId: string,
  keyId: string,
  input: UserKeyUpdateInput
): Promise<ApiKeyListItem> {
  const key = await requireOwnedKey(userId, keyId);

  // An admin-disabled key cannot be re-enabled from the portal. The member may
  // still change other fields, but flipping is_active back to true is refused
  // while the admin lock stands; the lock is never written from this surface, so
  // a member-initiated disable stays self-reversible.
  if (input.isActive === true && key.disabledByAdmin) {
    throw new AdminLockedKeyError(
      "This key was disabled by an administrator and cannot be re-enabled here"
    );
  }

  if (input.upstreamIds !== undefined) {
    await assertUpstreamsAllowed(userId, input.upstreamIds);
  }

  if (input.spendingRules !== undefined) {
    assertSpendingRulesTightened(parseSpendingRules(key.spendingRules), input.spendingRules);
  }

  const update: ApiKeyUpdateInput = {};
  if (input.name !== undefined) update.name = input.name;
  if (input.description !== undefined) update.description = input.description;
  if (input.isActive !== undefined) update.isActive = input.isActive;
  if (input.upstreamIds !== undefined) update.upstreamIds = input.upstreamIds;
  if (input.spendingRules !== undefined) update.spendingRules = input.spendingRules;

  const result = await updateApiKey(keyId, update);
  log.info({ userId, keyPrefix: result.keyPrefix }, "user updated self-service API key");
  return result;
}

/**
 * Delete one of the caller's own keys, revoking it for any future proxy use.
 */
export async function deleteOwnApiKey(userId: string, keyId: string): Promise<void> {
  await requireOwnedKey(userId, keyId);
  await deleteApiKey(keyId);
  log.info({ userId, keyId }, "user deleted self-service API key");
}
