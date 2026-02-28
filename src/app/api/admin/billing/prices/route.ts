import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse, getPaginationParams } from "@/lib/utils/api-auth";
import { createLogger } from "@/lib/utils/logger";
import { listBillingModelPrices } from "@/lib/services/billing-price-service";
import { transformPaginatedBillingModelPrices } from "@/lib/utils/api-transformers";

const log = createLogger("admin-billing-prices");

/**
 * GET /api/admin/billing/prices - Paginated model price catalog.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { page, pageSize } = getPaginationParams(request);
    const { searchParams } = new URL(request.url);
    const modelQuery = searchParams.get("model")?.trim() ?? undefined;
    const sourceParam = searchParams.get("source");
    const activeOnlyParam = searchParams.get("active_only");

    if (sourceParam && sourceParam !== "litellm") {
      return errorResponse("Validation error: source must be litellm", 400);
    }

    let activeOnly: boolean | undefined;
    if (activeOnlyParam !== null) {
      if (activeOnlyParam === "true") {
        activeOnly = true;
      } else if (activeOnlyParam === "false") {
        activeOnly = false;
      } else {
        return errorResponse("Validation error: active_only must be true or false", 400);
      }
    }

    const result = await listBillingModelPrices({
      page,
      pageSize,
      modelQuery,
      source: (sourceParam as "litellm" | null) ?? undefined,
      activeOnly,
    });

    return NextResponse.json(transformPaginatedBillingModelPrices(result));
  } catch (error) {
    log.error({ err: error }, "failed to list billing model prices");
    return errorResponse("Internal server error", 500);
  }
}
