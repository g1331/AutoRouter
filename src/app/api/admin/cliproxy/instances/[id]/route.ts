import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import {
  getCliproxyInstanceById,
  updateCliproxyInstance,
  deleteCliproxyInstance,
  CliproxyInstanceNotFoundError,
  CliproxyInstanceNameConflictError,
  CliproxyInstanceInUseError,
  InvalidCliproxyInstanceAddressError,
  CLIPROXY_INSTANCE_MODES,
} from "@/lib/services/cliproxy-instance-crud";
import { toCliproxyInstanceApiResponse } from "@/lib/utils/cliproxy-api-transformers";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-cliproxy-instances");

type RouteContext = { params: Promise<{ id: string }> };

const updateInstanceSchema = z
  .object({
    name: z.string().trim().min(1).max(64).optional(),
    mode: z.enum(CLIPROXY_INSTANCE_MODES).optional(),
    base_url: z.string().trim().min(1).optional(),
    management_url: z.string().trim().min(1).optional(),
    client_api_key: z.string().min(1).optional(),
    management_key: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    description: z.string().trim().max(512).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

/**
 * GET /api/admin/cliproxy/instances/:id - 查询指定实例详情。
 */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await context.params;
  try {
    const instance = await getCliproxyInstanceById(id);
    if (!instance) {
      return errorResponse("CLIProxyAPI instance not found", 404);
    }
    return NextResponse.json({ data: toCliproxyInstanceApiResponse(instance) });
  } catch (err) {
    log.error({ err }, "Failed to get CLIProxyAPI instance");
    return errorResponse("Internal server error", 500);
  }
}

/**
 * PATCH /api/admin/cliproxy/instances/:id - 更新指定实例。
 */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const parsed = updateInstanceSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid request body", 400);
  }

  try {
    const instance = await updateCliproxyInstance(id, {
      name: parsed.data.name,
      mode: parsed.data.mode,
      baseUrl: parsed.data.base_url,
      managementUrl: parsed.data.management_url,
      clientApiKey: parsed.data.client_api_key,
      managementKey: parsed.data.management_key,
      enabled: parsed.data.enabled,
      description: parsed.data.description,
    });
    return NextResponse.json({ data: toCliproxyInstanceApiResponse(instance) });
  } catch (err) {
    if (err instanceof CliproxyInstanceNotFoundError) {
      return errorResponse("CLIProxyAPI instance not found", 404);
    }
    if (err instanceof CliproxyInstanceNameConflictError) {
      return errorResponse(err.message, 409);
    }
    if (err instanceof InvalidCliproxyInstanceAddressError) {
      return errorResponse(err.message, 400);
    }
    log.error({ err }, "Failed to update CLIProxyAPI instance");
    return errorResponse("Internal server error", 500);
  }
}

/**
 * DELETE /api/admin/cliproxy/instances/:id - 删除指定实例。
 */
export async function DELETE(request: NextRequest, context: RouteContext): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await context.params;
  try {
    await deleteCliproxyInstance(id);
    return NextResponse.json({ data: { id } });
  } catch (err) {
    if (err instanceof CliproxyInstanceNotFoundError) {
      return errorResponse("CLIProxyAPI instance not found", 404);
    }
    if (err instanceof CliproxyInstanceInUseError) {
      return errorResponse(err.message, 409);
    }
    log.error({ err }, "Failed to delete CLIProxyAPI instance");
    return errorResponse("Internal server error", 500);
  }
}
