import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireMember } from "@/lib/utils/api-auth";
import { listUserUpstreamOptions } from "@/lib/services/user-data-service";
import { getPortalSettings } from "@/lib/services/portal-settings-service";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("user-upstreams");

/**
 * GET /api/user/upstreams - Upstreams the caller may authorize on
 * self-service keys (the user_upstreams grant set). Only id and display name
 * are exposed; upstream configuration stays admin-only.
 *
 * `upstreams_visible` reports the admin setting. While it is false — the
 * default — the list is empty by design: the gateway is a single access point
 * that routes inside the granted set on its own, and no upstream identity is
 * exposed to members.
 */
export async function GET(request: NextRequest) {
  const auth = await requireMember(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { exposeUpstreams } = await getPortalSettings();
    const items = exposeUpstreams ? await listUserUpstreamOptions(auth.userId) : [];
    return NextResponse.json({ upstreams_visible: exposeUpstreams, items });
  } catch (error) {
    log.error({ err: error }, "failed to list user upstream options");
    return errorResponse("Internal server error", 500);
  }
}
