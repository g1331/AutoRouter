import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  createFailureRule,
  formatFailureRule,
  InvalidFailureRuleError,
  listFailureRules,
  parseFailureRuleMatch,
} from "@/lib/services/upstream-failure-rules";
import { failoverErrorTypeSchema } from "@/lib/constants/failover-error-types";
import { createLogger } from "@/lib/utils/logger";
import { z } from "zod";

const log = createLogger("admin-upstream-failure-rules");

const failureRuleMatchSchema = z.object({
  status_codes: z.array(z.number().int().min(100).max(599)).nullable().optional(),
  error_types: z.array(failoverErrorTypeSchema).nullable().optional(),
  body_pattern: z.string().nullable().optional(),
  header_name: z.string().nullable().optional(),
  header_pattern: z.string().nullable().optional(),
});

const createFailureRuleSchema = z.object({
  name: z.string().trim().min(1).max(128),
  enabled: z.boolean().optional(),
  priority: z.number().int().default(0),
  match: failureRuleMatchSchema,
});

/**
 * Lists global upstream failure rules.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const rules = await listFailureRules(null);
    return NextResponse.json({ data: rules.map(formatFailureRule) });
  } catch (error) {
    log.error({ err: error }, "failed to list global upstream failure rules");
    return errorResponse("Internal server error", 500);
  }
}

/**
 * Creates a global upstream failure rule.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const body = await request.json();
    const validated = createFailureRuleSchema.parse(body);
    const rule = await createFailureRule({
      upstreamId: null,
      name: validated.name,
      enabled: validated.enabled,
      priority: validated.priority,
      match: parseFailureRuleMatch(validated.match),
    });

    return NextResponse.json(formatFailureRule(rule), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues[0]?.message ?? "Invalid request", 400);
    }
    if (error instanceof InvalidFailureRuleError) {
      return errorResponse(error.message, 400);
    }

    log.error({ err: error }, "failed to create global upstream failure rule");
    return errorResponse("Internal server error", 500);
  }
}
