import { NextRequest, NextResponse } from "next/server";
import { getBackgroundSyncScheduler } from "@/lib/services/background-sync";
import { errorResponse } from "@/lib/utils/api-auth";
import { validateAdminAuth } from "@/lib/utils/auth";
import { config } from "@/lib/utils/config";
import { createLogger } from "@/lib/utils/logger";
import { transformBackgroundSyncTaskStateToApi } from "@/lib/utils/api-transformers";

const log = createLogger("admin-background-sync-tasks");

/**
 * GET /api/admin/background-sync/tasks - List background sync task states.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const tasks = await getBackgroundSyncScheduler().listTaskStates();
    return NextResponse.json({
      background_sync_enabled: config.backgroundSyncEnabled,
      items: tasks.map(transformBackgroundSyncTaskStateToApi),
      total: tasks.length,
    });
  } catch (error) {
    log.error({ err: error }, "failed to list background sync tasks");
    return errorResponse("Internal server error", 500);
  }
}
