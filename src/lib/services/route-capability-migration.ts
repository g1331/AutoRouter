import { eq } from "drizzle-orm";
import { db, upstreams } from "@/lib/db";
import {
  getDefaultRouteCapabilitiesForProvider,
  normalizeRouteCapabilities,
} from "@/lib/route-capabilities";
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

async function runMigrationInternal(): Promise<void> {
  let allUpstreams: Array<{
    id: string;
    name: string;
    providerType: string;
    routeCapabilities: string[] | null;
    updatedAt: Date;
  }> = [];

  try {
    const result = await db.query.upstreams.findMany({
      columns: {
        id: true,
        name: true,
        providerType: true,
        routeCapabilities: true,
        updatedAt: true,
      },
    });

    if (!Array.isArray(result)) {
      return;
    }

    allUpstreams = result as typeof allUpstreams;
  } catch (error) {
    log.warn({ err: error }, "skip route capability migration due to query failure");
    return;
  }

  for (const upstream of allUpstreams) {
    const normalizedCapabilities = normalizeRouteCapabilities(upstream.routeCapabilities);
    const expectedCapabilities =
      normalizedCapabilities.length > 0
        ? normalizedCapabilities
        : getDefaultRouteCapabilitiesForProvider(upstream.providerType);

    const shouldUpdate =
      upstream.routeCapabilities == null ||
      !arraysEqual(normalizedCapabilities, expectedCapabilities);

    if (!shouldUpdate) {
      continue;
    }

    await db
      .update(upstreams)
      .set({
        routeCapabilities: expectedCapabilities,
        updatedAt: new Date(),
      })
      .where(eq(upstreams.id, upstream.id));

    log.info(
      {
        upstreamId: upstream.id,
        upstreamName: upstream.name,
        providerType: upstream.providerType,
        routeCapabilities: expectedCapabilities,
      },
      "initialized upstream route capabilities"
    );
  }
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
    .then(() => {
      migrationCompleted = true;
    })
    .finally(() => {
      migrationInFlight = null;
    });

  await migrationInFlight;
}
