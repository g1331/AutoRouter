import { NextRequest, NextResponse } from "next/server";
import { getBackgroundSyncScheduler } from "@/lib/services/background-sync";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { createLogger } from "@/lib/utils/logger";
import { transformBackgroundSyncTaskStateToApi } from "@/lib/utils/api-transformers";

const log = createLogger("admin-background-sync-tasks");

/**
 * GET /api/admin/background-sync/tasks - List background sync task states.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const tasks = await getBackgroundSyncScheduler().listTaskStates();
    return NextResponse.json({
      items: tasks.map(transformBackgroundSyncTaskStateToApi),
      total: tasks.length,
    });
  } catch (error) {
    log.error({ err: error }, "failed to list background sync tasks");
    return errorResponse("Internal server error", 500);
  }
}
