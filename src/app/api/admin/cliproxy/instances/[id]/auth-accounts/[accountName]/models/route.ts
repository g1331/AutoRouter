import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { listCliproxyAccountModels } from "@/lib/services/cliproxy-auth-account-service";
import { handleCliproxyRouteError } from "@/lib/utils/cliproxy-route-errors";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-cliproxy-account-models");

type RouteContext = { params: Promise<{ id: string; accountName: string }> };

/**
 * GET /api/admin/cliproxy/instances/:id/auth-accounts/:accountName/models -
 * 查询账号在 CLIProxyAPI 侧的可用模型列表。
 *
 * 本端点为只读窗口，不写入任何本地缓存。
 */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id, accountName } = await context.params;

  try {
    const models = await listCliproxyAccountModels(id, decodeURIComponent(accountName));
    return NextResponse.json({ data: models });
  } catch (err) {
    const mapped = handleCliproxyRouteError(err);
    if (mapped) {
      return mapped;
    }
    log.error({ err }, "Failed to list CLIProxyAPI auth account models");
    return errorResponse("Internal server error", 500);
  }
}
