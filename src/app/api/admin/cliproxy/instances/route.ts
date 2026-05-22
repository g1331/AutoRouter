import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  listCliproxyInstances,
  createCliproxyInstance,
  CliproxyInstanceNameConflictError,
  InvalidCliproxyInstanceAddressError,
  CLIPROXY_INSTANCE_MODES,
} from "@/lib/services/cliproxy-instance-crud";
import { toCliproxyInstanceApiResponse } from "@/lib/utils/cliproxy-api-transformers";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-cliproxy-instances");

const createInstanceSchema = z.object({
  name: z.string().trim().min(1).max(64),
  mode: z.enum(CLIPROXY_INSTANCE_MODES),
  base_url: z.string().trim().min(1),
  management_url: z.string().trim().min(1),
  client_api_key: z.string().min(1),
  management_key: z.string().min(1),
  enabled: z.boolean().optional(),
  description: z.string().trim().max(512).nullable().optional(),
});

/**
 * GET /api/admin/cliproxy/instances - 列出全部 CLIProxyAPI 实例。
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!validateAdminAuth(request.headers.get("authorization"))) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const instances = await listCliproxyInstances();
    return NextResponse.json({ data: instances.map(toCliproxyInstanceApiResponse) });
  } catch (err) {
    log.error({ err }, "Failed to list CLIProxyAPI instances");
    return errorResponse("Internal server error", 500);
  }
}

/**
 * POST /api/admin/cliproxy/instances - 创建 CLIProxyAPI 实例。
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (!validateAdminAuth(request.headers.get("authorization"))) {
    return errorResponse("Unauthorized", 401);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const parsed = createInstanceSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid request body", 400);
  }

  try {
    const instance = await createCliproxyInstance({
      name: parsed.data.name,
      mode: parsed.data.mode,
      baseUrl: parsed.data.base_url,
      managementUrl: parsed.data.management_url,
      clientApiKey: parsed.data.client_api_key,
      managementKey: parsed.data.management_key,
      enabled: parsed.data.enabled,
      description: parsed.data.description ?? null,
    });
    return NextResponse.json({ data: toCliproxyInstanceApiResponse(instance) }, { status: 201 });
  } catch (err) {
    if (err instanceof CliproxyInstanceNameConflictError) {
      return errorResponse(err.message, 409);
    }
    if (err instanceof InvalidCliproxyInstanceAddressError) {
      return errorResponse(err.message, 400);
    }
    log.error({ err }, "Failed to create CLIProxyAPI instance");
    return errorResponse("Internal server error", 500);
  }
}
