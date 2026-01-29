import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { getPaginationParams, errorResponse } from "@/lib/utils/api-auth";
import {
  listUpstreams,
  createUpstream,
  UpstreamGroupNotFoundError,
  type UpstreamCreateInput,
} from "@/lib/services/upstream-service";
import { transformPaginatedUpstreams, transformUpstreamToApi } from "@/lib/utils/api-transformers";
import { z } from "zod";

const createUpstreamSchema = z.object({
  name: z.string().min(1).max(64),
  provider: z.enum(["openai", "anthropic"]),
  base_url: z.string().url(),
  api_key: z.string().min(1),
  is_default: z.boolean().default(false),
  timeout: z.number().int().positive().default(60),
  config: z.string().nullable().optional(),
  group_id: z.string().uuid().nullable().optional(),
  weight: z.number().int().min(1).max(100).default(1),
  provider_type: z.enum(["anthropic", "openai", "google", "custom"]).nullable().optional(),
  allowed_models: z.array(z.string()).nullable().optional(),
  model_redirects: z.record(z.string(), z.string()).nullable().optional(),
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
      provider: validated.provider,
      baseUrl: validated.base_url,
      apiKey: validated.api_key,
      isDefault: validated.is_default,
      timeout: validated.timeout,
      config: validated.config ?? null,
      groupId: validated.group_id ?? null,
      weight: validated.weight,
      providerType: validated.provider_type ?? null,
      allowedModels: validated.allowed_models ?? null,
      modelRedirects: validated.model_redirects ?? null,
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
    if (error instanceof UpstreamGroupNotFoundError) {
      return errorResponse("Upstream group not found", 404);
    }
    console.error("Failed to create upstream:", error);
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
