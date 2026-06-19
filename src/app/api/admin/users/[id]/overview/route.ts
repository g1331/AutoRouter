import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { getUserOverview } from "@/lib/services/user-data-service";
import { getUserById } from "@/lib/services/user-service";
import { transformUserOverviewToApi } from "@/lib/utils/api-transformers";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-user-overview");

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/users/[id]/overview - Overview aggregates for a target user.
 *
 * Admin counterpart to the member-side /api/user/overview: it reuses the same
 * per-user aggregation but takes the target userId from the route instead of the
 * authenticated principal. Guarded by requireAdmin, so any admin-capable
 * principal (ADMIN_TOKEN or admin-role JWT) may inspect any user; the response
 * shape matches the member endpoint so the frontend can share types.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { id } = await context.params;

    const user = await getUserById(id);
    if (!user) {
      return errorResponse("User not found", 404);
    }

    const overview = await getUserOverview(id);
    return NextResponse.json(transformUserOverviewToApi(overview));
  } catch (error) {
    log.error({ err: error }, "failed to get admin user overview");
    return errorResponse("Internal server error", 500);
  }
}
