import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { getPaginationParams, errorResponse } from "@/lib/utils/api-auth";
import {
  listUpstreams,
  createUpstream,
  type UpstreamCreateInput,
} from "@/lib/services/upstream-service";
import { transformPaginatedUpstreams, transformUpstreamToApi } from "@/lib/utils/api-transformers";
import { z } from "zod";

const circuitBreakerConfigSchema = z.object({
  failure_threshold: z.number().int().min(1).max(100).optional(),
  success_threshold: z.number().int().min(1).max(100).optional(),
  open_duration: z.number().int().min(1000).max(300000).optional(),
  probe_interval: z.number().int().min(1000).max(60000).optional(),
});

const createUpstreamSchema = z.object({
  name: z.string().min(1).max(64),
  base_url: z.string().url(),
  api_key: z.string().min(1),
  is_default: z.boolean().default(false),
  timeout: z.number().int().positive().default(60),
  config: z.string().nullable().optional(),
  weight: z.number().int().min(1).max(100).default(1),
  priority: z.number().int().min(0).default(0),
  provider_type: z.enum(["anthropic", "openai", "google", "custom"]).default("openai"),
  allowed_models: z.array(z.string()).nullable().optional(),
  model_redirects: z.record(z.string(), z.string()).nullable().optional(),
  circuit_breaker_config: circuitBreakerConfigSchema.nullable().optional(),
});

/**
 * GET /api/admin/upstreams - List all upstreams
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { page, pageSize } = getPaginationParams(request);
    const result = await listUpstreams(page, pageSize);

    return NextResponse.json(transformPaginatedUpstreams(result));
  } catch (error) {
    console.error("Failed to list upstreams:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * POST /api/admin/upstreams - Create a new upstream
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const body = await request.json();
    const validated = createUpstreamSchema.parse(body);

    const input: UpstreamCreateInput = {
      name: validated.name,
      baseUrl: validated.base_url,
      apiKey: validated.api_key,
      isDefault: validated.is_default,
      timeout: validated.timeout,
      config: validated.config ?? null,
      weight: validated.weight,
      priority: validated.priority,
      providerType: validated.provider_type,
      allowedModels: validated.allowed_models ?? null,
      modelRedirects: validated.model_redirects ?? null,
      circuitBreakerConfig: validated.circuit_breaker_config
        ? {
            failureThreshold: validated.circuit_breaker_config.failure_threshold,
            successThreshold: validated.circuit_breaker_config.success_threshold,
            openDuration: validated.circuit_breaker_config.open_duration,
            probeInterval: validated.circuit_breaker_config.probe_interval,
          }
        : null,
    };

    const result = await createUpstream(input);

    return NextResponse.json(transformUpstreamToApi(result), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    console.error("Failed to create upstream:", error);
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
