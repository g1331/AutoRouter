import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBackgroundSyncScheduler } from "@/lib/services/background-sync";
import { errorResponse } from "@/lib/utils/api-auth";
import { validateAdminAuth } from "@/lib/utils/auth";
import { createLogger } from "@/lib/utils/logger";
import { transformBackgroundSyncTaskStateToApi } from "@/lib/utils/api-transformers";

const log = createLogger("admin-background-sync-task-config");

const updateTaskConfigSchema = z.object({
  enabled: z.boolean().optional(),
  interval_seconds: z.number().int().min(60).max(31_536_000).optional(),
});

interface RouteContext {
  params: Promise<{
    taskName: string;
  }>;
}

/**
 * PATCH /api/admin/background-sync/tasks/[taskName] - Update a task schedule config.
 */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  const { taskName } = await context.params;
  const scheduler = getBackgroundSyncScheduler();
  if (!scheduler.getTaskDefinition(taskName)) {
    return errorResponse("Background sync task not found", 404);
  }

  try {
    const body = await request.json();
    const validated = updateTaskConfigSchema.parse(body);
    const updated = await scheduler.updateTaskConfig(taskName, {
      enabled: validated.enabled,
      intervalSeconds: validated.interval_seconds,
    });

    return NextResponse.json(transformBackgroundSyncTaskStateToApi(updated));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((issue) => issue.message).join(", ")}`,
        400
      );
    }

    log.error({ err: error, taskName }, "failed to update background sync task config");
    return errorResponse("Internal server error", 500);
  }
}
