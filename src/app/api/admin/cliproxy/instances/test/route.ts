import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { testCliproxyConnection } from "@/lib/services/cliproxy-connection-tester";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-cliproxy-instances");

const preTestSchema = z.object({
  management_url: z.string().trim().min(1),
  management_key: z.string().min(1),
});

/**
 * POST /api/admin/cliproxy/instances/test - 对未保存配置执行创建前连通性预检测。
 */
export async function POST(request: NextRequest): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const parsed = preTestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid request body", 400);
  }

  try {
    const result = await testCliproxyConnection({
      managementUrl: parsed.data.management_url,
      managementKey: parsed.data.management_key,
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    log.error({ err }, "Failed to pre-test CLIProxyAPI connection");
    return errorResponse("Internal server error", 500);
  }
}
