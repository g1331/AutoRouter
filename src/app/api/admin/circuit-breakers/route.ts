import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse, getPaginationParams } from "@/lib/utils/api-auth";
import { db, circuitBreakerStates, upstreams } from "@/lib/db";
import { desc, eq, sql } from "drizzle-orm";

export interface CircuitBreakerStateResponse {
  id: string;
  upstream_id: string;
  upstream_name: string;
  state: "closed" | "open" | "half_open";
  failure_count: number;
  success_count: number;
  last_failure_at: string | null;
  opened_at: string | null;
  last_probe_at: string | null;
  config: {
    failureThreshold?: number;
    successThreshold?: number;
    openDuration?: number;
    probeInterval?: number;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface CircuitBreakerListResponse {
  data: CircuitBreakerStateResponse[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * GET /api/admin/circuit-breakers - List all circuit breaker states
 *
 * Query Parameters:
 * - state: Filter by state ("closed", "open", "half_open")
 * - page: Page number (default: 1)
 * - page_size: Items per page (default: 20, max: 100)
 */
export async function GET(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { page, pageSize } = getPaginationParams(request);
    const url = new URL(request.url);
    const stateFilter = url.searchParams.get("state");

    // Build query conditions
    const conditions = [];
    if (stateFilter) {
      conditions.push(eq(circuitBreakerStates.state, stateFilter));
    }

    // Count total with filters
    const countQuery = db.select({ count: sql<number>`count(*)` }).from(circuitBreakerStates);

    if (conditions.length > 0) {
      countQuery.where(conditions[0]);
    }

    const [{ count: total }] = await countQuery;

    // Query paginated results with upstream info
    const offset = (page - 1) * pageSize;
    const results = await db
      .select({
        cb: circuitBreakerStates,
        upstreamName: upstreams.name,
      })
      .from(circuitBreakerStates)
      .innerJoin(upstreams, eq(circuitBreakerStates.upstreamId, upstreams.id))
      .where(conditions.length > 0 ? conditions[0] : undefined)
      .orderBy(desc(circuitBreakerStates.updatedAt))
      .limit(pageSize)
      .offset(offset);

    const data: CircuitBreakerStateResponse[] = results.map((row) => ({
      id: row.cb.id,
      upstream_id: row.cb.upstreamId,
      upstream_name: row.upstreamName,
      state: row.cb.state as "closed" | "open" | "half_open",
      failure_count: row.cb.failureCount,
      success_count: row.cb.successCount,
      last_failure_at: row.cb.lastFailureAt?.toISOString() ?? null,
      opened_at: row.cb.openedAt?.toISOString() ?? null,
      last_probe_at: row.cb.lastProbeAt?.toISOString() ?? null,
      config: row.cb.config,
      created_at: row.cb.createdAt.toISOString(),
      updated_at: row.cb.updatedAt.toISOString(),
    }));

    const totalPages = Math.ceil(total / pageSize);

    const response: CircuitBreakerListResponse = {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to list circuit breaker states:", error);
    return errorResponse("Internal server error", 500);
  }
}
