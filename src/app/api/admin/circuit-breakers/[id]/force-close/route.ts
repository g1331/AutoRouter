import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { forceClose } from "@/lib/services/circuit-breaker";
import { db, upstreams } from "@/lib/db";
import { eq } from "drizzle-orm";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-circuit-breakers");

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Handle POST /api/admin/circuit-breakers/[id]/force-close and force the upstream circuit breaker to CLOSED.
 */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { id: upstreamId } = await context.params;

    // Validate upstream exists
    const upstream = await db.query.upstreams.findFirst({
      where: eq(upstreams.id, upstreamId),
    });

    if (!upstream) {
      return errorResponse("Upstream not found", 404);
    }

    // Force circuit breaker to closed
    await forceClose(upstreamId);

    return NextResponse.json({
      success: true,
      message: `Circuit breaker forced to CLOSED for upstream '${upstream.name}'`,
      upstream_id: upstreamId,
      upstream_name: upstream.name,
      action: "force_close",
    });
  } catch (error) {
    log.error({ err: error }, "failed to force circuit breaker closed");
    return errorResponse("Internal server error", 500);
  }
}
