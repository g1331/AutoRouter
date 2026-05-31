import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { uploadCliproxyAuthFile } from "@/lib/services/cliproxy-auth-account-service";
import { handleCliproxyRouteError } from "@/lib/utils/cliproxy-route-errors";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-cliproxy-auth-files");

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/cliproxy/instances/:id/auth-files - 上传认证文件至 CLIProxyAPI。
 *
 * 请求体为认证文件的完整 JSON 对象，由调用方构造。
 * 上传成功后立即触发该实例的账号同步，返回同步结果。
 */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  if (!validateAdminAuth(request.headers.get("authorization"))) {
    return errorResponse("Unauthorized", 401);
  }

  const { id } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return errorResponse("Request body must be a JSON object", 400);
  }

  try {
    const syncResult = await uploadCliproxyAuthFile(id, rawBody as Record<string, unknown>);
    return NextResponse.json({ data: syncResult }, { status: 201 });
  } catch (err) {
    const mapped = handleCliproxyRouteError(err);
    if (mapped) {
      return mapped;
    }
    log.error({ err }, "Failed to upload CLIProxyAPI auth file");
    return errorResponse("Internal server error", 500);
  }
}
