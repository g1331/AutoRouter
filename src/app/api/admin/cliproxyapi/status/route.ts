import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { updateCliproxyApiConnection } from "@/lib/services/upstream-service";
import {
  buildCliproxyApiClient,
  connectionIdSchema,
  handleCliproxyApiRouteError,
  resolveCliproxyApiConnectionSecrets,
  transformCliproxyApiConnection,
} from "../_utils";

const statusQuerySchema = z.object({
  connection_id: connectionIdSchema,
});

const statusTestSchema = z.object({
  connection_id: connectionIdSchema,
  endpoint: z.enum(["proxy", "management", "outbound_proxy"]),
});

/**
 * GET /api/admin/cliproxyapi/status - Return the selected or default connection status snapshot.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!validateAdminAuth(request.headers.get("authorization"))) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const url = new URL(request.url);
    const query = statusQuerySchema.parse({ connection_id: url.searchParams.get("connection_id") });
    const connection = await resolveCliproxyApiConnectionSecrets(query.connection_id);
    return NextResponse.json({ connection: transformCliproxyApiConnection(connection) });
  } catch (error) {
    return handleCliproxyApiRouteError(error);
  }
}

/**
 * POST /api/admin/cliproxyapi/status - Test one CLIProxyAPI endpoint and persist the result.
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (!validateAdminAuth(request.headers.get("authorization"))) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const body = await request.json();
    const validated = statusTestSchema.parse(body);
    const connection = await resolveCliproxyApiConnectionSecrets(validated.connection_id);
    const result = await buildCliproxyApiClient(connection).testEndpoint(validated.endpoint);

    const updated = await updateCliproxyApiConnection(connection.id, {
      lastTestedAt: new Date(result.tested_at),
      lastStatus: result.ok ? "success" : "failed",
      lastError: result.ok ? null : result.message,
    });

    return NextResponse.json({
      result,
      connection: transformCliproxyApiConnection(updated),
    });
  } catch (error) {
    return handleCliproxyApiRouteError(error);
  }
}
