import { and, eq, inArray } from "drizzle-orm";
import { db, apiKeys, apiKeyUpstreams, userUpstreams, users } from "../db";
import { createLogger } from "../utils/logger";

const log = createLogger("member-key-alignment");

// When the portal hides upstreams from members, a member no longer picks the
// upstream subset for a self-service key: the key routes inside whatever the
// admin granted the owner. That set is materialised into api_key_upstreams by
// the write paths (key creation, grant changes, switching the toggle off)
// rather than resolved per request, so the proxy hot path stays untouched and
// the admin console shows the real routing set for every key.
//
// Links are written directly instead of through updateApiKey: a member whose
// grant set is empty must end up restricted with zero links (fail closed, the
// proxy then answers NO_AUTHORIZED_UPSTREAMS), which updateApiKey rejects.
// access_mode is always forced back to "restricted" — an owned key left
// unrestricted with no links would be readable by the proxy as "every active
// upstream is allowed".
//
// Only keys owned by a user with the `member` role are touched. Admin-owned
// keys are managed from the admin console, which keeps full upstream
// visibility, and unowned keys have no grant set to align to.

type DbExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * - `replace`: the key's upstream set becomes the owner's whole grant set.
 *   Used when upstreams are hidden, where the member never picks a subset.
 * - `intersect`: revoked upstreams are dropped and the member's own selection
 *   is otherwise preserved. Used when upstreams are visible, so an admin
 *   revoking a grant also revokes it on keys that already reference it.
 */
export type MemberKeyAlignmentMode = "replace" | "intersect";

export interface MemberKeyAlignmentOptions {
  mode?: MemberKeyAlignmentMode;
  /** Surrounding transaction, when the caller is already rewriting grants. */
  executor?: DbExecutor;
}

export interface MemberKeyAlignmentResult {
  /** Owned keys inspected. */
  inspectedKeys: number;
  /** Owned keys whose upstream set or access mode was rewritten. */
  alignedKeys: number;
}

interface OwnedKeyRow {
  id: string;
  userId: string | null;
  accessMode: string | null;
}

function sameIdSet(current: string[], next: string[]): boolean {
  if (current.length !== next.length) {
    return false;
  }
  const currentSet = new Set(current);
  return next.every((id) => currentSet.has(id));
}

async function alignOwnedKeys(
  tx: DbExecutor,
  ownedKeys: OwnedKeyRow[],
  mode: MemberKeyAlignmentMode
): Promise<MemberKeyAlignmentResult> {
  if (ownedKeys.length === 0) {
    return { inspectedKeys: 0, alignedKeys: 0 };
  }

  const ownerIds = Array.from(
    new Set(ownedKeys.map((key) => key.userId).filter((id): id is string => id !== null))
  );
  const keyIds = ownedKeys.map((key) => key.id);

  const grantRows = await tx
    .select({ userId: userUpstreams.userId, upstreamId: userUpstreams.upstreamId })
    .from(userUpstreams)
    .where(inArray(userUpstreams.userId, ownerIds));
  const grantsByUser = new Map<string, string[]>();
  for (const row of grantRows) {
    const existing = grantsByUser.get(row.userId);
    if (existing) {
      existing.push(row.upstreamId);
    } else {
      grantsByUser.set(row.userId, [row.upstreamId]);
    }
  }

  const linkRows = await tx
    .select({ apiKeyId: apiKeyUpstreams.apiKeyId, upstreamId: apiKeyUpstreams.upstreamId })
    .from(apiKeyUpstreams)
    .where(inArray(apiKeyUpstreams.apiKeyId, keyIds));
  const linksByKey = new Map<string, string[]>();
  for (const row of linkRows) {
    const existing = linksByKey.get(row.apiKeyId);
    if (existing) {
      existing.push(row.upstreamId);
    } else {
      linksByKey.set(row.apiKeyId, [row.upstreamId]);
    }
  }

  const now = new Date();
  let alignedKeys = 0;

  for (const key of ownedKeys) {
    const granted = key.userId ? (grantsByUser.get(key.userId) ?? []) : [];
    const current = linksByKey.get(key.id) ?? [];
    const next = mode === "replace" ? granted : current.filter((id) => granted.includes(id));
    const linksMatch = sameIdSet(current, next);
    const accessModeMatches = key.accessMode === "restricted";

    if (linksMatch && accessModeMatches) {
      continue;
    }

    if (!linksMatch) {
      await tx.delete(apiKeyUpstreams).where(eq(apiKeyUpstreams.apiKeyId, key.id));
      if (next.length > 0) {
        await tx.insert(apiKeyUpstreams).values(
          next.map((upstreamId) => ({
            apiKeyId: key.id,
            upstreamId,
            createdAt: now,
          }))
        );
      }
    }

    await tx
      .update(apiKeys)
      .set({ accessMode: "restricted", updatedAt: now })
      .where(eq(apiKeys.id, key.id));
    alignedKeys += 1;
  }

  return { inspectedKeys: ownedKeys.length, alignedKeys };
}

/**
 * Realign every member key owned by one user against that user's current
 * upstream grant set. Pass the surrounding transaction when the caller is
 * already rewriting the grants, so the grant swap and the key alignment commit
 * together.
 */
export async function alignMemberKeysToGrants(
  userId: string,
  options: MemberKeyAlignmentOptions = {}
): Promise<MemberKeyAlignmentResult> {
  const mode = options.mode ?? "replace";
  const run = async (tx: DbExecutor) => {
    const ownedKeys = await tx
      .select({ id: apiKeys.id, userId: apiKeys.userId, accessMode: apiKeys.accessMode })
      .from(apiKeys)
      .innerJoin(users, eq(apiKeys.userId, users.id))
      .where(and(eq(apiKeys.userId, userId), eq(users.role, "member")));
    return alignOwnedKeys(tx, ownedKeys, mode);
  };

  const result = options.executor ? await run(options.executor) : await db.transaction(run);

  if (result.alignedKeys > 0) {
    log.info(
      { userId, inspectedKeys: result.inspectedKeys, alignedKeys: result.alignedKeys },
      "aligned member keys to granted upstreams"
    );
  }
  return result;
}

/**
 * Realign every member-owned API key to its owner's grant set. Used when the
 * portal upstream visibility toggle is switched off, so keys created while
 * members could pick their own subset fall back under admin control.
 * Admin-owned keys are left alone: those are managed from the admin console,
 * which keeps full upstream visibility.
 */
export async function alignAllMemberKeysToGrants(): Promise<MemberKeyAlignmentResult> {
  const result = await db.transaction(async (tx) => {
    const ownedKeys = await tx
      .select({ id: apiKeys.id, userId: apiKeys.userId, accessMode: apiKeys.accessMode })
      .from(apiKeys)
      .innerJoin(users, eq(apiKeys.userId, users.id))
      .where(eq(users.role, "member"));
    return alignOwnedKeys(tx, ownedKeys, "replace");
  });

  log.info(result, "aligned all member keys to granted upstreams");
  return result;
}
