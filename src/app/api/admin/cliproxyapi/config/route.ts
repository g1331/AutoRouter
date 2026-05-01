import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  createCliproxyApiConnection,
  listCliproxyApiConnections,
  updateCliproxyApiConnection,
} from "@/lib/services/upstream-service";
import {
  cliproxyApiConnectionSchema,
  handleCliproxyApiRouteError,
  transformCliproxyApiConnection,
} from "../_utils";

/**
 * GET /api/admin/cliproxyapi/config - List saved CLIProxyAPI connections.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!validateAdminAuth(request.headers.get("authorization"))) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const items = await listCliproxyApiConnections();
    return NextResponse.json({
      items: items.map(transformCliproxyApiConnection),
      default_connection: items.find((item) => item.isDefault)
        ? transformCliproxyApiConnection(items.find((item) => item.isDefault)!)
        : null,
    });
  } catch (error) {
    return handleCliproxyApiRouteError(error);
  }
}

/**
 * POST /api/admin/cliproxyapi/config - Create or update a CLIProxyAPI connection.
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (!validateAdminAuth(request.headers.get("authorization"))) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const body = await request.json();
    const validated = cliproxyApiConnectionSchema.parse(body);
    const input = {
      name: validated.name,
      mode: validated.mode,
      baseUrl: validated.base_url,
      clientApiKey: validated.client_api_key,
      managementUrl: validated.management_url,
      managementSecret: validated.management_secret,
      outboundProxyUrl: validated.outbound_proxy_url,
      isEnabled: validated.is_enabled,
      isDefault: validated.is_default,
    };

    const result = validated.id
      ? await updateCliproxyApiConnection(validated.id, input)
      : await createCliproxyApiConnection(input);

    return NextResponse.json(transformCliproxyApiConnection(result), {
      status: validated.id ? 200 : 201,
    });
  } catch (error) {
    return handleCliproxyApiRouteError(error);
  }
}
