import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import path from "path";

export interface TrafficRecordRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  bodyText: string | null;
  bodyJson: unknown | null;
}

export interface TrafficRecordResponse {
  status: number;
  headers: Record<string, string>;
  bodyText: string | null;
  bodyJson: unknown | null;
  streamChunks?: string[];
}

export interface TrafficRecordFixture {
  meta: {
    requestId: string;
    createdAt: string;
    provider: string;
    route: string;
    model: string | null;
    durationMs: number;
  };
  inbound: TrafficRecordRequest;
  outbound: {
    upstream: {
      id: string;
      name: string;
      provider: string;
      baseUrl: string;
    };
    request: TrafficRecordRequest;
    response: TrafficRecordResponse;
  };
}

const DEFAULT_FIXTURE_DIR = "tests/fixtures";
const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "proxy-authorization",
  "x-forwarded-authorization",
  "x-api-key",
  "cookie",
  "set-cookie",
]);

export function isRecorderEnabled(): boolean {
  return process.env.RECORDER_ENABLED === "true" || process.env.RECORDER_ENABLED === "1";
}

export function getFixtureRoot(): string {
  return process.env.RECORDER_FIXTURES_DIR || DEFAULT_FIXTURE_DIR;
}

export function redactHeaders(headers: Headers | Record<string, string>): Record<string, string> {
  const entries =
    headers instanceof Headers ? Array.from(headers.entries()) : Object.entries(headers);
  return Object.fromEntries(
    entries.map(([key, value]) => [
      key,
      SENSITIVE_HEADER_NAMES.has(key.toLowerCase()) ? "[REDACTED]" : value,
    ])
  );
}

function sanitizePathSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function buildFixturePath(provider: string, route: string, timestamp: string): string {
  const safeProvider = sanitizePathSegment(provider || "unknown");
  const safeRoute = sanitizePathSegment(route || "unknown");
  const fileName = `${timestamp}.json`;
  return path.join(getFixtureRoot(), safeProvider, safeRoute, fileName);
}

export async function recordTrafficFixture(fixture: TrafficRecordFixture): Promise<string> {
  const timestamp = fixture.meta.createdAt.replace(/[:.]/g, "-");
  const filePath = buildFixturePath(fixture.meta.provider, fixture.meta.route, timestamp);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(fixture, null, 2), "utf-8");
  return filePath;
}

export async function readLatestFixture(
  provider: string,
  route: string
): Promise<TrafficRecordFixture | null> {
  const dir = path.join(
    getFixtureRoot(),
    sanitizePathSegment(provider),
    sanitizePathSegment(route)
  );
  try {
    const entries = await readdir(dir);
    const candidates = entries.filter((entry) => entry.endsWith(".json")).sort();
    const latest = candidates[candidates.length - 1];
    if (!latest) return null;
    const data = await readFile(path.join(dir, latest), "utf-8");
    return JSON.parse(data) as TrafficRecordFixture;
  } catch {
    return null;
  }
}
