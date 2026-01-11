import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { testUpstreamConnection, type TestUpstreamInput } from "@/lib/services/upstream-service";
import { z } from "zod";

const testUpstreamSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  provider: z.enum(["openai", "anthropic"]),
  base_url: z.string().url("Base URL must be a valid URL"),
  api_key: z
    .string()
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
 * POST /api/admin/upstreams/test - Test upstream configuration
 *
 * Tests connectivity to an upstream provider before saving the configuration.
 * Validates the base URL, API key, and provider settings by making a lightweight API call.
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
      provider: validated.provider,
      baseUrl: validated.base_url,
      apiKey: validated.api_key,
      timeout: validated.timeout,
    };

    const result = await testUpstreamConnection(input);

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
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    console.error("Failed to test upstream connection:", error);
    return errorResponse("Internal server error", 500);
  }
}
