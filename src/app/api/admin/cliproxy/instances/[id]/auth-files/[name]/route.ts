import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  deleteCliproxyAuthAccount,
  downloadCliproxyAuthFile,
} from "@/lib/services/cliproxy-auth-account-service";
import { handleCliproxyRouteError } from "@/lib/utils/cliproxy-route-errors";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-cliproxy-auth-files");

type RouteContext = { params: Promise<{ id: string; name: string }> };

/**
 * GET /api/admin/cliproxy/instances/:id/auth-files/:name - 下载认证文件原始 JSON。
 */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  if (!validateAdminAuth(request.headers.get("authorization"))) {
    return errorResponse("Unauthorized", 401);
  }

  const { id, name } = await context.params;
  const authFileName = decodeURIComponent(name);

  try {
    const content = await downloadCliproxyAuthFile(id, authFileName);
    return new NextResponse(JSON.stringify(content), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${authFileName.replace(/"/g, '\\"')}"`,
      },
    });
  } catch (err) {
    const mapped = handleCliproxyRouteError(err);
    if (mapped) {
      return mapped;
    }
    log.error({ err }, "Failed to download CLIProxyAPI auth file");
    return errorResponse("Internal server error", 500);
  }
}

/**
 * DELETE /api/admin/cliproxy/instances/:id/auth-files/:name - 删除认证文件并清理本地缓存。
 */
export async function DELETE(request: NextRequest, context: RouteContext): Promise<Response> {
  if (!validateAdminAuth(request.headers.get("authorization"))) {
    return errorResponse("Unauthorized", 401);
  }

  const { id, name } = await context.params;
  const authFileName = decodeURIComponent(name);

  try {
    await deleteCliproxyAuthAccount(id, authFileName);
    return NextResponse.json({ data: { name: authFileName } });
  } catch (err) {
    const mapped = handleCliproxyRouteError(err);
    if (mapped) {
      return mapped;
    }
    log.error({ err }, "Failed to delete CLIProxyAPI auth file");
    return errorResponse("Internal server error", 500);
  }
}
