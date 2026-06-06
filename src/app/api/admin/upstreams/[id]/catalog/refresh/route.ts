import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { refreshUpstreamCatalog, UpstreamNotFoundError } from "@/lib/services/upstream-service";
import { transformUpstreamToApi } from "@/lib/utils/api-transformers";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-upstream-catalog-refresh");

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Refreshes an upstream model catalog from its provider endpoint.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { id } = await context.params;
    const upstream = await refreshUpstreamCatalog(id);
    return NextResponse.json(transformUpstreamToApi(upstream));
  } catch (error) {
    if (error instanceof UpstreamNotFoundError) {
      return errorResponse("Upstream not found", 404);
    }

    log.error({ err: error }, "failed to refresh upstream catalog");
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
