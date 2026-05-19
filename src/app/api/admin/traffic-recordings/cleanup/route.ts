import { NextRequest, NextResponse } from "next/server";
import { cleanupExpiredTrafficRecordings } from "@/lib/services/traffic-recording-service";
import { errorResponse } from "@/lib/utils/api-auth";
import { validateAdminAuth } from "@/lib/utils/auth";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-traffic-recordings-cleanup");

/** Trigger immediate cleanup for expired traffic recordings. */
export async function POST(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const result = await cleanupExpiredTrafficRecordings();
    return NextResponse.json({
      deleted_count: result.deletedCount,
      failure_count: result.failureCount,
      error_summary: result.errorSummary,
    });
  } catch (error) {
    log.error({ err: error }, "failed to cleanup traffic recordings");
    return errorResponse("Internal server error", 500);
  }
}
