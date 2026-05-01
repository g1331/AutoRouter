import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  executeUpstreamProbe,
  listUpstreamProbeResults,
  UpstreamNotFoundError,
} from "@/lib/services/upstream-service";
import { ROUTE_CAPABILITY_VALUES } from "@/lib/route-capabilities";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-upstream-probes");

type RouteContext = { params: Promise<{ id: string }> };

const executeProbeSchema = z.object({
  route_capability: z.enum(ROUTE_CAPABILITY_VALUES).optional(),
  client_profile: z
    .enum(["generic_openai", "generic_anthropic", "codex_cli", "claude_code"])
    .optional(),
  model: z.string().trim().min(1).max(256).optional(),
});

/**
 * List diagnostic probe results for one upstream.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    return NextResponse.json(await listUpstreamProbeResults(id));
  } catch (error) {
    log.error({ err: error }, "failed to list upstream probe results");
    return errorResponse("Internal server error", 500);
  }
}

/**
 * Execute and persist one diagnostic upstream probe.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const validated = executeProbeSchema.parse(body);
    const result = await executeUpstreamProbe({
      upstreamId: id,
      routeCapability: validated.route_capability,
      clientProfile: validated.client_profile,
      model: validated.model,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((issue) => issue.message).join(", ")}`,
        400
      );
    }
    if (error instanceof UpstreamNotFoundError) {
      return errorResponse("Upstream not found", 404);
    }
    if (error instanceof Error && error.message.includes("probe template")) {
      return errorResponse(error.message, 400);
    }
    if (error instanceof Error && error.message.includes("route capability")) {
      return errorResponse(error.message, 400);
    }

    log.error({ err: error }, "failed to execute upstream probe");
    return errorResponse("Internal server error", 500);
  }
}
