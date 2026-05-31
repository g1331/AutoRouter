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
 * 按 RFC 6266 构造 Content-Disposition 头。
 *
 * 文件名先过滤 CR/LF 与控制字符，避免响应头被拆分；同时输出
 * `filename`（ASCII fallback）与 `filename*`（UTF-8 百分号编码）两种形式，
 * 让任意字符的认证文件名都能被浏览器安全保存。
 */
function buildContentDisposition(filename: string): string {
  const sanitized = filename.replace(/[\r\n\x00-\x1f]/g, "_");
  const asciiFallback = sanitized.replace(/[^\x20-\x7e]/g, "?").replace(/[\\"]/g, "_");
  const utf8Encoded = encodeURIComponent(sanitized);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`;
}

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
        "Content-Disposition": buildContentDisposition(authFileName),
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
