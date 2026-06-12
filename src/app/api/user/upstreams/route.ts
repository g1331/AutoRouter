import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/utils/api-auth";
import { listUserUpstreamOptions } from "@/lib/services/user-data-service";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("user-upstreams");

/**
 * GET /api/user/upstreams - Upstreams the caller may authorize on
 * self-service keys (the user_upstreams grant set). Only id and display name
 * are exposed; upstream configuration stays admin-only.
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) {
    return auth;
  }
  if (auth.kind !== "user") {
    return errorResponse("Admin token has no personal data scope", 403);
  }

  try {
    const items = await listUserUpstreamOptions(auth.userId);
    return NextResponse.json({ items });
  } catch (error) {
    log.error({ err: error }, "failed to list user upstream options");
    return errorResponse("Internal server error", 500);
  }
}
