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

const oauthQuerySchema = z
  .object({
    connection_id: connectionIdSchema,
    provider: z.enum(["codex", "claude", "gemini"]).optional(),
    state: z.string().trim().min(1).optional(),
    is_webui: z.enum(["true", "false"]).optional(),
    project_id: z.string().trim().min(1).nullable().optional(),
  })
  .refine((query) => Boolean(query.state) || Boolean(query.provider), {
    message: "provider or state is required",
    path: ["provider"],
  });

/**
 * GET /api/admin/cliproxyapi/oauth - Start OAuth login or poll an OAuth state.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!validateAdminAuth(request.headers.get("authorization"))) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const url = new URL(request.url);
    const query = oauthQuerySchema.parse({
      connection_id: url.searchParams.get("connection_id"),
      provider: url.searchParams.get("provider") ?? undefined,
      state: url.searchParams.get("state") ?? undefined,
      is_webui: url.searchParams.get("is_webui") ?? undefined,
      project_id: url.searchParams.get("project_id"),
    });
    const connection = await resolveCliproxyApiConnectionSecrets(query.connection_id);
    const client = buildCliproxyApiClient(connection);
    const result = query.state
      ? await client.getAuthStatus(query.state)
      : await client.getAuthUrl(query.provider!, {
          isWebUi: query.is_webui === "true",
          projectId: query.project_id ?? null,
        });

    return NextResponse.json(result);
  } catch (error) {
    return handleCliproxyApiRouteError(error);
  }
}
