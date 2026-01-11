import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  testUpstreamConnection,
  formatTestUpstreamResponse,
  getDecryptedApiKey,
  type TestUpstreamInput,
} from "@/lib/services/upstream-service";
import { db, upstreams } from "@/lib/db";
import { eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/upstreams/[id]/test - Test existing upstream connection
 *
 * Tests connectivity to an existing upstream provider using its stored configuration.
 * This endpoint is useful for verifying that an upstream is still working correctly
 * after it has been saved to the database.
 *
 * **Authentication:** Requires valid admin bearer token in `Authorization` header.
 *
 * **Path Parameters:**
 * - `id` (required): UUID of the upstream to test
 *
 * **Request Body:** None - uses stored configuration from database
 *
 * **Response (200 OK - Success):**
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
 * - `401 Unauthorized`: Missing or invalid admin token
 * - `404 Not Found`: Upstream with the specified ID does not exist
 * - `500 Internal Server Error`: Database error, decryption failure, or unexpected error
 *
 * **Test Process:**
 * 1. Fetches upstream record from database by ID
 * 2. Decrypts stored API key using Fernet encryption
 * 3. Calls upstream provider's `/v1/models` endpoint with stored configuration
 * 4. Measures latency and validates response
 * 5. Returns structured test result (always 200 OK if upstream exists, check `success` field)
 *
 * **Common Error Types in Test Result:**
 * - `authentication`: Invalid or expired API key (HTTP 401/403)
 * - `network`: DNS failure, connection refused, unreachable host
 * - `timeout`: Request exceeded upstream's configured timeout
 * - `invalid_response`: Base URL changed or endpoint not found (404), server error (5xx)
 * - `unknown`: Unexpected errors during test
 *
 * **Use Cases:**
 * - Verify upstream is still operational after creation
 * - Check if API key is still valid
 * - Monitor upstream health from admin dashboard
 * - Diagnose connectivity issues with saved upstreams
 *
 * @param request - Next.js request object (no body required)
 * @param context - Route context containing path parameters
 * @param context.params - Promise resolving to path parameters
 * @param context.params.id - UUID of the upstream to test
 *
 * @returns JSON response with test results and HTTP 200 (check `success` field for test outcome)
 *
 * @example
 * ```bash
 * # Test an existing upstream
 * curl -X POST https://api.example.com/api/admin/upstreams/550e8400-e29b-41d4-a716-446655440000/test \
 *   -H "Authorization: Bearer admin-token-here"
 *
 * # Response on success
 * {
 *   "success": true,
 *   "message": "Connection successful",
 *   "latency_ms": 234,
 *   "status_code": 200,
 *   "tested_at": "2024-01-15T10:30:00.000Z"
 * }
 *
 * # Response when API key is invalid
 * {
 *   "success": false,
 *   "message": "Authentication failed - invalid API key",
 *   "latency_ms": 156,
 *   "status_code": 401,
 *   "error_type": "authentication",
 *   "error_details": "HTTP 401: Incorrect API key provided",
 *   "tested_at": "2024-01-15T10:30:00.000Z"
 * }
 * ```
 *
 * @see {@link testUpstreamConnection} for the underlying test logic
 * @see {@link getDecryptedApiKey} for API key decryption
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;

    // Fetch upstream from database
    const upstream = await db.query.upstreams.findFirst({
      where: eq(upstreams.id, id),
    });

    if (!upstream) {
      return errorResponse("Upstream not found", 404);
    }

    // Decrypt API key and prepare test input
    const decryptedApiKey = getDecryptedApiKey(upstream);

    const input: TestUpstreamInput = {
      provider: upstream.provider,
      baseUrl: upstream.baseUrl,
      apiKey: decryptedApiKey,
      timeout: upstream.timeout,
    };

    // Test the connection
    const result = await testUpstreamConnection(input);

    // Return test results
    return NextResponse.json(formatTestUpstreamResponse(result));
  } catch (error) {
    console.error("Failed to test upstream connection:", error instanceof Error ? error.message : "Unknown error");
    return errorResponse("Internal server error", 500);
  }
}
