import { NextRequest, NextResponse } from "next/server";
import { cleanupExpiredTrafficRecordings } from "@/lib/services/traffic-recording-service";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-traffic-recordings-cleanup");

/** Trigger immediate cleanup for expired traffic recordings. */
export async function POST(request: NextRequest): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
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
