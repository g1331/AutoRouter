import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { db, compensationRules } from "@/lib/db";
import { invalidateCache } from "@/lib/services/compensation-service";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-compensation-rules");

export interface CompensationRuleResponse {
  id: string;
  name: string;
  is_builtin: boolean;
  enabled: boolean;
  capabilities: string[];
  target_header: string;
  sources: string[];
  mode: string;
  created_at: string;
  updated_at: string;
}

function toResponse(rule: {
  id: string;
  name: string;
  isBuiltin: boolean;
  enabled: boolean;
  capabilities: string[];
  targetHeader: string;
  sources: string[];
  mode: string;
  createdAt: Date;
  updatedAt: Date;
}): CompensationRuleResponse {
  return {
    id: rule.id,
    name: rule.name,
    is_builtin: rule.isBuiltin,
    enabled: rule.enabled,
    capabilities: rule.capabilities,
    target_header: rule.targetHeader,
    sources: rule.sources,
    mode: rule.mode,
    created_at: rule.createdAt.toISOString(),
    updated_at: rule.updatedAt.toISOString(),
  };
}

/**
 * GET /api/admin/compensation-rules - List all compensation rules
 */
export async function GET(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const rules = await db.select().from(compensationRules);
    return NextResponse.json({ data: rules.map(toResponse) });
  } catch (err) {
    log.error({ err }, "Failed to list compensation rules");
    return errorResponse("Internal server error", 500);
  }
}

interface CreateRuleBody {
  name: string;
  enabled?: boolean;
  capabilities: string[];
  target_header: string;
  sources: string[];
  mode?: string;
}

/**
 * POST /api/admin/compensation-rules - Create a new compensation rule
 */
export async function POST(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  let body: CreateRuleBody;
  try {
    body = (await request.json()) as CreateRuleBody;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const {
    name,
    enabled = true,
    capabilities,
    target_header,
    sources,
    mode = "missing_only",
  } = body;

  if (!name || typeof name !== "string" || name.trim() === "") {
    return errorResponse("name is required", 400);
  }
  if (!Array.isArray(capabilities) || capabilities.length === 0) {
    return errorResponse("capabilities must be a non-empty array", 400);
  }
  if (!target_header || typeof target_header !== "string") {
    return errorResponse("target_header is required", 400);
  }
  if (!Array.isArray(sources) || sources.length === 0) {
    return errorResponse("sources must be a non-empty array", 400);
  }

  try {
    // Check for name collision
    const existing = await db
      .select({ id: compensationRules.id })
      .from(compensationRules)
      .where(eq(compensationRules.name, name.trim()));
    if (existing.length > 0) {
      return errorResponse("A rule with this name already exists", 409);
    }

    const [created] = await db
      .insert(compensationRules)
      .values({
        name: name.trim(),
        isBuiltin: false,
        enabled,
        capabilities,
        targetHeader: target_header,
        sources,
        mode,
      })
      .returning();

    invalidateCache();
    return NextResponse.json({ data: toResponse(created) }, { status: 201 });
  } catch (err) {
    log.error({ err }, "Failed to create compensation rule");
    return errorResponse("Internal server error", 500);
  }
}
