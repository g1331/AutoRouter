import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { listCliproxyInstanceLogs } from "@/lib/services/cliproxy-instance-logs-service";
import { handleCliproxyRouteError } from "@/lib/utils/cliproxy-route-errors";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-cliproxy-logs");

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/cliproxy/instances/:id/logs?since=ISO_TIMESTAMP - 查询实例日志。
 *
 * 透传到 CLIProxyAPI 的 `/v0/management/logs` 端点。`since` 为可选的 ISO 时间戳，
 * 用于增量拉取；未传时返回上游默认窗口内的全部日志。
 */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  if (!validateAdminAuth(request.headers.get("authorization"))) {
    return errorResponse("Unauthorized", 401);
  }

  const { id } = await context.params;
  const since = new URL(request.url).searchParams.get("since") ?? undefined;

  try {
    const entries = await listCliproxyInstanceLogs(id, since);
    return NextResponse.json({ data: entries });
  } catch (err) {
    const mapped = handleCliproxyRouteError(err);
    if (mapped) {
      return mapped;
    }
    log.error({ err }, "Failed to fetch CLIProxyAPI instance logs");
    return errorResponse("Internal server error", 500);
  }
}
