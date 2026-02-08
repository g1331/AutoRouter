import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/utils/auth";
import { errorResponse } from "@/lib/utils/api-auth";
import { getLeaderboardStats, type TimeRange } from "@/lib/services/stats-service";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("admin-stats");

/**
 * GET /api/admin/stats/leaderboard - Get leaderboard statistics
 *
 * Query params:
 * - range: "today" | "7d" | "30d"
 * - limit: number (default: 5, max: 50)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateAdminAuth(authHeader)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const url = new URL(request.url);
    const range = (url.searchParams.get("range") || "7d") as TimeRange;
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "5", 10)));

    const stats = await getLeaderboardStats(range, limit);
    return NextResponse.json({
      range: stats.range,
      api_keys: stats.apiKeys.map((k) => ({
        id: k.id,
        name: k.name,
        key_prefix: k.keyPrefix,
        request_count: k.requestCount,
        total_tokens: k.totalTokens,
      })),
      upstreams: stats.upstreams.map((u) => ({
        id: u.id,
        name: u.name,
        provider_type: u.providerType,
        request_count: u.requestCount,
        total_tokens: u.totalTokens,
      })),
      models: stats.models.map((m) => ({
        model: m.model,
        request_count: m.requestCount,
        total_tokens: m.totalTokens,
      })),
    });
  } catch (error) {
    log.error({ err: error }, "failed to get leaderboard stats");
    return errorResponse("Internal server error", 500);
  }
}
