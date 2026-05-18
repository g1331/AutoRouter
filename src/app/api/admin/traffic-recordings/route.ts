import { NextRequest, NextResponse } from "next/server";
import {
  listTrafficRecordings,
  type TrafficRecordingListFilters,
} from "@/lib/services/traffic-recording-service";
import { errorResponse, getPaginationParams } from "@/lib/utils/api-auth";
import { validateAdminAuth } from "@/lib/utils/auth";
import { createLogger } from "@/lib/utils/logger";
import { transformPaginatedTrafficRecordingsToApi } from "@/lib/utils/api-transformers";

const log = createLogger("admin-traffic-recordings");

function parseDateFilter(value: string, fieldName: string): Date | Response {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return errorResponse(`Invalid ${fieldName}`, 400);
  }
  return date;
}

/** Return paginated traffic recording indexes using supported filters. */
export async function GET(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { page, pageSize } = getPaginationParams(request);
    const url = new URL(request.url);
    const filters: TrafficRecordingListFilters = {};

    const apiKeyId = url.searchParams.get("api_key_id");
    if (apiKeyId) filters.apiKeyId = apiKeyId;

    const upstreamId = url.searchParams.get("upstream_id");
    if (upstreamId) filters.upstreamId = upstreamId;

    const statusCode = url.searchParams.get("status_code");
    if (statusCode) {
      const parsedStatusCode = Number(statusCode);
      if (!Number.isInteger(parsedStatusCode)) {
        return errorResponse("Invalid status_code", 400);
      }
      filters.statusCode = parsedStatusCode;
    }

    const model = url.searchParams.get("model");
    if (model) filters.model = model;

    const startTime = url.searchParams.get("start_time");
    if (startTime) {
      const parsedStartTime = parseDateFilter(startTime, "start_time");
      if (parsedStartTime instanceof Response) return parsedStartTime;
      filters.startTime = parsedStartTime;
    }

    const endTime = url.searchParams.get("end_time");
    if (endTime) {
      const parsedEndTime = parseDateFilter(endTime, "end_time");
      if (parsedEndTime instanceof Response) return parsedEndTime;
      filters.endTime = parsedEndTime;
    }

    const result = await listTrafficRecordings(page, pageSize, filters);
    return NextResponse.json(transformPaginatedTrafficRecordingsToApi(result));
  } catch (error) {
    log.error({ err: error }, "failed to list traffic recordings");
    return errorResponse("Internal server error", 500);
  }
}
