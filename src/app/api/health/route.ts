import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/app-version";

/**
 * Return a lightweight health payload for uptime checks and smoke tests.
 */
export async function GET() {
  return NextResponse.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
  });
}
