import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  buildCliproxyApiAccountUpstreamPreset,
  buildCliproxyApiUpstreamPresets,
} from "@/lib/services/upstream-service";
import {
  connectionIdSchema,
  handleCliproxyApiRouteError,
  resolveCliproxyApiConnectionSecrets,
} from "@/app/api/admin/cliproxyapi/_utils";

const presetsQuerySchema = z.object({
  connection_id: connectionIdSchema,
});

const accountPresetSchema = z.object({
  connection_id: connectionIdSchema,
  provider: z.enum(["codex", "claude", "gemini"]),
  account_name: z.string().trim().min(1),
  account_prefix: z.string().trim().min(1).nullable().optional(),
  models: z.array(z.string().trim().min(1)).default([]),
});

/**
 * GET /api/admin/cliproxyapi/presets - Return OAuth pool upstream presets.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!validateAdminAuth(request.headers.get("authorization"))) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const url = new URL(request.url);
    const query = presetsQuerySchema.parse({
      connection_id: url.searchParams.get("connection_id"),
    });
    const connection = await resolveCliproxyApiConnectionSecrets(query.connection_id);
    return NextResponse.json({
      items: buildCliproxyApiUpstreamPresets(connection.id, connection.baseUrl),
    });
  } catch (error) {
    return handleCliproxyApiRouteError(error);
  }
}

/**
 * POST /api/admin/cliproxyapi/presets - Return a fixed-account upstream preset.
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (!validateAdminAuth(request.headers.get("authorization"))) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const body = await request.json();
    const validated = accountPresetSchema.parse(body);
    const connection = await resolveCliproxyApiConnectionSecrets(validated.connection_id);
    return NextResponse.json(
      buildCliproxyApiAccountUpstreamPreset({
        connectionId: connection.id,
        connectionBaseUrl: connection.baseUrl,
        provider: validated.provider,
        accountName: validated.account_name,
        accountPrefix: validated.account_prefix ?? null,
        models: validated.models,
      })
    );
  } catch (error) {
    return handleCliproxyApiRouteError(error);
  }
}
