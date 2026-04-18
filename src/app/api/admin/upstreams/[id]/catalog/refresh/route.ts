import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { refreshUpstreamCatalog, UpstreamNotFoundError } from "@/lib/services/upstream-service";
import { transformUpstreamToApi } from "@/lib/utils/api-transformers";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-upstream-catalog-refresh");

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
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
