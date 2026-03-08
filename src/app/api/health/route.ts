import { NextResponse } from "next/server";

/**
 * Return a lightweight health payload for uptime checks and smoke tests.
 */
export async function GET() {
  return NextResponse.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  });
}
