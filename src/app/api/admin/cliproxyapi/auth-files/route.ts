import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  buildCliproxyApiClient,
  connectionIdSchema,
  handleCliproxyApiRouteError,
  resolveCliproxyApiConnectionSecrets,
} from "../_utils";

const authFilesQuerySchema = z.object({
  connection_id: connectionIdSchema,
});

const updateAuthFileSchema = z.object({
  connection_id: connectionIdSchema,
  name: z.string().trim().min(1),
  disabled: z.boolean().optional(),
  fields: z
    .object({
      prefix: z.string().trim().min(1).nullable().optional(),
      proxy_url: z.string().trim().min(1).nullable().optional(),
      headers: z.record(z.string(), z.string()).nullable().optional(),
      priority: z.number().int().nullable().optional(),
      note: z.string().trim().min(1).nullable().optional(),
    })
    .optional(),
});

/**
 * GET /api/admin/cliproxyapi/auth-files - List OAuth auth files from CLIProxyAPI.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!validateAdminAuth(request.headers.get("authorization"))) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const url = new URL(request.url);
    const query = authFilesQuerySchema.parse({
      connection_id: url.searchParams.get("connection_id"),
    });
    const connection = await resolveCliproxyApiConnectionSecrets(query.connection_id);
    const accounts = await buildCliproxyApiClient(connection).listAuthFiles();
    return NextResponse.json({ items: accounts });
  } catch (error) {
    return handleCliproxyApiRouteError(error);
  }
}

/**
 * PATCH /api/admin/cliproxyapi/auth-files - Update auth file status or editable fields.
 */
export async function PATCH(request: NextRequest): Promise<Response> {
  if (!validateAdminAuth(request.headers.get("authorization"))) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const body = await request.json();
    const validated = updateAuthFileSchema.parse(body);
    const connection = await resolveCliproxyApiConnectionSecrets(validated.connection_id);
    const client = buildCliproxyApiClient(connection);

    if (validated.disabled !== undefined) {
      await client.updateAuthFileStatus(validated.name, validated.disabled);
    }
    if (validated.fields) {
      await client.updateAuthFileFields(validated.name, validated.fields);
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    return handleCliproxyApiRouteError(error);
  }
}
