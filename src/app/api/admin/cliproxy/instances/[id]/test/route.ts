import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import {
  getCliproxyInstanceRow,
  getDecryptedManagementKey,
} from "@/lib/services/cliproxy-instance-crud";
import { testCliproxyConnection } from "@/lib/services/cliproxy-connection-tester";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-cliproxy-instances");

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/cliproxy/instances/:id/test - 对已保存实例执行管理 API 连通性检测。
 */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await context.params;
  try {
    const row = await getCliproxyInstanceRow(id);
    if (!row) {
      return errorResponse("CLIProxyAPI instance not found", 404);
    }

    const result = await testCliproxyConnection({
      managementUrl: row.managementUrl,
      managementKey: getDecryptedManagementKey(row),
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    log.error({ err }, "Failed to test CLIProxyAPI instance connection");
    return errorResponse("Internal server error", 500);
  }
}
