import type { Upstream } from "../db";
import { decrypt } from "../utils/encryption";

/**
 * Provider types for upstream services.
 */
export type Provider = "openai" | "anthropic";

/**
 * Upstream configuration for proxying.
 */
export interface UpstreamForProxy {
  id: string;
  name: string;
  provider: Provider;
  baseUrl: string;
  apiKey: string; // Decrypted API key
  timeout: number;
}

/**
 * Result of a proxy request.
 */
export interface ProxyResult {
  statusCode: number;
  headers: Headers;
  body: ReadableStream<Uint8Array> | Uint8Array;
  isStream: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  usagePromise?: Promise<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null>;
}

// Headers that should not be forwarded to upstream (hop-by-hop headers)
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
]);

/**
 * Filter out hop-by-hop headers and return safe headers for forwarding.
 */
export function filterHeaders(headers: Headers): Record<string, string> {
  const filtered: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      filtered[key] = value;
    }
  });
  return filtered;
}

/**
 * Inject authentication header based on provider type.
 */
export function injectAuthHeader(
  headers: Record<string, string>,
  upstream: UpstreamForProxy
): Record<string, string> {
  const result = { ...headers };

  // Remove any existing auth headers from client
  delete result["authorization"];
  delete result["x-api-key"];

  if (upstream.provider === "openai") {
    result["Authorization"] = `Bearer ${upstream.apiKey}`;
  } else if (upstream.provider === "anthropic") {
    result["x-api-key"] = upstream.apiKey;
    // Anthropic requires anthropic-version header
    if (!result["anthropic-version"]) {
      result["anthropic-version"] = "2023-06-01";
    }
  }

  return result;
}

/**
 * Extract token usage from a usage object.
 */
function extractFromUsageObject(usage: Record<string, number>): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} | null {
  // OpenAI Chat Completions format: prompt_tokens / completion_tokens
  if ("prompt_tokens" in usage) {
    const promptTokens = usage.prompt_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? 0;
    const totalTokens =
      typeof usage.total_tokens === "number" ? usage.total_tokens : promptTokens + completionTokens;

    return {
      promptTokens,
      completionTokens,
      totalTokens,
    };
  }

  // OpenAI Responses API / Anthropic format: input_tokens / output_tokens
  if ("input_tokens" in usage || "output_tokens" in usage) {
    const promptTokens = usage.input_tokens ?? 0;
    const completionTokens = usage.output_tokens ?? 0;
    const totalTokens =
      typeof usage.total_tokens === "number" ? usage.total_tokens : promptTokens + completionTokens;

    return {
      promptTokens,
      completionTokens,
      totalTokens,
    };
  }

  return null;
}

/**
 * Extract token usage from response payload.
 */
