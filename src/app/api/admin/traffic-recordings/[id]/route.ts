import { NextRequest, NextResponse } from "next/server";
import {
  deleteTrafficRecording,
  getTrafficRecordingDetail,
} from "@/lib/services/traffic-recording-service";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { createLogger } from "@/lib/utils/logger";
import { transformTrafficRecordingDetailToApi } from "@/lib/utils/api-transformers";

const log = createLogger("admin-traffic-recording-detail");

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

/** Return one traffic recording index and its fixture content. */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await context.params;

  try {
    const recording = await getTrafficRecordingDetail(id);
    if (!recording) {
      return errorResponse("Traffic recording not found", 404);
    }
    return NextResponse.json(transformTrafficRecordingDetailToApi(recording));
  } catch (error) {
    log.error({ err: error, id }, "failed to get traffic recording detail");
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}

/** Delete one traffic recording index and its fixture file. */
export async function DELETE(request: NextRequest, context: RouteContext): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await context.params;

  try {
    const deleted = await deleteTrafficRecording(id);
    if (!deleted) {
      return errorResponse("Traffic recording not found", 404);
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    log.error({ err: error, id }, "failed to delete traffic recording");
    return errorResponse("Internal server error", 500);
  }
}
