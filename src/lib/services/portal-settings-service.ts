import { eq } from "drizzle-orm";
import { db, portalSettings } from "../db";
import { alignAllMemberKeysToGrants } from "./member-key-alignment";
import { createLogger } from "../utils/logger";

const log = createLogger("portal-settings-service");

export const PORTAL_SETTINGS_ID = "default";

export interface PortalSettingsValue {
  /**
   * Whether members may see upstream identities (names in the key dialog,
   * upstream columns in their own request logs) and pick the upstream subset
   * for their self-service keys. Off by default: the gateway is a single
   * access point and routes inside the admin-granted set on its own.
   */
  exposeUpstreams: boolean;
  updatedAt: Date;
}

export interface PortalSettingsUpdate {
  exposeUpstreams?: boolean;
}

function mapSettings(row: typeof portalSettings.$inferSelect): PortalSettingsValue {
  return {
    exposeUpstreams: row.exposeUpstreams,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
  };
}

async function ensureSettingsRow(): Promise<typeof portalSettings.$inferSelect> {
  const existing = await db.query.portalSettings.findFirst({
    where: eq(portalSettings.id, PORTAL_SETTINGS_ID),
  });
  if (existing) {
    return existing;
  }

  await db
    .insert(portalSettings)
    .values({
      id: PORTAL_SETTINGS_ID,
      exposeUpstreams: false,
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: portalSettings.id });

  const created = await db.query.portalSettings.findFirst({
    where: eq(portalSettings.id, PORTAL_SETTINGS_ID),
  });
  if (!created) {
    throw new Error("Failed to initialize portal settings");
  }
  return created;
}

/** Read the singleton portal settings row, creating the default when absent. */
export async function getPortalSettings(): Promise<PortalSettingsValue> {
  return mapSettings(await ensureSettingsRow());
}

/**
 * Persist portal settings. Turning upstream exposure off realigns every
 * member-owned key to its owner's grant set, so keys whose upstream subset was
 * chosen by the member while exposure was on stop diverging from what the
 * admin granted.
 */
export async function updatePortalSettings(
  input: PortalSettingsUpdate
): Promise<PortalSettingsValue> {
  const before = mapSettings(await ensureSettingsRow());

  const [row] = await db
    .update(portalSettings)
    .set({
      ...(input.exposeUpstreams !== undefined ? { exposeUpstreams: input.exposeUpstreams } : {}),
      updatedAt: new Date(),
    })
    .where(eq(portalSettings.id, PORTAL_SETTINGS_ID))
    .returning();

  if (!row) {
    throw new Error("Portal settings not found");
  }

  const after = mapSettings(row);
  if (before.exposeUpstreams && !after.exposeUpstreams) {
    const alignment = await alignAllMemberKeysToGrants();
    log.info(alignment, "realigned member keys after hiding upstreams");
  }

  return after;
}
