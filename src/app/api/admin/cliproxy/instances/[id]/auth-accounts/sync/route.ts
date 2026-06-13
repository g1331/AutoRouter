import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { syncCliproxyAuthAccounts } from "@/lib/services/cliproxy-auth-account-service";
import { handleCliproxyRouteError } from "@/lib/utils/cliproxy-route-errors";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-cliproxy-auth-accounts");

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/cliproxy/instances/:id/auth-accounts/sync - 触发实例账号同步。
 */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await context.params;
  try {
    const result = await syncCliproxyAuthAccounts(id);
    return NextResponse.json({ data: result });
  } catch (err) {
    const mapped = handleCliproxyRouteError(err);
    if (mapped) {
      return mapped;
    }
    log.error({ err }, "Failed to sync CLIProxyAPI auth accounts");
    return errorResponse("Internal server error", 500);
  }
}
