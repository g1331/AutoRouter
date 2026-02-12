import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { FailoverAttempt } from "./request-logger";

export interface TrafficRecordRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  /** Stored only when JSON parse fails. When bodyJson is present, bodyText is omitted. */
  bodyText?: string | null;
  /** Parsed JSON body. Preferred over bodyText. */
  bodyJson?: unknown | null;
  /** When true, body is same as inbound and omitted to save space. */
  bodyFromInbound?: boolean;
}

export interface TrafficRecordResponse {
  status: number;
  headers: Record<string, string>;
  /** Stored only when JSON parse fails. */
  bodyText?: string | null;
  /** Parsed JSON body. Preferred over bodyText. */
  bodyJson?: unknown | null;
  streamChunks?: string[];
}

export interface TrafficRecordFixture {
  meta: {
    requestId: string;
    createdAt: string;
    providerType: string;
    route: string;
    model: string | null;
    durationMs: number;
    /** Fixture format version. Absent in v1 fixtures. */
    version?: 2;
  };
  inbound: TrafficRecordRequest;
  outbound: {
    upstream: {
      id: string;
      name: string;
      providerType: string;
      baseUrl: string;
    };
    request: TrafficRecordRequest;
    response: TrafficRecordResponse;
  };
  /** Final response returned to downstream client. Present only when it differs from upstream response. */
  downstream?: {
    response: TrafficRecordResponse;
  };
  /** Failover details for debugging retries. */
  failover?: {
    history: FailoverAttempt[];
  };
}

/** Parameters for building a fixture from the proxy route. */
export interface BuildFixtureParams {
  requestId: string;
  startTime: number;
  providerType: string;
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
    providerType: string;
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
  downstreamResponse?: {
    statusCode: number;
    headers: Headers | Record<string, string>;
    bodyText?: string | null;
    bodyJson?: unknown | null;
    streamChunks?: string[];
  } | null;
  failoverHistory?: FailoverAttempt[] | null;
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
  // PII / session tracking
  "session_id",
  "x-codex-turn-metadata",
  "x-codex-beta-features",
]);

export type RecorderMode = "all" | "success" | "failure";
export type RecorderOutcome = "success" | "failure";

export function isRecorderEnabled(): boolean {
  return process.env.RECORDER_ENABLED === "true" || process.env.RECORDER_ENABLED === "1";
}

export function getRecorderMode(): RecorderMode {
  const value = process.env.RECORDER_MODE?.trim().toLowerCase();
  if (value === "success" || value === "failure" || value === "all") {
    return value;
  }
  return "all";
}

export function shouldRecordFixture(outcome: RecorderOutcome): boolean {
  if (!isRecorderEnabled()) {
    return false;
  }
  const mode = getRecorderMode();
  return mode === "all" || mode === outcome;
}

export function getFixtureRoot(): string {
  return process.env.RECORDER_FIXTURES_DIR || DEFAULT_FIXTURE_DIR;
}

export function isRecorderRedactionEnabled(): boolean {
  const value = process.env.RECORDER_REDACT_SENSITIVE;
  if (!value) return true;
  return value !== "false" && value !== "0";
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

/** Redact the host portion of a URL, preserving the path. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `[REDACTED]${parsed.pathname}`;
  } catch {
    return "[REDACTED]";
  }
}

function sanitizePathSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function toHeaderRecord(headers: Headers | Record<string, string>): Record<string, string> {
  return headers instanceof Headers ? Object.fromEntries(headers.entries()) : { ...headers };
}

function formatHeadersForFixture(
  headers: Headers | Record<string, string>
): Record<string, string> {
  return isRecorderRedactionEnabled() ? redactHeaders(headers) : toHeaderRecord(headers);
}

function formatUrlForFixture(url: string): string {
  return isRecorderRedactionEnabled() ? redactUrl(url) : url;
}

function formatFailoverHistoryForFixture(history: FailoverAttempt[]): FailoverAttempt[] {
  const redactionEnabled = isRecorderRedactionEnabled();
  return history.map((attempt) => {
    const formatted: FailoverAttempt = {
      ...attempt,
      ...(typeof attempt.upstream_base_url === "string"
        ? { upstream_base_url: formatUrlForFixture(attempt.upstream_base_url) }
        : {}),
      ...(attempt.response_headers
        ? { response_headers: formatHeadersForFixture(attempt.response_headers) }
        : {}),
    };

    if (redactionEnabled) {
      delete formatted.response_body_text;
      delete formatted.response_body_json;
    }

    return formatted;
  });
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
 * Read all chunks from a stream, splitting by SSE event boundaries (\n\n)
 * instead of TCP frame boundaries. Each returned string is a complete SSE event.
 * Stops recording (but does not error) if total bytes exceed MAX_RECORDING_BYTES.
 */
export async function readStreamChunks(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const events: string[] = [];
  let totalBytes = 0;
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_RECORDING_BYTES) {
          events.push("[RECORDING_TRUNCATED]");
          // Cancel the stream to release tee backpressure and prevent memory accumulation
          await reader.cancel();
          return events;
        }
        buffer += decoder.decode(value, { stream: true });
        // Split on SSE event boundary
        const parts = buffer.split("\n\n");
        // Last part may be incomplete — keep in buffer
        buffer = parts.pop() || "";
        for (const part of parts) {
          if (part.trim()) {
            events.push(part + "\n\n");
          }
        }
      }
    }
    // Flush remaining bytes from the decoder
    const tail = decoder.decode();
    buffer += tail;
    if (buffer.trim()) {
      events.push(buffer.endsWith("\n\n") ? buffer : buffer + "\n\n");
    }
  } finally {
    reader.releaseLock();
  }
  return events;
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
// SSE chunk compaction
// ---------------------------------------------------------------------------

