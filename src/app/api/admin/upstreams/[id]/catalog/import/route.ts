import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import {
  importStoredUpstreamCatalogModels,
  UpstreamNotFoundError,
} from "@/lib/services/upstream-service";
import { transformUpstreamToApi } from "@/lib/utils/api-transformers";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-upstream-catalog-import");

const importCatalogSchema = z.object({
  models: z.array(z.string().trim().min(1)).min(1),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const validated = importCatalogSchema.parse(body);
    const upstream = await importStoredUpstreamCatalogModels(id, validated);
    return NextResponse.json(transformUpstreamToApi(upstream));
  } catch (error) {
    if (error instanceof UpstreamNotFoundError) {
      return errorResponse("Upstream not found", 404);
    }

    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((issue) => issue.message).join(", ")}`,
        400
      );
    }

    if (error instanceof Error && error.message.includes("cached catalog")) {
      return errorResponse(error.message, 400);
    }

    log.error({ err: error }, "failed to import upstream catalog models");
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
