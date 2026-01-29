import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { db, circuitBreakerStates, upstreams } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { CircuitBreakerStateResponse } from "../route";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/circuit-breakers/{upstreamId} - Get circuit breaker state for a specific upstream
 */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
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

    // Get circuit breaker state (may not exist if never initialized)
    const cbState = await db.query.circuitBreakerStates.findFirst({
      where: eq(circuitBreakerStates.upstreamId, upstreamId),
    });

    if (!cbState) {
      // Return default closed state if not initialized
      const response: CircuitBreakerStateResponse = {
        id: "",
        upstream_id: upstreamId,
        upstream_name: upstream.name,
        state: "closed",
        failure_count: 0,
        success_count: 0,
        last_failure_at: null,
        opened_at: null,
        last_probe_at: null,
        config: null,
        created_at: upstream.createdAt.toISOString(),
        updated_at: upstream.updatedAt.toISOString(),
      };
      return NextResponse.json({ data: response });
    }

    const response: CircuitBreakerStateResponse = {
      id: cbState.id,
      upstream_id: cbState.upstreamId,
      upstream_name: upstream.name,
      state: cbState.state as "closed" | "open" | "half_open",
      failure_count: cbState.failureCount,
      success_count: cbState.successCount,
      last_failure_at: cbState.lastFailureAt?.toISOString() ?? null,
      opened_at: cbState.openedAt?.toISOString() ?? null,
      last_probe_at: cbState.lastProbeAt?.toISOString() ?? null,
      config: cbState.config,
      created_at: cbState.createdAt.toISOString(),
      updated_at: cbState.updatedAt.toISOString(),
    };

    return NextResponse.json({ data: response });
  } catch (error) {
    console.error("Failed to get circuit breaker state:", error);
    return errorResponse("Internal server error", 500);
  }
}
