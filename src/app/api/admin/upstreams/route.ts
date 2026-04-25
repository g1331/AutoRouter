import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { getPaginationParams, errorResponse } from "@/lib/utils/api-auth";
import {
  listUpstreams,
  createUpstream,
  InvalidUpstreamModelRulesError,
  type UpstreamCreateInput,
} from "@/lib/services/upstream-service";
import { transformPaginatedUpstreams, transformUpstreamToApi } from "@/lib/utils/api-transformers";
import {
  ROUTE_CAPABILITY_VALUES,
  normalizeRouteCapabilities,
  areSingleProviderCapabilities,
  type RouteCapability,
} from "@/lib/route-capabilities";
import { z } from "zod";
import { createLogger } from "@/lib/utils/logger";
import { quotaTracker } from "@/lib/services/upstream-quota-tracker";

const log = createLogger("admin-upstreams");

const circuitBreakerConfigSchema = z.object({
  failure_threshold: z.number().int().min(1).max(100).optional(),
  success_threshold: z.number().int().min(1).max(100).optional(),
  // seconds (preferred) or legacy milliseconds
  open_duration: z.number().int().min(1).max(300000).optional(),
  probe_interval: z.number().int().min(1).max(60000).optional(),
});

const affinityMigrationConfigSchema = z.object({
  enabled: z.boolean(),
  metric: z.enum(["tokens", "length"]),
  threshold: z.number().int().min(1).max(10000000),
});

const queuePolicySchema = z.object({
  enabled: z.boolean(),
  timeout_ms: z.number().int().positive(),
  max_queue_length: z.number().int().positive().nullable().optional(),
});

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

const modelCatalogEntrySchema = z.object({
  model: z.string().trim().min(1),
  source: z.enum(["native", "inferred"]),
});

const modelRuleSchema = z
  .object({
    type: z.enum(["exact", "regex", "alias"]),
    value: z.string().trim().min(1),
    target_model: z.string().trim().min(1).nullable().optional(),
    source: z.enum(["manual", "native", "inferred"]).default("manual"),
    display_label: z.string().trim().min(1).nullable().optional(),
  })
  .refine((rule) => rule.type !== "alias" || Boolean(rule.target_model), {
    message: "target_model is required when rule type is alias",
    path: ["target_model"],
  });

function normalizeDurationToMs(
  value: number | undefined,
  kind: "open_duration" | "probe_interval"
): number | undefined {
  if (value === undefined) return undefined;
  // Backward compatible: if the value is within the old ms ranges, it will be > 300 (open) or > 60 (probe).
  const secondsUpperBound = kind === "open_duration" ? 300 : 60;
  return value > secondsUpperBound ? value : value * 1000;
}

