import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireAdmin } from "@/lib/utils/api-auth";
import { setUsersUpstreamVisibility } from "@/lib/services/user-service";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-users-upstream-visibility");

// Bulk upstream visibility. `user_ids` narrows the change to a member subset;
// omit it to target every member. A static segment, so it never collides with
// the `[id]` dynamic route — Next.js matches the literal path first.
const bulkVisibilitySchema = z
  .object({
    expose_upstreams: z.boolean(),
    user_ids: z.array(z.string().min(1)).optional(),
  })
  .strict();

/**
 * PATCH /api/admin/users/upstream-visibility - Set upstream visibility across
 * many members at once. Members switched from visible to hidden have their keys
 * realigned to the full grant set in the same transaction.
 */
export async function PATCH(request: NextRequest): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }
    const validated = bulkVisibilitySchema.parse(body);

    const result = await setUsersUpstreamVisibility(validated.expose_upstreams, validated.user_ids);

    return NextResponse.json({
      affected: result.affected,
      aligned_keys: result.alignedKeys,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map((issue) => issue.message).join(", ")}`,
        400
      );
    }
    log.error({ err: error }, "failed to bulk set upstream visibility");
    return errorResponse("Internal server error", 500);
  }
}
