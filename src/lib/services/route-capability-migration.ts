import { eq } from "drizzle-orm";
import { db, upstreams } from "@/lib/db";
import { normalizeRouteCapabilities } from "@/lib/route-capabilities";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("route-capability-migration");

let migrationCompleted = false;
let migrationInFlight: Promise<void> | null = null;

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

async function runMigrationInternal(): Promise<boolean> {
  let allUpstreams: Array<{
    id: string;
    name: string;
    routeCapabilities: string[] | null;
    updatedAt: Date;
  }> = [];

  try {
    const result = await db.query.upstreams.findMany({
      columns: {
        id: true,
        name: true,
        routeCapabilities: true,
        updatedAt: true,
      },
    });

    if (!Array.isArray(result)) {
      return true;
    }

    allUpstreams = result as typeof allUpstreams;
  } catch (error) {
    log.warn({ err: error }, "skip route capability migration due to query failure");
    return false;
  }

  for (const upstream of allUpstreams) {
    const persistedCapabilities = upstream.routeCapabilities ?? [];
    const normalizedCapabilities = normalizeRouteCapabilities(persistedCapabilities);

    const shouldUpdate =
      upstream.routeCapabilities == null ||
      !arraysEqual(persistedCapabilities, normalizedCapabilities);

    if (!shouldUpdate) {
      continue;
    }

    try {
      await db
        .update(upstreams)
        .set({
          routeCapabilities: normalizedCapabilities,
          updatedAt: new Date(),
        })
        .where(eq(upstreams.id, upstream.id));
    } catch (error) {
      log.warn(
        {
          err: error,
          upstreamId: upstream.id,
          upstreamName: upstream.name,
        },
        "skip route capability migration due to update failure"
      );
      return false;
    }

    log.info(
      {
        upstreamId: upstream.id,
        upstreamName: upstream.name,
        routeCapabilities: normalizedCapabilities,
      },
      "initialized upstream route capabilities"
    );
  }

  return true;
}

export async function ensureRouteCapabilityMigration(): Promise<void> {
  if (migrationCompleted) {
    return;
  }

  if (migrationInFlight) {
    await migrationInFlight;
    return;
  }

  migrationInFlight = runMigrationInternal()
    .then((success) => {
      if (success) {
        migrationCompleted = true;
      }
    })
    .finally(() => {
      migrationInFlight = null;
    });

  await migrationInFlight;
}
