import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  getUpstreamById,
  updateUpstream,
  deleteUpstream,
  UpstreamNotFoundError,
  type UpstreamUpdateInput,
} from "@/lib/services/upstream-service";
import { transformUpstreamToApi } from "@/lib/utils/api-transformers";
import { ROUTE_CAPABILITY_VALUES, normalizeRouteCapabilities } from "@/lib/route-capabilities";
import { z } from "zod";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-upstreams");

type RouteContext = { params: Promise<{ id: string }> };

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

const updateUpstreamSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  base_url: z.string().url().optional(),
  api_key: z.string().min(1).optional(),
  is_default: z.boolean().optional(),
  timeout: z.number().int().positive().optional(),
  is_active: z.boolean().optional(),
  config: z.string().nullable().optional(),
  weight: z.number().int().min(1).max(100).optional(),
  priority: z.number().int().min(0).optional(),
  route_capabilities: z.array(z.enum(ROUTE_CAPABILITY_VALUES)).nullable().optional(),
  allowed_models: z.array(z.string()).nullable().optional(),
  model_redirects: z.record(z.string(), z.string()).nullable().optional(),
  circuit_breaker_config: circuitBreakerConfigSchema.nullable().optional(),
  affinity_migration: affinityMigrationConfigSchema.nullable().optional(),
});

/**
 * GET /api/admin/upstreams/[id] - Get upstream details
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    const upstream = await getUpstreamById(id);

    if (!upstream) {
      return errorResponse("Upstream not found", 404);
    }

    return NextResponse.json(transformUpstreamToApi(upstream));
  } catch (error) {
    log.error({ err: error }, "failed to get upstream");
    return errorResponse("Internal server error", 500);
  }
}

/**
 * PUT /api/admin/upstreams/[id] - Update upstream
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const validated = updateUpstreamSchema.parse(body);

    const input: UpstreamUpdateInput = {};
    if (validated.name !== undefined) input.name = validated.name;
    if (validated.base_url !== undefined) input.baseUrl = validated.base_url;
    if (validated.api_key !== undefined) input.apiKey = validated.api_key;
    if (validated.is_default !== undefined) input.isDefault = validated.is_default;
    if (validated.timeout !== undefined) input.timeout = validated.timeout;
    if (validated.is_active !== undefined) input.isActive = validated.is_active;
    if (validated.config !== undefined) input.config = validated.config;
    if (validated.weight !== undefined) input.weight = validated.weight;
    if (validated.priority !== undefined) input.priority = validated.priority;
    if (validated.route_capabilities !== undefined) {
      input.routeCapabilities = normalizeRouteCapabilities(validated.route_capabilities ?? []);
    }
    if (validated.allowed_models !== undefined) input.allowedModels = validated.allowed_models;
    if (validated.model_redirects !== undefined) input.modelRedirects = validated.model_redirects;
    if (validated.circuit_breaker_config !== undefined) {
      input.circuitBreakerConfig = validated.circuit_breaker_config
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
        : null;
    }
    if (validated.affinity_migration !== undefined) {
      input.affinityMigration = validated.affinity_migration ?? null;
    }

    const result = await updateUpstream(id, input);

    return NextResponse.json(transformUpstreamToApi(result));
  } catch (error) {
    if (error instanceof UpstreamNotFoundError) {
      return errorResponse("Upstream not found", 404);
    }
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    log.error({ err: error }, "failed to update upstream");
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}

/**
 * DELETE /api/admin/upstreams/[id] - Delete upstream
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    await deleteUpstream(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof UpstreamNotFoundError) {
      return errorResponse("Upstream not found", 404);
    }
    log.error({ err: error }, "failed to delete upstream");
    return errorResponse("Internal server error", 500);
  }
}