const createUpstreamSchema = z
  .object({
    name: z.string().min(1).max(64),
    base_url: z.string().url(),
    official_website_url: z.string().url().nullable().optional(),
    api_key: z.string().min(1),
    is_default: z.boolean().default(false),
    timeout: z.number().int().positive().default(60),
    config: z.string().nullable().optional(),
    max_concurrency: z.number().int().positive().nullable().optional(),
    queue_policy: queuePolicySchema.nullable().optional(),
    weight: z.number().int().min(1).max(100).default(1),
    priority: z.number().int().min(0).default(0),
    route_capabilities: z.array(z.enum(ROUTE_CAPABILITY_VALUES)).nullable().optional(),
    allowed_models: z.array(z.string()).nullable().optional(),
    model_redirects: z.record(z.string(), z.string()).nullable().optional(),
    model_discovery: modelDiscoverySchema.nullable().optional(),
    model_catalog: z.array(modelCatalogEntrySchema).nullable().optional(),
    model_catalog_updated_at: z.string().datetime().nullable().optional(),
    model_catalog_last_status: z.enum(["success", "failed"]).nullable().optional(),
    model_catalog_last_error: z.string().nullable().optional(),
    model_catalog_last_failed_at: z.string().datetime().nullable().optional(),
    model_rules: z.array(modelRuleSchema).nullable().optional(),
    circuit_breaker_config: circuitBreakerConfigSchema.nullable().optional(),
    affinity_migration: affinityMigrationConfigSchema.nullable().optional(),
    billing_input_multiplier: z.number().min(0).max(100).default(1),
    billing_output_multiplier: z.number().min(0).max(100).default(1),
    spending_rules: z
      .array(
        z.object({
          period_type: z.enum(["daily", "monthly", "rolling"]),
          limit: z.number().positive(),
          period_hours: z.number().int().min(1).max(8760).optional(),
        })
      )
      .nullable()
      .optional(),
  })
  .refine(
    (data) =>
      !data.route_capabilities ||
      areSingleProviderCapabilities(data.route_capabilities as RouteCapability[]),
    {
      message: "All route capabilities must belong to the same provider",
      path: ["route_capabilities"],
    }
  )
  .refine(
    (data) => {
      if (!data.spending_rules) return true;
      return data.spending_rules.every(
        (r) => r.period_type !== "rolling" || (r.period_hours != null && r.period_hours >= 1)
      );
    },
    {
      message: "period_hours is required when period_type is 'rolling'",
      path: ["spending_rules"],
    }
  );

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
    log.error({ err: error }, "failed to list upstreams");
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
      officialWebsiteUrl: validated.official_website_url ?? null,
      apiKey: validated.api_key,
      isDefault: validated.is_default,
      timeout: validated.timeout,
      config: validated.config ?? null,
      maxConcurrency: validated.max_concurrency ?? null,
      queuePolicy: validated.queue_policy ?? null,
      weight: validated.weight,
      priority: validated.priority,
      routeCapabilities:
        validated.route_capabilities !== undefined
          ? normalizeRouteCapabilities(validated.route_capabilities ?? [])
          : undefined,
      allowedModels: validated.allowed_models ?? null,
      modelRedirects: validated.model_redirects ?? null,
      modelDiscovery:
        validated.model_discovery !== undefined
          ? validated.model_discovery
            ? {
                mode: validated.model_discovery.mode,
                customEndpoint: validated.model_discovery.custom_endpoint ?? null,
                enableLiteLlmFallback: validated.model_discovery.enable_lite_llm_fallback,
                autoRefreshEnabled: validated.model_discovery.auto_refresh_enabled,
              }
            : null
          : undefined,
      modelCatalog:
        validated.model_catalog?.map((entry) => ({
          model: entry.model,
          source: entry.source,
        })) ?? null,
      modelCatalogUpdatedAt: validated.model_catalog_updated_at
        ? new Date(validated.model_catalog_updated_at)
        : null,
      modelCatalogLastStatus: validated.model_catalog_last_status ?? null,
      modelCatalogLastError: validated.model_catalog_last_error ?? null,
      modelCatalogLastFailedAt: validated.model_catalog_last_failed_at
        ? new Date(validated.model_catalog_last_failed_at)
        : null,
      modelRules:
        validated.model_rules?.map((rule) => ({
          type: rule.type,
          value: rule.value,
          targetModel: rule.target_model ?? null,
          source: rule.source,
          displayLabel: rule.display_label ?? null,
        })) ?? null,
      circuitBreakerConfig: validated.circuit_breaker_config
        ? {
            failureThreshold: validated.circuit_breaker_config.failure_threshold,
            successThreshold: validated.circuit_breaker_config.success_threshold,
            openDuration: normalizeDurationToMs(
              validated.circuit_breaker_config.open_duration,
              "open_duration"
            ),
            probeInterval: normalizeDurationToMs(
              validated.circuit_breaker_config.probe_interval,
              "probe_interval"
            ),
          }
        : null,
      affinityMigration: validated.affinity_migration ?? null,
      billingInputMultiplier: validated.billing_input_multiplier,
      billingOutputMultiplier: validated.billing_output_multiplier,
      spendingRules: validated.spending_rules ?? null,
    };

    const result = await createUpstream(input);

    if (validated.spending_rules !== undefined) {
      try {
        await quotaTracker.syncUpstreamFromDb(
          result.id,
          result.name,
          validated.spending_rules ?? null
        );
      } catch (error) {
        log.warn(
          { err: error, upstreamId: result.id },
          "failed to refresh quota cache after create"
        );
      }
    }

    return NextResponse.json(transformUpstreamToApi(result), { status: 201 });
  } catch (error) {
    if (error instanceof InvalidUpstreamModelRulesError) {
      return errorResponse(`Validation error: ${error.issues.join(", ")}`, 400);
    }
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    log.error({ err: error }, "failed to create upstream");
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
