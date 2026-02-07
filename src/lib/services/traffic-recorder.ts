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

/** Parameters for building a fixture from the proxy route. */
export interface BuildFixtureParams {
  requestId: string;
  startTime: number;
  provider: string;
  route: string;
  model: string | null;
  inboundRequest: {
    method: string;
    path: string;
    headers: Headers;
    bodyText: string | null;
    bodyJson: unknown | null;
  };
  upstream: {
    id: string;
    name: string;
    provider: string;
    baseUrl: string;
  };
  outboundHeaders: Headers | Record<string, string>;
  response: {
    statusCode: number;
    headers: Headers | Record<string, string>;
    bodyText?: string | null;
    bodyJson?: unknown | null;
    streamChunks?: string[];
  };
}

/** Parsed inbound request body. */
export interface InboundBody {
  text: string | null;
  json: unknown | null;
  buffer: ArrayBuffer | null;
}

const DEFAULT_FIXTURE_DIR = "tests/fixtures";

/**
 * Maximum total bytes to buffer when recording a tee'd stream.
 * Once exceeded the recording side is cancelled to avoid memory pressure.
 * Default: 16 MiB.
 */
const MAX_RECORDING_BYTES = 16 * 1024 * 1024;

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

// ---------------------------------------------------------------------------
// Request / stream reading helpers
// ---------------------------------------------------------------------------

/** Clone and read the request body for recording purposes. */
export async function readRequestBody(request: Request): Promise<InboundBody> {
  const clone = request.clone();
  const buffer = await clone.arrayBuffer();
  if (buffer.byteLength === 0) {
    return { text: null, json: null, buffer: null };
  }
  const text = new TextDecoder().decode(buffer);
  try {
    return { text, json: JSON.parse(text), buffer };
  } catch {
    return { text, json: null, buffer };
  }
}

/**
 * Read all chunks from a stream as decoded strings.
 * Stops recording (but does not error) if total bytes exceed MAX_RECORDING_BYTES.
 */
export async function readStreamChunks(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_RECORDING_BYTES) {
          chunks.push("[RECORDING_TRUNCATED]");
          break;
        }
        chunks.push(decoder.decode(value, { stream: true }));
      }
    }
    // Flush any remaining bytes from the decoder (e.g. incomplete multi-byte UTF-8)
    const tail = decoder.decode();
    if (tail) {
      chunks.push(tail);
    }
  } finally {
    reader.releaseLock();
  }
  return chunks;
}

/**
 * Tee a stream for recording. Returns the client-facing stream and a
 * recording stream that can be consumed asynchronously.
 */
export function teeStreamForRecording(
  stream: ReadableStream<Uint8Array>
): [clientStream: ReadableStream<Uint8Array>, recordStream: ReadableStream<Uint8Array>] {
  return stream.tee();
}

// ---------------------------------------------------------------------------
// Fixture building
// ---------------------------------------------------------------------------

/** Build a TrafficRecordFixture from proxy context. */
export function buildFixture(params: BuildFixtureParams): TrafficRecordFixture {
  return {
    meta: {
      requestId: params.requestId,
      createdAt: new Date().toISOString(),
      provider: params.provider,
      route: params.route,
      model: params.model,
      durationMs: Date.now() - params.startTime,
    },
    inbound: {
      method: params.inboundRequest.method,
      path: params.inboundRequest.path,
      headers: redactHeaders(params.inboundRequest.headers),
      bodyText: params.inboundRequest.bodyText,
      bodyJson: params.inboundRequest.bodyJson,
    },
    outbound: {
      upstream: params.upstream,
      request: {
        method: params.inboundRequest.method,
        path: params.inboundRequest.path,
        headers: redactHeaders(params.outboundHeaders),
        bodyText: params.inboundRequest.bodyText,
        bodyJson: params.inboundRequest.bodyJson,
      },
      response: {
        status: params.response.statusCode,
        headers: redactHeaders(params.response.headers),
        bodyText: params.response.bodyText ?? null,
        bodyJson: params.response.bodyJson ?? null,
        streamChunks: params.response.streamChunks,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Fixture persistence
// ---------------------------------------------------------------------------

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
