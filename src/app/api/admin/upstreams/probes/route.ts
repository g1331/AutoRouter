import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { listUpstreamProbeResults } from "@/lib/services/upstream-service";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-upstream-probes");

/**
 * List latest diagnostic probe results for all upstreams.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    return NextResponse.json(await listUpstreamProbeResults());
  } catch (error) {
    log.error({ err: error }, "failed to list upstream probe results");
    return errorResponse("Internal server error", 500);
  }
}
