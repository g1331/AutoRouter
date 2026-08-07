import { NextRequest } from "next/server";
import { handleProxy, type RouteContext } from "./proxy-request-lifecycle";

// Edge runtime for streaming support
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Handle proxied GET requests through the unified proxy pipeline.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}

/**
 * Handle proxied POST requests through the unified proxy pipeline.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}

/**
 * Handle proxied PUT requests through the unified proxy pipeline.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}

/**
 * Handle proxied DELETE requests through the unified proxy pipeline.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}

/**
 * Handle proxied PATCH requests through the unified proxy pipeline.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}
