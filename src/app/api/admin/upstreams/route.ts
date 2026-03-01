import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { getPaginationParams, errorResponse } from "@/lib/utils/api-auth";
import {
  listUpstreams,
  createUpstream,
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
    api_key: z.string().min(1),
    is_default: z.boolean().default(false),
    timeout: z.number().int().positive().default(60),
    config: z.string().nullable().optional(),
    weight: z.number().int().min(1).max(100).default(1),
    priority: z.number().int().min(0).default(0),
    route_capabilities: z.array(z.enum(ROUTE_CAPABILITY_VALUES)).nullable().optional(),
    allowed_models: z.array(z.string()).nullable().optional(),
    model_redirects: z.record(z.string(), z.string()).nullable().optional(),
    circuit_breaker_config: circuitBreakerConfigSchema.nullable().optional(),
    affinity_migration: affinityMigrationConfigSchema.nullable().optional(),
    billing_input_multiplier: z.number().min(0).max(100).default(1),
    billing_output_multiplier: z.number().min(0).max(100).default(1),
    spending_limit: z.number().positive().nullable().optional(),
    spending_period_type: z.enum(["daily", "monthly", "rolling"]).nullable().optional(),
    spending_period_hours: z.number().int().min(1).max(8760).nullable().optional(),
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
    (data) =>
      data.spending_period_type !== "rolling" ||
      (data.spending_period_hours != null && data.spending_period_hours >= 1),
    {
      message: "spending_period_hours is required when spending_period_type is 'rolling'",
      path: ["spending_period_hours"],
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
      apiKey: validated.api_key,
      isDefault: validated.is_default,
      timeout: validated.timeout,
      config: validated.config ?? null,
      weight: validated.weight,
      priority: validated.priority,
      routeCapabilities:
        validated.route_capabilities !== undefined
          ? normalizeRouteCapabilities(validated.route_capabilities ?? [])
          : undefined,
      allowedModels: validated.allowed_models ?? null,
      modelRedirects: validated.model_redirects ?? null,
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
      spendingLimit: validated.spending_limit ?? null,
      spendingPeriodType: validated.spending_period_type ?? null,
      spendingPeriodHours: validated.spending_period_hours ?? null,
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
    log.error({ err: error }, "failed to create upstream");
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
