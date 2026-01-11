import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  testUpstreamConnection,
  getDecryptedApiKey,
  type TestUpstreamInput,
} from "@/lib/services/upstream-service";
import { db, upstreams } from "@/lib/db";
import { eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/upstreams/[id]/test - Test existing upstream connection
 *
 * Tests connectivity to an existing upstream provider by its ID.
 * Fetches the upstream from the database, decrypts the API key, and validates
 * the connection by making a lightweight API call to the provider.
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
    return NextResponse.json({
      success: result.success,
      message: result.message,
      latency_ms: result.latencyMs,
      status_code: result.statusCode,
      error_type: result.errorType,
      error_details: result.errorDetails,
      tested_at: result.testedAt.toISOString(),
    });
  } catch (error) {
    console.error("Failed to test upstream connection:", error);
    return errorResponse("Internal server error", 500);
  }
}
