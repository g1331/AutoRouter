import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPortalSettings, updatePortalSettings } from "@/lib/services/portal-settings-service";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { createLogger } from "@/lib/utils/logger";
import { transformPortalSettingsToApi } from "@/lib/utils/api-transformers";

const log = createLogger("admin-portal-settings");

const updateSettingsSchema = z.object({
  expose_upstreams: z.boolean().optional(),
});

/** Return the current member portal settings. */
export async function GET(request: NextRequest): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const settings = await getPortalSettings();
    return NextResponse.json(transformPortalSettingsToApi(settings));
  } catch (error) {
    log.error({ err: error }, "failed to get portal settings");
    return errorResponse("Internal server error", 500);
  }
}

/** Update member portal settings from admin input. */
export async function PATCH(request: NextRequest): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const body = await request.json();
    const validated = updateSettingsSchema.parse(body);
    const settings = await updatePortalSettings({
      exposeUpstreams: validated.expose_upstreams,
    });

    return NextResponse.json(transformPortalSettingsToApi(settings));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((issue) => issue.message).join(", ")}`,
        400
      );
    }

    log.error({ err: error }, "failed to update portal settings");
    return errorResponse("Internal server error", 500);
  }
}
