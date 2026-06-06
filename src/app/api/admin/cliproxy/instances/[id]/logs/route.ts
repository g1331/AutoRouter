import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { listCliproxyInstanceLogs } from "@/lib/services/cliproxy-instance-logs-service";
import { handleCliproxyRouteError } from "@/lib/utils/cliproxy-route-errors";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-cliproxy-logs");

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/cliproxy/instances/:id/logs?limit&after - 查询实例日志。
 *
 * 透传到 CLIProxyAPI 的 `/v0/management/logs` 端点。`limit` 限制单次返回行数，
 * `after` 为 Unix 秒，仅返回时间戳大于该值的行（用于增量轮询）。
 * 上游要求开启 `LoggingToFile`，否则返回 400。
 */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const rawLimit = searchParams.get("limit");
  const rawAfter = searchParams.get("after");

  const limit = rawLimit !== null ? Number(rawLimit) : undefined;
  const after = rawAfter !== null ? Number(rawAfter) : undefined;

  if (limit !== undefined && !Number.isFinite(limit)) {
    return errorResponse("limit must be a finite number", 400);
  }
  if (after !== undefined && !Number.isFinite(after)) {
    return errorResponse("after must be a finite Unix timestamp", 400);
  }

  try {
    const result = await listCliproxyInstanceLogs(id, { limit, after });
    return NextResponse.json({ data: result });
  } catch (err) {
    const mapped = handleCliproxyRouteError(err);
    if (mapped) {
      return mapped;
    }
    log.error({ err }, "Failed to fetch CLIProxyAPI instance logs");
    return errorResponse("Internal server error", 500);
  }
}
