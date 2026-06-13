import { NextRequest, NextResponse } from "next/server";
import { getPaginationParams, errorResponse, requireMember } from "@/lib/utils/api-auth";
import {
  listOwnApiKeys,
  createOwnApiKey,
  UpstreamNotAllowedError,
} from "@/lib/services/user-key-service";
import {
  transformPaginatedApiKeys,
  transformApiKeyCreateToApi,
} from "@/lib/utils/api-transformers";
import { z } from "zod";
import { createLogger } from "@/lib/utils/logger";
import { nullableSpendingRulesSchema } from "@/lib/services/spending-rules";

const log = createLogger("user-keys");

// Unknown fields — including any attempted user_id or access_mode — are
// stripped by the schema: ownership and the restricted access mode are forced
// server-side and never taken from the request (decision 8).
const createOwnKeySchema = z.object({
  name: z.string().min(1).max(255),
  upstream_ids: z.array(z.string().uuid()).min(1),
  description: z.string().nullable().optional(),
  spending_rules: nullableSpendingRulesSchema,
});

/**
 * GET /api/user/keys - List the caller's own API keys
 */
export async function GET(request: NextRequest) {
  const auth = await requireMember(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { page, pageSize } = getPaginationParams(request);
    const result = await listOwnApiKeys(auth.userId, page, pageSize);

    return NextResponse.json(transformPaginatedApiKeys(result));
  } catch (error) {
    log.error({ err: error }, "failed to list own API keys");
    return errorResponse("Internal server error", 500);
  }
}

/**
 * POST /api/user/keys - Create an API key owned by the caller
 */
export async function POST(request: NextRequest) {
  const auth = await requireMember(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }
    const validated = createOwnKeySchema.parse(body);

    const result = await createOwnApiKey(auth.userId, {
      name: validated.name,
      upstreamIds: validated.upstream_ids,
      description: validated.description ?? null,
      spendingRules: validated.spending_rules ?? null,
    });

    return NextResponse.json(transformApiKeyCreateToApi(result), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        400
      );
    }
    if (error instanceof UpstreamNotAllowedError) {
      return errorResponse(error.message, 403);
    }
    log.error({ err: error }, "failed to create own API key");
    return errorResponse("Internal server error", 500);
  }
}
