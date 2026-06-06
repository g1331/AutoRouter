import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getTrafficRecordingSettings,
  updateTrafficRecordingSettings,
} from "@/lib/services/traffic-recording-service";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { createLogger } from "@/lib/utils/logger";
import { transformTrafficRecordingSettingsToApi } from "@/lib/utils/api-transformers";

const log = createLogger("admin-traffic-recording-settings");

const updateSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(["all", "success", "failure"]).optional(),
  redact_sensitive: z.boolean().optional(),
  retention_days: z.number().int().min(1).max(3650).optional(),
});

/** Return the current traffic recording runtime settings. */
export async function GET(request: NextRequest): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const settings = await getTrafficRecordingSettings();
    return NextResponse.json(transformTrafficRecordingSettingsToApi(settings));
  } catch (error) {
    log.error({ err: error }, "failed to get traffic recording settings");
    return errorResponse("Internal server error", 500);
  }
}

/** Update traffic recording runtime settings from admin input. */
export async function PATCH(request: NextRequest): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const body = await request.json();
    const validated = updateSettingsSchema.parse(body);
    const settings = await updateTrafficRecordingSettings({
      enabled: validated.enabled,
      mode: validated.mode,
      redactSensitive: validated.redact_sensitive,
      retentionDays: validated.retention_days,
    });

    return NextResponse.json(transformTrafficRecordingSettingsToApi(settings));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((issue) => issue.message).join(", ")}`,
        400
      );
    }

    log.error({ err: error }, "failed to update traffic recording settings");
    return errorResponse("Internal server error", 500);
  }
}
