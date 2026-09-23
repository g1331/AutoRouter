import { NextRequest, NextResponse } from "next/server";
import { getCliproxyProviderQuota } from "@/lib/services/cliproxy-provider-quota-service";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { handleCliproxyRouteError } from "@/lib/utils/cliproxy-route-errors";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-cliproxy-provider-quota");
type RouteContext = { params: Promise<{ id: string; accountName: string }> };

/** GET /api/admin/cliproxy/instances/:id/auth-accounts/:accountName/provider-quota */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id, accountName } = await context.params;
  try {
    return NextResponse.json({ data: await getCliproxyProviderQuota(id, accountName) });
  } catch (err) {
    const mapped = handleCliproxyRouteError(err);
    if (mapped) return mapped;
    log.error({ err }, "Failed to read CLIProxyAPI provider quota");
    return errorResponse("Internal server error", 500);
  }
}
