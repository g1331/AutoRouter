import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { listUpstreamProbeResults } from "@/lib/services/upstream-service";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-upstream-probes");

/**
 * List latest diagnostic probe results for all upstreams.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    return NextResponse.json(await listUpstreamProbeResults());
  } catch (error) {
    log.error({ err: error }, "failed to list upstream probe results");
    return errorResponse("Internal server error", 500);
  }
}
