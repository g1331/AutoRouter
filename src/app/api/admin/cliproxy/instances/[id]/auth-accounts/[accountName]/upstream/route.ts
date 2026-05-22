import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { createCliproxySingleAccountUpstream } from "@/lib/services/cliproxy-upstream-preset";
import { transformUpstreamToApi } from "@/lib/utils/api-transformers";
import { handleCliproxyRouteError } from "@/lib/utils/cliproxy-route-errors";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-cliproxy-account-upstream");

type RouteContext = { params: Promise<{ id: string; accountName: string }> };

const createAccountUpstreamSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  weight: z.number().int().min(0).optional(),
  priority: z.number().int().min(0).optional(),
  prefix: z.string().trim().min(1).max(128).optional(),
});

/**
 * POST /api/admin/cliproxy/instances/:id/auth-accounts/:accountName/upstream
 * 将单个 OAuth 账号固定映射为一个上游。
 */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  if (!validateAdminAuth(request.headers.get("authorization"))) {
    return errorResponse("Unauthorized", 401);
  }

  const { id, accountName } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const parsed = createAccountUpstreamSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid request body", 400);
  }

  try {
    const upstream = await createCliproxySingleAccountUpstream(
      id,
      decodeURIComponent(accountName),
      {
        name: parsed.data.name,
        weight: parsed.data.weight,
        priority: parsed.data.priority,
        prefix: parsed.data.prefix,
      }
    );
    return NextResponse.json({ data: transformUpstreamToApi(upstream) }, { status: 201 });
  } catch (err) {
    const mapped = handleCliproxyRouteError(err);
    if (mapped) {
      return mapped;
    }
    log.error({ err }, "Failed to create CLIProxyAPI single-account upstream");
    return errorResponse(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