/**
 * SSE event types whose `response` object carries full instructions/tools
 * that duplicate the inbound request body.
 */
const RESPONSE_SNAPSHOT_EVENTS = new Set([
  "response.created",
  "response.in_progress",
  "response.completed",
]);

/** Fields to strip from response snapshots (already present in inbound body). */
const STRIP_RESPONSE_FIELDS = ["instructions", "tools"];

/**
 * Strip redundant fields (instructions, tools) from SSE snapshot events
 * to dramatically reduce fixture size.
 */
export function compactSSEChunks(chunks: string[]): string[] {
  return chunks.map((chunk) => {
    const trimmed = chunk.replace(/\n\n$/, "");
    const eventLine = trimmed.split("\n").find((l) => l.startsWith("event: "));
    if (!eventLine) return chunk;

    const eventType = eventLine.substring(7).trim();
    if (!RESPONSE_SNAPSHOT_EVENTS.has(eventType)) return chunk;

    const dataLineIdx = trimmed.split("\n").findIndex((l) => l.startsWith("data: "));
    if (dataLineIdx === -1) return chunk;

    const lines = trimmed.split("\n");
    const dataContent = lines[dataLineIdx].substring(6);

    try {
      const data = JSON.parse(dataContent);
      if (data.response) {
        for (const field of STRIP_RESPONSE_FIELDS) {
          if (field in data.response) {
            data.response[field] = "[STRIPPED:see_inbound_body]";
          }
        }
      }
      lines[dataLineIdx] = `data: ${JSON.stringify(data)}`;
      return lines.join("\n") + "\n\n";
    } catch {
      return chunk; // If parse fails, keep original
    }
  });
}

// ---------------------------------------------------------------------------
// Fixture building
// ---------------------------------------------------------------------------

/** Build a TrafficRecordFixture from proxy context. */
export function buildFixture(params: BuildFixtureParams): TrafficRecordFixture {
  // Body: prefer JSON, fall back to text
  const inboundBody: Pick<TrafficRecordRequest, "bodyText" | "bodyJson"> =
    params.inboundRequest.bodyJson != null
      ? { bodyJson: params.inboundRequest.bodyJson }
      : { bodyText: params.inboundRequest.bodyText };

  // Response body: same logic
  const responseBody: Pick<TrafficRecordResponse, "bodyText" | "bodyJson"> =
    params.response.bodyJson != null
      ? { bodyJson: params.response.bodyJson }
      : { bodyText: params.response.bodyText ?? null };

  // Stream chunks: compact if present
  const streamChunks = params.response.streamChunks
    ? compactSSEChunks(params.response.streamChunks)
    : undefined;
  const downstreamStreamChunks = params.downstreamResponse?.streamChunks
    ? compactSSEChunks(params.downstreamResponse.streamChunks)
    : undefined;

  const downstreamResponseBody =
    params.downstreamResponse?.bodyJson != null
      ? { bodyJson: params.downstreamResponse.bodyJson }
      : params.downstreamResponse
        ? { bodyText: params.downstreamResponse.bodyText ?? null }
        : null;
  const failoverHistory =
    params.failoverHistory && params.failoverHistory.length > 0
      ? formatFailoverHistoryForFixture(params.failoverHistory)
      : null;

  return {
    meta: {
      requestId: params.requestId,
      createdAt: new Date().toISOString(),
      providerType: params.providerType,
      route: params.route,
      model: params.model,
      durationMs: Date.now() - params.startTime,
      version: 2,
    },
    inbound: {
      method: params.inboundRequest.method,
      path: params.inboundRequest.path,
      headers: formatHeadersForFixture(params.inboundRequest.headers),
      ...inboundBody,
    },
    outbound: {
      upstream: {
        id: params.upstream.id,
        name: params.upstream.name,
        providerType: params.upstream.providerType,
        baseUrl: formatUrlForFixture(params.upstream.baseUrl),
      },
      request: {
        method: params.inboundRequest.method,
        path: params.inboundRequest.path,
        headers: formatHeadersForFixture(params.outboundHeaders),
        bodyFromInbound: true,
      },
      response: {
        status: params.response.statusCode,
        headers: formatHeadersForFixture(params.response.headers),
        ...responseBody,
        streamChunks,
      },
    },
    ...(params.downstreamResponse
      ? {
          downstream: {
            response: {
              status: params.downstreamResponse.statusCode,
              headers: formatHeadersForFixture(params.downstreamResponse.headers),
              ...(downstreamResponseBody ?? {}),
              streamChunks: downstreamStreamChunks,
            },
          },
        }
      : {}),
    ...(failoverHistory
      ? {
          failover: {
            history: failoverHistory,
          },
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Fixture persistence
// ---------------------------------------------------------------------------

export async function recordTrafficFixture(fixture: TrafficRecordFixture): Promise<string> {
  const timestamp = fixture.meta.createdAt.replace(/[:.]/g, "-");
  const filePath = buildFixturePath(fixture.meta.providerType, fixture.meta.route, timestamp);
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
