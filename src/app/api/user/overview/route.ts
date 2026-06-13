import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireMember } from "@/lib/utils/api-auth";
import { getUserOverview } from "@/lib/services/user-data-service";
import { transformUserOverviewToApi } from "@/lib/utils/api-transformers";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("user-overview");

/**
 * GET /api/user/overview - Personal overview aggregates for the portal.
 *
 * The owner scope always comes from the authenticated principal; no target
 * user can be supplied from the outside. The ADMIN_TOKEN super-admin carries
 * no personal data scope and is rejected.
 */
export async function GET(request: NextRequest) {
  const auth = await requireMember(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const overview = await getUserOverview(auth.userId);
    return NextResponse.json(transformUserOverviewToApi(overview));
  } catch (error) {
    log.error({ err: error }, "failed to get user overview");
    return errorResponse("Internal server error", 500);
  }
}
