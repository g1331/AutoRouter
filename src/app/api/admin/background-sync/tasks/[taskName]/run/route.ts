import { NextRequest, NextResponse } from "next/server";
import { getBackgroundSyncScheduler } from "@/lib/services/background-sync";
import { errorResponse } from "@/lib/utils/api-auth";
import { validateAdminAuth } from "@/lib/utils/auth";
import { createLogger } from "@/lib/utils/logger";
import { transformBackgroundSyncExecuteResultToApi } from "@/lib/utils/api-transformers";

const log = createLogger("admin-background-sync-task-run");

interface RouteContext {
  params: Promise<{
    taskName: string;
  }>;
}

/**
 * POST /api/admin/background-sync/tasks/[taskName]/run - Execute a task immediately.
 */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
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
    const result = await scheduler.executeNow(taskName);
    return NextResponse.json(transformBackgroundSyncExecuteResultToApi(result));
  } catch (error) {
    log.error({ err: error, taskName }, "failed to run background sync task");
    return errorResponse("Internal server error", 500);
  }
}
