import { NextRequest, NextResponse } from "next/server";
import { getPaginationParams, errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { listApiKeys, createApiKey, type ApiKeyCreateInput } from "@/lib/services/key-manager";
import {
  transformPaginatedApiKeys,
  transformApiKeyCreateToApi,
} from "@/lib/utils/api-transformers";
import { z } from "zod";
import { createLogger } from "@/lib/utils/logger";
import { nullableSpendingRulesSchema } from "@/lib/services/spending-rules";
import { nullableApiKeyRateLimitSchema } from "@/lib/services/api-key-rate-limits";

const log = createLogger("admin-keys");

const createApiKeySchema = z
  .object({
    name: z.string().min(1).max(255),
    access_mode: z.enum(["unrestricted", "restricted"]).optional(),
    upstream_ids: z.array(z.string().uuid()).optional().default([]),
    allowed_models: z.array(z.string()).nullable().optional(),
    description: z.string().nullable().optional(),
    expires_at: z.string().datetime().nullable().optional(),
    spending_rules: nullableSpendingRulesSchema,
    rpm_limit: nullableApiKeyRateLimitSchema,
    tpm_limit: nullableApiKeyRateLimitSchema,
  })
  .superRefine((data, ctx) => {
    const effectiveMode =
      data.access_mode ?? (data.upstream_ids.length > 0 ? "restricted" : "unrestricted");

    if (effectiveMode === "restricted" && data.upstream_ids.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["upstream_ids"],
        message: "At least one upstream must be specified",
      });
    }
  });

const listApiKeysQuerySchema = z.object({
  // Keys members create for themselves are managed from the user's own view,
  // so the global list defaults to the keys the admin console owns.
  owner_scope: z.enum(["unowned", "all"]).default("unowned"),
  user_id: z.string().uuid().optional(),
});

/**
 * GET /api/admin/keys - List all API keys
 *
 * Query params:
 * - page / page_size: pagination
 * - search: string (filter - case-insensitive substring match on key name)
 * - owner_scope: "unowned" (default) | "all"
 * - user_id: only keys owned by this user; takes precedence over owner_scope
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { page, pageSize } = getPaginationParams(request);
    const params = new URL(request.url).searchParams;
    const search = params.get("search")?.trim();
    const query = listApiKeysQuerySchema.parse({
      owner_scope: params.get("owner_scope") ?? undefined,
      user_id: params.get("user_id") ?? undefined,
    });

    const result = await listApiKeys(page, pageSize, {
      ...(search ? { search } : {}),
      ...(query.user_id ? { userId: query.user_id } : { unowned: query.owner_scope === "unowned" }),
    });

    return NextResponse.json(transformPaginatedApiKeys(result));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    log.error({ err: error }, "failed to list API keys");
    return errorResponse("Internal server error", 500);
  }
}

/**
 * POST /api/admin/keys - Create a new API key
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const body = await request.json();
    const validated = createApiKeySchema.parse(body);

    const input: ApiKeyCreateInput = {
      name: validated.name,
      accessMode: validated.access_mode,
      upstreamIds: validated.upstream_ids,
      allowedModels: validated.allowed_models ?? null,
      description: validated.description ?? null,
      expiresAt: validated.expires_at ? new Date(validated.expires_at) : null,
      spendingRules: validated.spending_rules ?? null,
      rpmLimit: validated.rpm_limit ?? null,
      tpmLimit: validated.tpm_limit ?? null,
    };

    const result = await createApiKey(input);

    return NextResponse.json(transformApiKeyCreateToApi(result), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    log.error({ err: error }, "failed to create API key");
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
