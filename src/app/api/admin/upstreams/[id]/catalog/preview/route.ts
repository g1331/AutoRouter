import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ROUTE_CAPABILITY_VALUES, normalizeRouteCapabilities } from "@/lib/route-capabilities";
import {
  previewUpstreamCatalog,
  UpstreamNotFoundError,
  type UpstreamCatalogPreviewInput,
} from "@/lib/services/upstream-service";
import { errorResponse } from "@/lib/utils/api-auth";
import { validateAdminAuth } from "@/lib/utils/auth";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-upstream-catalog-preview");

type RouteContext = { params: Promise<{ id: string }> };

const modelDiscoverySchema = z.object({
  mode: z.enum([
    "openai_compatible",
    "anthropic_native",
    "gemini_native",
    "gemini_openai_compatible",
    "custom",
    "litellm",
  ]),
  custom_endpoint: z.string().trim().min(1).nullable().optional(),
  enable_lite_llm_fallback: z.boolean().default(false),
  auto_refresh_enabled: z.boolean().default(false),
});

const previewCatalogSchema = z.object({
  base_url: z.string().url(),
  api_key: z.string().optional(),
  route_capabilities: z.array(z.enum(ROUTE_CAPABILITY_VALUES)).nullable().optional(),
  model_discovery: modelDiscoverySchema.nullable().optional(),
});

/**
 * Preview the model catalog for an upstream using the current editor values.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const validated = previewCatalogSchema.parse(body);
    const input: UpstreamCatalogPreviewInput = {
      baseUrl: validated.base_url,
      apiKey: validated.api_key,
      routeCapabilities:
        validated.route_capabilities !== undefined
          ? normalizeRouteCapabilities(validated.route_capabilities ?? [])
          : undefined,
      modelDiscovery:
        validated.model_discovery === undefined
          ? undefined
          : validated.model_discovery
            ? {
                mode: validated.model_discovery.mode,
                customEndpoint: validated.model_discovery.custom_endpoint ?? null,
                enableLiteLlmFallback: validated.model_discovery.enable_lite_llm_fallback,
                autoRefreshEnabled: validated.model_discovery.auto_refresh_enabled,
              }
            : null,
    };

    const preview = await previewUpstreamCatalog(id, input);

    return NextResponse.json({
      model_discovery: preview.modelDiscovery
        ? {
            mode: preview.modelDiscovery.mode,
            custom_endpoint: preview.modelDiscovery.customEndpoint,
            enable_lite_llm_fallback: preview.modelDiscovery.enableLiteLlmFallback,
            auto_refresh_enabled: preview.modelDiscovery.autoRefreshEnabled,
          }
        : null,
      model_catalog: preview.modelCatalog,
      model_catalog_updated_at: preview.modelCatalogUpdatedAt?.toISOString() ?? null,
      model_catalog_last_status: preview.modelCatalogLastStatus,
      model_catalog_last_error: preview.modelCatalogLastError,
      model_catalog_last_failed_at: preview.modelCatalogLastFailedAt?.toISOString() ?? null,
    });
  } catch (error) {
    if (error instanceof UpstreamNotFoundError) {
      return errorResponse("Upstream not found", 404);
    }

    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((issue) => issue.message).join(", ")}`,
        400
      );
    }

    log.error({ err: error }, "failed to preview upstream catalog");
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
