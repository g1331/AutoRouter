import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { getPaginationParams, errorResponse } from "@/lib/utils/api-auth";
import {
  listUpstreams,
  createUpstream,
  type UpstreamCreateInput,
} from "@/lib/services/upstream-service";
import { z } from "zod";

const createUpstreamSchema = z.object({
  name: z.string().min(1).max(64),
  provider: z.enum(["openai", "anthropic"]),
  base_url: z.string().url(),
  api_key: z.string().min(1),
  is_default: z.boolean().default(false),
  timeout: z.number().int().positive().default(60),
  config: z.string().nullable().optional(),
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

    return NextResponse.json({
      items: result.items.map((item) => ({
        id: item.id,
        name: item.name,
        provider: item.provider,
        base_url: item.baseUrl,
        api_key_masked: item.apiKeyMasked,
        is_default: item.isDefault,
        timeout: item.timeout,
        is_active: item.isActive,
        config: item.config,
        created_at: item.createdAt.toISOString(),
        updated_at: item.updatedAt.toISOString(),
      })),
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
      total_pages: result.totalPages,
    });
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
    };

    const result = await createUpstream(input);

    return NextResponse.json(
      {
        id: result.id,
        name: result.name,
        provider: result.provider,
        base_url: result.baseUrl,
        api_key_masked: result.apiKeyMasked,
        is_default: result.isDefault,
        timeout: result.timeout,
        is_active: result.isActive,
        config: result.config,
        created_at: result.createdAt.toISOString(),
        updated_at: result.updatedAt.toISOString(),
      },
      { status: 201 }
    );
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
