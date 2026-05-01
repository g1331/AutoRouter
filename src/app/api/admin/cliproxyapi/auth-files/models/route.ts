import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  buildCliproxyApiClient,
  connectionIdSchema,
  handleCliproxyApiRouteError,
  resolveCliproxyApiConnectionSecrets,
} from "@/app/api/admin/cliproxyapi/_utils";

const modelsQuerySchema = z.object({
  connection_id: connectionIdSchema,
  name: z.string().trim().min(1),
});

/**
 * GET /api/admin/cliproxyapi/auth-files/models - List models for one CLIProxyAPI auth file.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!validateAdminAuth(request.headers.get("authorization"))) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const url = new URL(request.url);
    const query = modelsQuerySchema.parse({
      connection_id: url.searchParams.get("connection_id"),
      name: url.searchParams.get("name"),
    });
    const connection = await resolveCliproxyApiConnectionSecrets(query.connection_id);
    const models = await buildCliproxyApiClient(connection).listAuthFileModels(query.name);
    return NextResponse.json({ items: models });
  } catch (error) {
    return handleCliproxyApiRouteError(error);
  }
}
