import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  CliproxyApiClientError,
  CliproxyApiConnectionNotFoundError,
  createCliproxyApiManagementClient,
  getCliproxyApiConnectionWithSecrets,
  getDefaultCliproxyApiConnection,
  listCliproxyApiConnections,
  type CliproxyApiConnectionResponse,
  type CliproxyApiConnectionSecrets,
} from "@/lib/services/upstream-service";
import type { CliproxyApiConnectionConfig } from "@/types/api";

export const cliproxyApiConnectionSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(64),
  mode: z.enum(["external", "managed_sidecar"]),
  base_url: z.string().url(),
  client_api_key: z.string().trim().min(1).nullable().optional(),
  management_url: z.string().url(),
  management_secret: z.string().trim().min(1).nullable().optional(),
  outbound_proxy_url: z.string().trim().min(1).nullable().optional(),
  is_enabled: z.boolean().optional(),
  is_default: z.boolean().optional(),
});

export const connectionIdSchema = z.string().trim().min(1).nullable().optional();

/**
 * Convert service-layer connection data to the public admin API shape without plaintext secrets.
 */
export function transformCliproxyApiConnection(
  connection: CliproxyApiConnectionResponse
): CliproxyApiConnectionConfig {
  return {
    id: connection.id,
    name: connection.name,
    mode: connection.mode,
    base_url: connection.baseUrl,
    client_api_key_masked: connection.clientApiKeyMasked,
    client_api_key_configured: connection.clientApiKeyConfigured,
    management_url: connection.managementUrl,
    management_secret_masked: connection.managementSecretMasked,
    management_secret_configured: connection.managementSecretConfigured,
    outbound_proxy_url: connection.outboundProxyUrl,
    is_enabled: connection.isEnabled,
    is_default: connection.isDefault,
    last_tested_at: connection.lastTestedAt?.toISOString() ?? null,
    last_status: connection.lastStatus,
    last_error: connection.lastError,
    created_at: connection.createdAt.toISOString(),
    updated_at: connection.updatedAt.toISOString(),
  };
}

/**
 * Resolve a requested connection, falling back to the default connection and then the first saved one.
 */
export async function resolveCliproxyApiConnectionSecrets(
  connectionId: string | null | undefined
): Promise<CliproxyApiConnectionSecrets> {
  if (connectionId) return getCliproxyApiConnectionWithSecrets(connectionId);

  const defaultConnection = await getDefaultCliproxyApiConnection();
  if (defaultConnection) return getCliproxyApiConnectionWithSecrets(defaultConnection.id);

  const [firstConnection] = await listCliproxyApiConnections();
  if (firstConnection) return getCliproxyApiConnectionWithSecrets(firstConnection.id);

  throw new CliproxyApiConnectionNotFoundError("default");
}

/**
 * Build a management client from decrypted connection details.
 */
export function buildCliproxyApiClient(connection: CliproxyApiConnectionSecrets) {
  return createCliproxyApiManagementClient({
    baseUrl: connection.baseUrl,
    clientApiKey: connection.clientApiKey,
    managementUrl: connection.managementUrl,
    managementSecret: connection.managementSecret,
    outboundProxyUrl: connection.outboundProxyUrl,
  });
}

/**
 * Map validation, configuration, and upstream service errors to admin API responses.
 */
export function handleCliproxyApiRouteError(error: unknown): NextResponse {
  if (error instanceof CliproxyApiConnectionNotFoundError) {
    return errorResponse("CLIProxyAPI connection not found", 404);
  }
  if (error instanceof CliproxyApiClientError) {
    if (error.statusCode === 404) {
      return errorResponse(
        "CLIProxyAPI management endpoint returned 404. Confirm the Management URL points to a CPA instance with remote management enabled.",
        502
      );
    }
    return errorResponse(error.message, 502);
  }
  if (error instanceof z.ZodError) {
    return errorResponse(
      `Validation error: ${error.issues.map((issue) => issue.message).join(", ")}`,
      400
    );
  }
  return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
}
