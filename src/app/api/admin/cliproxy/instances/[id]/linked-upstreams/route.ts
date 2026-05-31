import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { listCliproxyLinkedUpstreams } from "@/lib/services/cliproxy-linked-upstreams-service";
import { handleCliproxyRouteError } from "@/lib/utils/cliproxy-route-errors";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-cliproxy-linked-upstreams");

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/cliproxy/instances/:id/linked-upstreams - 查询实例下的关联上游列表。
 *
 * 数据来源于本地 upstreams 表中 `cliproxyInstanceId` 匹配的记录，不需要访问 CLIProxyAPI。
 * 单账号上游通过 `cliproxyAuthFileName` 非空识别，其余视为池上游。
 */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  if (!validateAdminAuth(request.headers.get("authorization"))) {
    return errorResponse("Unauthorized", 401);
  }

  const { id } = await context.params;

  try {
    const upstreams = await listCliproxyLinkedUpstreams(id);
    const data = upstreams.map((row) => ({
      id: row.id,
      name: row.name,
      provider: row.provider,
      kind: row.kind,
      auth_file_name: row.authFileName,
      is_active: row.isActive,
      created_at: row.createdAt.toISOString(),
    }));
    return NextResponse.json({ data });
  } catch (err) {
    const mapped = handleCliproxyRouteError(err);
    if (mapped) {
      return mapped;
    }
    log.error({ err }, "Failed to list CLIProxyAPI linked upstreams");
    return errorResponse("Internal server error", 500);
  }
}
