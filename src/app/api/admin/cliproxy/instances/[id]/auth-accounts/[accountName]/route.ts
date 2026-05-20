import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { updateCliproxyAuthAccountFields } from "@/lib/services/cliproxy-auth-account-service";
import { toCliproxyAuthAccountApiResponse } from "@/lib/utils/cliproxy-api-transformers";
import { handleCliproxyRouteError } from "@/lib/utils/cliproxy-route-errors";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-cliproxy-auth-accounts");

type RouteContext = { params: Promise<{ id: string; accountName: string }> };

const updateFieldsSchema = z
  .object({
    prefix: z.string().trim().max(128).optional(),
    proxy_url: z.string().trim().max(512).optional(),
    priority: z.number().int().optional(),
    note: z.string().trim().max(512).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

/**
 * PATCH /api/admin/cliproxy/instances/:id/auth-accounts/:accountName - 更新账号字段。
 */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
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

  const parsed = updateFieldsSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid request body", 400);
  }

  try {
    const account = await updateCliproxyAuthAccountFields(id, decodeURIComponent(accountName), {
      prefix: parsed.data.prefix,
      proxyUrl: parsed.data.proxy_url,
      priority: parsed.data.priority,
      note: parsed.data.note,
    });
    return NextResponse.json({ data: toCliproxyAuthAccountApiResponse(account) });
  } catch (err) {
    const mapped = handleCliproxyRouteError(err);
    if (mapped) {
      return mapped;
    }
    log.error({ err }, "Failed to update CLIProxyAPI auth account fields");
    return errorResponse("Internal server error", 500);
  }
}
