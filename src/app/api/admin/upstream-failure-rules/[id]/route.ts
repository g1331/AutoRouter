import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  deleteFailureRule,
  formatFailureRule,
  InvalidFailureRuleError,
  parseFailureRuleMatch,
  updateFailureRule,
} from "@/lib/services/upstream-failure-rules";
import { createLogger } from "@/lib/utils/logger";
import { z } from "zod";

const log = createLogger("admin-upstream-failure-rule");

type RouteContext = { params: Promise<{ id: string }> };

const failureRuleMatchSchema = z.object({
  status_codes: z.array(z.number().int().min(100).max(599)).nullable().optional(),
  error_types: z.array(z.string().trim().min(1)).nullable().optional(),
  body_pattern: z.string().nullable().optional(),
  header_name: z.string().nullable().optional(),
  header_pattern: z.string().nullable().optional(),
});

const updateFailureRuleSchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  match: failureRuleMatchSchema.optional(),
});

export async function PUT(request: NextRequest, context: RouteContext): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const validated = updateFailureRuleSchema.parse(body);
    const rule = await updateFailureRule(id, {
      name: validated.name,
      enabled: validated.enabled,
      priority: validated.priority,
      match: validated.match ? parseFailureRuleMatch(validated.match) : undefined,
    });

    if (!rule) {
      return errorResponse("Failure rule not found", 404);
    }

    return NextResponse.json(formatFailureRule(rule));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues[0]?.message ?? "Invalid request", 400);
    }
    if (error instanceof InvalidFailureRuleError) {
      return errorResponse(error.message, 400);
    }

    log.error({ err: error }, "failed to update upstream failure rule");
    return errorResponse("Internal server error", 500);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    await deleteFailureRule(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error({ err: error }, "failed to delete upstream failure rule");
    return errorResponse("Internal server error", 500);
  }
}
