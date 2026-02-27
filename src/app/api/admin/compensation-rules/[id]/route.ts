import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { db, compensationRules } from "@/lib/db";
import { invalidateCache } from "@/lib/services/compensation-service";
import type { CompensationRuleResponse } from "../route";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-compensation-rules");

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface UpdateRuleBody {
  name?: string;
  enabled?: boolean;
  capabilities?: string[];
  target_header?: string;
  sources?: string[];
  mode?: string;
}

/**
 * PUT /api/admin/compensation-rules/{id} - Update a compensation rule
 */
export async function PUT(request: NextRequest, context: RouteContext): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  const { id } = await context.params;

  let body: UpdateRuleBody;
  try {
    body = (await request.json()) as UpdateRuleBody;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  try {
    const existing = await db.select().from(compensationRules).where(eq(compensationRules.id, id));

    if (existing.length === 0) {
      return errorResponse("Compensation rule not found", 404);
    }

    const rule = existing[0];

    if (
      rule.isBuiltin &&
      (body.name !== undefined ||
        body.capabilities !== undefined ||
        body.target_header !== undefined ||
        body.sources !== undefined ||
        body.mode !== undefined)
    ) {
      return errorResponse("Built-in rules can only be enabled or disabled", 403);
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim() === "") {
        return errorResponse("name must be a non-empty string", 400);
      }
      if (rule.isBuiltin && body.name.trim() !== rule.name) {
        return errorResponse("Cannot rename a built-in rule", 403);
      }
      updateData.name = body.name.trim();
    }
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") {
        return errorResponse("enabled must be a boolean", 400);
      }
      updateData.enabled = body.enabled;
    }
    if (body.capabilities !== undefined) {
      if (!Array.isArray(body.capabilities) || body.capabilities.length === 0) {
        return errorResponse("capabilities must be a non-empty array", 400);
      }
      updateData.capabilities = body.capabilities;
    }
    if (body.target_header !== undefined) {
      if (typeof body.target_header !== "string" || body.target_header.trim() === "") {
        return errorResponse("target_header must be a non-empty string", 400);
      }
      updateData.targetHeader = body.target_header.trim();
    }
    if (body.sources !== undefined) {
      if (!Array.isArray(body.sources) || body.sources.length === 0) {
        return errorResponse("sources must be a non-empty array", 400);
      }
      updateData.sources = body.sources;
    }
    if (body.mode !== undefined) updateData.mode = body.mode;

    const [updated] = await db
      .update(compensationRules)
      .set(updateData)
      .where(eq(compensationRules.id, id))
      .returning();

    invalidateCache();

    const response: CompensationRuleResponse = {
      id: updated.id,
      name: updated.name,
      is_builtin: updated.isBuiltin,
      enabled: updated.enabled,
      capabilities: updated.capabilities,
      target_header: updated.targetHeader,
      sources: updated.sources,
      mode: updated.mode,
      created_at: updated.createdAt.toISOString(),
      updated_at: updated.updatedAt.toISOString(),
    };

    return NextResponse.json({ data: response });
  } catch (err) {
    log.error({ err, id }, "Failed to update compensation rule");
    return errorResponse("Internal server error", 500);
  }
}

/**
 * DELETE /api/admin/compensation-rules/{id} - Delete a compensation rule (built-in rules are protected)
 */
export async function DELETE(request: NextRequest, context: RouteContext): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  const { id } = await context.params;

  try {
    const existing = await db
      .select({ id: compensationRules.id, isBuiltin: compensationRules.isBuiltin })
      .from(compensationRules)
      .where(eq(compensationRules.id, id));

    if (existing.length === 0) {
      return errorResponse("Compensation rule not found", 404);
    }

    if (existing[0].isBuiltin) {
      return errorResponse("Cannot delete a built-in compensation rule", 403);
    }

    await db.delete(compensationRules).where(eq(compensationRules.id, id));
    invalidateCache();

    return new Response(null, { status: 204 });
  } catch (err) {
    log.error({ err, id }, "Failed to delete compensation rule");
    return errorResponse("Internal server error", 500);
  }
}