export function extractUsage(data: Record<string, unknown>): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} | null {
  // Check top-level usage field (OpenAI Chat Completions, Anthropic, Responses API non-streaming)
  if (typeof data.usage === "object" && data.usage !== null) {
    const result = extractFromUsageObject(data.usage as Record<string, number>);
    if (result) return result;
  }

  // OpenAI Responses API streaming: usage is nested in response.completed event
  // Format: { "type": "response.completed", "response": { "usage": { ... } } }
  if (
    data.type === "response.completed" &&
    typeof data.response === "object" &&
    data.response !== null
  ) {
    const response = data.response as Record<string, unknown>;
    if (typeof response.usage === "object" && response.usage !== null) {
      const result = extractFromUsageObject(response.usage as Record<string, number>);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Create a streaming SSE response transformer that extracts usage data.
 */
export function createSSETransformer(
  onUsage: (usage: { promptTokens: number; completionTokens: number; totalTokens: number }) => void
): TransformStream<Uint8Array, Uint8Array> {
  let buffer = "";

  return new TransformStream({
    transform(chunk, controller) {
      const chunkStr = new TextDecoder().decode(chunk);
      buffer += chunkStr;

      // Process complete events (delimited by double newline)
      while (buffer.includes("\n\n")) {
        const idx = buffer.indexOf("\n\n");
        const event = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        // Parse SSE event for usage data
        for (const line of event.split("\n")) {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();

            if (dataStr === "[DONE]" || dataStr === "") {
              continue;
            }

            try {
              const data = JSON.parse(dataStr);
              const usage = extractUsage(data);
              if (usage) {
                onUsage(usage);
              }
            } catch {
              // Not JSON, skip
            }
          }
        }

        // Forward the complete event
        controller.enqueue(new TextEncoder().encode(event + "\n\n"));
      }
    },
    flush(controller) {
      // Forward any remaining buffered data
      if (buffer) {
        controller.enqueue(new TextEncoder().encode(buffer));
      }
    },
  });
}

async function drainStream(stream: ReadableStream<Uint8Array>): Promise<void> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done } = await reader.read();
      if (done) {
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Forward request to upstream service.
 */
export async function forwardRequest(
  request: Request,
  upstream: UpstreamForProxy,
  path: string,
  requestId: string
): Promise<ProxyResult> {
  // Prepare headers
  const originalHeaders = new Headers(request.headers);
  const filteredHeaders = filterHeaders(originalHeaders);
  const headers = injectAuthHeader(filteredHeaders, upstream);

  // Construct upstream URL
  const baseUrl = upstream.baseUrl.replace(/\/$/, "");
  const url = `${baseUrl}/${path.replace(/^\//, "")}`;

  // Read request body
  const body = await request.arrayBuffer();

  // Log request info
  console.warn(
    `[IN] Request ${requestId}:`,
    `Method: ${request.method}`,
    `Path: ${path}`,
    `Upstream: ${upstream.name} (${upstream.provider})`
  );

  // Log request body summary
  if (body.byteLength > 0) {
    try {
      const bodyJson = JSON.parse(new TextDecoder().decode(body));
      console.warn(
        `[BODY] model: ${bodyJson.model || "N/A"},`,
        `stream: ${bodyJson.stream || false},`,
        `messages: ${(bodyJson.messages || []).length} messages`
      );
    } catch {
      console.warn(`[BODY] ${body.byteLength} bytes (non-JSON)`);
    }
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), upstream.timeout * 1000);

  try {
    // Make upstream request
    const upstreamResponse = await fetch(url, {
      method: request.method,
      headers,
      body: body.byteLength > 0 ? body : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Log response metadata
    console.warn(
      `[OUT] Response ${requestId}:`,
      `status=${upstreamResponse.status},`,
      `content-type=${upstreamResponse.headers.get("content-type") || "unknown"}`
    );

    // Filter response headers
    const responseHeaders = new Headers();
    upstreamResponse.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    // Check if streaming response
    const contentType = upstreamResponse.headers.get("content-type") || "";

    if (contentType.includes("text/event-stream") && upstreamResponse.body) {
      // Streaming response - return stream directly for maximum performance
      let usage:
        | { promptTokens: number; completionTokens: number; totalTokens: number }
        | undefined;

      const transformedStream = upstreamResponse.body.pipeThrough(
        createSSETransformer((u) => {
          usage = u;
          console.warn(
            `Request ${requestId} usage:`,
            `prompt=${u.promptTokens},`,
            `completion=${u.completionTokens},`,
            `total=${u.totalTokens}`
          );
        })
      );

      const [clientStream, loggingStream] = transformedStream.tee();
      const usagePromise = (async () => {
        try {
          await drainStream(loggingStream);
        } catch {
          // Ignore stream consumption errors
        }

        return usage ?? null;
      })();

      return {
        statusCode: upstreamResponse.status,
        headers: responseHeaders,
        body: clientStream,
        isStream: true,
        usage,
        usagePromise,
      };
    } else {
      // Regular response
      const bodyBytes = new Uint8Array(await upstreamResponse.arrayBuffer());

      // Try to extract usage from JSON response
      let usage:
        | { promptTokens: number; completionTokens: number; totalTokens: number }
        | undefined;

      if (contentType.includes("application/json") && bodyBytes.length > 0) {
        try {
          const data = JSON.parse(new TextDecoder().decode(bodyBytes));
          const extracted = extractUsage(data);
          if (extracted) {
            usage = extracted;
            console.warn(
              `Request ${requestId} usage:`,
              `prompt=${usage.promptTokens},`,
              `completion=${usage.completionTokens},`,
              `total=${usage.totalTokens}`
            );
          }
        } catch {
          // Not JSON
        }
      }

      return {
        statusCode: upstreamResponse.status,
        headers: responseHeaders,
        body: bodyBytes,
        isStream: false,
        usage,
      };
    }
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      console.error(`Request ${requestId} timed out after ${upstream.timeout}s`);
      throw new Error(`Upstream request timed out after ${upstream.timeout}s`);
    }

    console.error(`Request ${requestId} failed:`, error);
    throw error;
  }
}

/**
 * Prepare upstream for proxying by decrypting the API key.
 */
export function prepareUpstreamForProxy(upstream: Upstream): UpstreamForProxy {
  return {
    id: upstream.id,
    name: upstream.name,
    provider: upstream.provider as Provider,
    baseUrl: upstream.baseUrl,
    apiKey: decrypt(upstream.apiKeyEncrypted),
    timeout: upstream.timeout,
  };
}
