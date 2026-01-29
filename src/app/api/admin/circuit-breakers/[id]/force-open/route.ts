import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { forceOpen } from "@/lib/services/circuit-breaker";
import { db, upstreams } from "@/lib/db";
import { eq } from "drizzle-orm";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/admin/circuit-breakers/{upstreamId}/force-open - Force circuit breaker to OPEN state
 */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
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

    // Force circuit breaker to open
    await forceOpen(upstreamId);

    return NextResponse.json({
      success: true,
      message: `Circuit breaker forced to OPEN for upstream '${upstream.name}'`,
      upstream_id: upstreamId,
      upstream_name: upstream.name,
      action: "force_open",
    });
  } catch (error) {
    console.error("Failed to force circuit breaker open:", error);
    return errorResponse("Internal server error", 500);
  }
}
