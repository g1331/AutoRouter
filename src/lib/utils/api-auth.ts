import { NextRequest, NextResponse } from "next/server";
import { validateAdminAuth } from "./auth";

export type ApiHandler<T = unknown> = (request: NextRequest, context: T) => Promise<NextResponse>;

/**
 * Wrap an API handler with admin authentication.
 */
export function withAdminAuth<T = unknown>(handler: ApiHandler<T>): ApiHandler<T> {
  return async (request: NextRequest, context: T) => {
    const authHeader = request.headers.get("authorization");

    if (!validateAdminAuth(authHeader)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return handler(request, context);
  };
}

/**
 * Create a JSON error response.
 */
export function errorResponse(message: string, status: number = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Parse pagination parameters from request.
 */
export function getPaginationParams(request: NextRequest): { page: number; pageSize: number } {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("page_size") || "20", 10))
  );
  return { page, pageSize };
}
