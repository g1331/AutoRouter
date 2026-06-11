import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { getCliproxyInstanceById } from "@/lib/services/cliproxy-instance-crud";
import { listCliproxyAuthAccounts } from "@/lib/services/cliproxy-auth-account-service";
import { toCliproxyAuthAccountApiResponse } from "@/lib/utils/cliproxy-api-transformers";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-cliproxy-auth-accounts");

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/cliproxy/instances/:id/auth-accounts - 列出实例下缓存的 OAuth 账号。
 */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await context.params;
  try {
    const instance = await getCliproxyInstanceById(id);
    if (!instance) {
      return errorResponse("CLIProxyAPI instance not found", 404);
    }
    const accounts = await listCliproxyAuthAccounts(id);
    return NextResponse.json({ data: accounts.map(toCliproxyAuthAccountApiResponse) });
  } catch (err) {
    log.error({ err }, "Failed to list CLIProxyAPI auth accounts");
    return errorResponse("Internal server error", 500);
  }
}
