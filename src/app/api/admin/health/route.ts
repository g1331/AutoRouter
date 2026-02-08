import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  getAllHealthStatusWithCircuitBreaker,
  getHealthStatusWithCircuitBreaker,
  calculateHealthMetrics,
  getAllHealthMetrics,
  formatHealthStatusResponse,
  formatCircuitBreakerStatusResponse,
  formatHealthMetricsResponse,
} from "@/lib/services/health-checker";
import { UpstreamNotFoundError } from "@/lib/services/upstream-crud";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-health");

/**
 * GET /api/admin/health - Get health status for all upstreams or a specific upstream
 *
 * Query Parameters:
 * - upstream_id: Optional. If provided, returns health status for the specific upstream.
 * - include_circuit_breaker: Optional. If "true", includes circuit breaker status. Defaults to "false".
 * - include_metrics: Optional. If "true", includes health metrics. Defaults to "false".
 * - metrics_hours: Optional. Number of hours for metrics calculation (default: 24).
 * - active_only: Optional. If "false", includes inactive upstreams. Defaults to "true".
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const url = new URL(request.url);
    const upstreamId = url.searchParams.get("upstream_id");
    const includeCircuitBreaker = url.searchParams.get("include_circuit_breaker") === "true";
    const includeMetrics = url.searchParams.get("include_metrics") === "true";
    const metricsHours = parseInt(url.searchParams.get("metrics_hours") ?? "24", 10);
    const activeOnly = url.searchParams.get("active_only") !== "false";

    // If upstream_id is provided, return specific upstream health
    if (upstreamId) {
      const healthStatus = await getHealthStatusWithCircuitBreaker(
        upstreamId,
        includeCircuitBreaker
      );

      if (!healthStatus) {
        return errorResponse("Upstream not found", 404);
      }

      const response: Record<string, unknown> = {
        data: formatHealthStatusResponse(healthStatus),
      };

      // Include circuit breaker status if requested
      if (includeCircuitBreaker && healthStatus.circuitBreaker) {
        response.circuit_breaker = formatCircuitBreakerStatusResponse(healthStatus.circuitBreaker);
      }

      // Include metrics if requested
      if (includeMetrics) {
        const metrics = await calculateHealthMetrics(upstreamId, metricsHours);
        if (metrics) {
          response.metrics = formatHealthMetricsResponse(metrics);
        }
      }

      return NextResponse.json(response);
    }

    // Return health status for all upstreams
    const healthStatuses = await getAllHealthStatusWithCircuitBreaker(
      activeOnly,
      includeCircuitBreaker
    );

    // Get metrics for all upstreams if requested
    let metricsMap: Map<string, ReturnType<typeof formatHealthMetricsResponse>> | undefined;
    if (includeMetrics) {
      const allMetrics = await getAllHealthMetrics(metricsHours, activeOnly);
      metricsMap = new Map(allMetrics.map((m) => [m.upstreamId, formatHealthMetricsResponse(m)]));
    }

    // Build response with optional fields
    const responseData = healthStatuses.map((status) => {
      const item: Record<string, unknown> = formatHealthStatusResponse(status);

      if (includeCircuitBreaker && status.circuitBreaker) {
        item.circuit_breaker = formatCircuitBreakerStatusResponse(status.circuitBreaker);
      }

      if (includeMetrics && metricsMap?.has(status.upstreamId)) {
        item.metrics = metricsMap.get(status.upstreamId);
      }

      return item;
    });

    return NextResponse.json({
      data: responseData,
      total: responseData.length,
    });
  } catch (error) {
    if (error instanceof UpstreamNotFoundError) {
      return errorResponse(error.message, 404);
    }
    log.error({ err: error }, "failed to get health status");
    return errorResponse("Internal server error", 500);
  }
}
