import { NextRequest, NextResponse } from "next/server";
import { getCliproxyAccountUsage } from "@/lib/services/cliproxy-account-usage-service";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { handleCliproxyRouteError } from "@/lib/utils/cliproxy-route-errors";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-cliproxy-account-usage");
type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/admin/cliproxy/instances/:id/auth-accounts/usage - 只读账号用量快照。 */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  try {
    return NextResponse.json({ data: await getCliproxyAccountUsage(id) });
  } catch (err) {
    const mapped = handleCliproxyRouteError(err);
    if (mapped) return mapped;
    log.error({ err }, "Failed to read CLIProxyAPI account usage");
    return errorResponse("Internal server error", 500);
  }
}
