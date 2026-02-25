import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  testUpstreamConnection,
  formatTestUpstreamResponse,
  type TestUpstreamInput,
} from "@/lib/services/upstream-service";
import { z } from "zod";
import { createLogger } from "@/lib/utils/logger";
import { ROUTE_CAPABILITY_VALUES, normalizeRouteCapabilities } from "@/lib/route-capabilities";

const log = createLogger("admin-upstreams");

const testUpstreamSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  route_capabilities: z.array(z.enum(ROUTE_CAPABILITY_VALUES)).min(1),
  base_url: z.string().url("Base URL must be a valid URL"),
  api_key: z
    .string()
    .trim()
    .min(10, "API key must be at least 10 characters")
    .max(512, "API key must not exceed 512 characters"),
  timeout: z
    .number()
    .int("Timeout must be an integer")
    .positive("Timeout must be greater than 0")
    .max(300, "Timeout must not exceed 300 seconds")
    .default(10)
    .optional(),
});

/**
 * POST /api/admin/upstreams/test - Test upstream configuration before saving
 *
 * Tests connectivity to an upstream provider without saving the configuration to the database.
 * This endpoint is useful for validating upstream settings before creating or updating an upstream.
 *
 * **Authentication:** Requires valid admin bearer token in `Authorization` header.
 *
 * **Request Body:**
 * - `name` (optional): Human-readable name for the upstream (1-64 characters)
 * - `provider` (required): Provider type - must be "openai" or "anthropic"
 * - `base_url` (required): Base URL of the upstream API (must be valid URL format)
 * - `api_key` (required): API key for authentication (10-512 characters, plain text)
 * - `timeout` (optional): Timeout in seconds (1-300, defaults to 10)
 *
 * **Response (200 OK):**
 * ```json
 * {
 *   "success": true,
 *   "message": "Connection successful",
 *   "latency_ms": 245,
 *   "status_code": 200,
 *   "tested_at": "2024-01-15T10:30:00.000Z"
 * }
 * ```
 *
 * **Response (200 OK - Test Failed):**
 * ```json
 * {
 *   "success": false,
 *   "message": "Authentication failed - invalid API key",
 *   "latency_ms": 123,
 *   "status_code": 401,
 *   "error_type": "authentication",
 *   "error_details": "HTTP 401: Invalid API key",
 *   "tested_at": "2024-01-15T10:30:00.000Z"
 * }
 * ```
 *
 * **Error Responses:**
 * - `400 Bad Request`: Validation error (invalid provider, malformed URL, etc.)
 * - `401 Unauthorized`: Missing or invalid admin token
 * - `500 Internal Server Error`: Unexpected server error
 *
 * **Test Process:**
 * 1. Validates request body against Zod schema
 * 2. Calls upstream provider's `/v1/models` endpoint with provided credentials
 * 3. Measures latency and validates response
 * 4. Returns structured test result (always 200 OK, check `success` field)
 *
 * **Common Error Types:**
 * - `authentication`: Invalid API key (HTTP 401/403)
 * - `network`: DNS failure, connection refused, unreachable host
 * - `timeout`: Request exceeded timeout duration
 * - `invalid_response`: Wrong base URL (404), server error (5xx)
 * - `unknown`: Unsupported provider, unexpected errors
 *
 * @param request - Next.js request object with JSON body
 * @returns JSON response with test results and HTTP 200 (check `success` field for test outcome)
 *
 * @example
 * ```bash
 * # Test OpenAI configuration
 * curl -X POST https://api.example.com/api/admin/upstreams/test \
 *   -H "Authorization: Bearer admin-token-here" \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "provider": "openai",
 *     "base_url": "https://api.openai.com",
 *     "api_key": "sk-proj-...",
 *     "timeout": 10
 *   }'
 *
 * # Test Anthropic configuration
 * curl -X POST https://api.example.com/api/admin/upstreams/test \
 *   -H "Authorization: Bearer admin-token-here" \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "provider": "anthropic",
 *     "base_url": "https://api.anthropic.com",
 *     "api_key": "sk-ant-..."
 *   }'
 * ```
 *
 * @see {@link testUpstreamConnection} for the underlying test logic
 * @see {@link testUpstreamSchema} for request validation schema
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const body = await request.json();
    const validated = testUpstreamSchema.parse(body);

    const input: TestUpstreamInput = {
      routeCapabilities: normalizeRouteCapabilities(validated.route_capabilities),
      baseUrl: validated.base_url,
      apiKey: validated.api_key,
      timeout: validated.timeout,
    };

    const result = await testUpstreamConnection(input);

    return NextResponse.json(formatTestUpstreamResponse(result));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    log.error({ err: error }, "failed to test upstream connection");
    return errorResponse("Internal server error", 500);
  }
}
