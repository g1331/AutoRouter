import type { Upstream } from "../db";
import { decrypt } from "../utils/encryption";
import { createLogger } from "../utils/logger";

const log = createLogger("proxy-client");

/**
 * Upstream configuration for proxying.
 */
export interface UpstreamForProxy {
  id: string;
  name: string;
  providerType: string;
  baseUrl: string;
  apiKey: string; // Decrypted API key
  timeout: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

/**
 * Result of a proxy request.
 */
export interface ProxyResult {
  statusCode: number;
  headers: Headers;
  body: ReadableStream<Uint8Array> | Uint8Array;
  isStream: boolean;
  usage?: TokenUsage;
  usagePromise?: Promise<TokenUsage | null>;
  timeToFirstTokenMs?: number; // Time to first token in milliseconds
}

// Headers that should not be forwarded to upstream
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
  // Next.js injects these describing the client→AutoRouter hop; not relevant to upstream
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
]);

// Infrastructure / edge headers that should never be forwarded upstream.
// These describe proxy hops or client network identity and may cause upstream
// routing/policy noise when passed through.
const INFRASTRUCTURE_REQUEST_HEADERS = new Set([
  "cf-connecting-ip",
  "cf-connecting-ipv6",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-worker",
  "cdn-loop",
  "forwarded",
  "remote-host",
  "true-client-ip",
  "via",
  "x-client-ip",
  "x-cluster-client-ip",
  "x-forwarded-client-cert",
  "x-real-ip",
]);

const INFRASTRUCTURE_REQUEST_PREFIXES = ["x-envoy-", "x-vercel-"];

function isInfrastructureRequestHeader(headerName: string): boolean {
  const lower = headerName.toLowerCase();
  return (
    INFRASTRUCTURE_REQUEST_HEADERS.has(lower) ||
    INFRASTRUCTURE_REQUEST_PREFIXES.some((prefix) => lower.startsWith(prefix))
  );
}

/**
 * Filter out hop-by-hop headers and return safe headers for forwarding.
 */
export function filterHeaders(headers: Headers): Record<string, string> {
  const filtered: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(lower) && !isInfrastructureRequestHeader(lower)) {
      filtered[key] = value;
    }
  });
  return filtered;
}

/**
 * Replace authentication credentials with upstream API key.
 * Detects which auth header the client used and preserves the same format.
 */
export function injectAuthHeader(
  headers: Record<string, string>,
  upstream: UpstreamForProxy
): Record<string, string> {
  const result = { ...headers };

  const keys = Object.keys(result);
  const apiKeyHeaderKey = keys.find((k) => k.toLowerCase() === "x-api-key");
  const authorizationHeaderKey = keys.find((k) => k.toLowerCase() === "authorization");

  // Detect which auth format the client used (case-insensitive)
  const usesApiKey = apiKeyHeaderKey !== undefined;

  // Remove any existing auth headers from client (case-insensitive)
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (lower === "authorization" || lower === "x-api-key") {
      delete result[key];
    }
  }

  // Preserve the client's auth header key casing when possible
  if (usesApiKey) {
    result[apiKeyHeaderKey ?? "x-api-key"] = upstream.apiKey;
  } else {
    result[authorizationHeaderKey ?? "Authorization"] = `Bearer ${upstream.apiKey}`;
  }

  return result;
}

/**
 * Safely extract an integer value from an object.
 */
function getIntValue(data: Record<string, unknown>, key: string, defaultValue: number = 0): number {
  const value = data[key];
  if (typeof value === "number") {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

/**
 * Extract token usage from a usage object.
 */
function extractFromUsageObject(usage: Record<string, unknown>): TokenUsage | null {
  const defaultResult: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
  };

  // OpenAI Chat Completions format: prompt_tokens / completion_tokens
  if ("prompt_tokens" in usage) {
    const promptTokens = getIntValue(usage, "prompt_tokens");
    const completionTokens = getIntValue(usage, "completion_tokens");
    const totalTokens = getIntValue(usage, "total_tokens", promptTokens + completionTokens);

    let cachedTokens = 0;
    const promptDetails = usage.prompt_tokens_details;
    if (typeof promptDetails === "object" && promptDetails !== null) {
      cachedTokens = getIntValue(promptDetails as Record<string, unknown>, "cached_tokens");
    }

    let reasoningTokens = 0;
    const completionDetails = usage.completion_tokens_details;
    if (typeof completionDetails === "object" && completionDetails !== null) {
      reasoningTokens = getIntValue(
        completionDetails as Record<string, unknown>,
        "reasoning_tokens"
      );
    }

    return {
      ...defaultResult,
      promptTokens,
      completionTokens,
      totalTokens,
      cachedTokens,
      reasoningTokens,
      cacheReadTokens: cachedTokens,
    };
  }

  // OpenAI Responses API / Anthropic format: input_tokens / output_tokens
  // Note: Anthropic may also include cache_*_input_tokens.
  if (
    "input_tokens" in usage ||
    "output_tokens" in usage ||
    "cache_creation_input_tokens" in usage ||
    "cache_read_input_tokens" in usage
  ) {
    const promptTokensRaw = getIntValue(usage, "input_tokens");
    const completionTokens = getIntValue(usage, "output_tokens");
    const totalTokensRaw = getIntValue(usage, "total_tokens");

    // Anthropic cache token format
    const cacheCreationTokens = getIntValue(usage, "cache_creation_input_tokens");
    const cacheReadTokens = getIntValue(usage, "cache_read_input_tokens");

    // Anthropic streaming may include input_tokens as 0 while cache_*_input_tokens is populated.
    const cacheFallbackTokens = cacheCreationTokens + cacheReadTokens;
    const promptTokens = promptTokensRaw > 0 ? promptTokensRaw : cacheFallbackTokens;
    const totalTokens =
      totalTokensRaw > 0 ? totalTokensRaw : Math.max(promptTokens + completionTokens, 0);

    // OpenAI Responses API detailed usage format (when present)
    let cachedTokensFromDetails = 0;
    const inputDetails = usage.input_tokens_details;
    if (typeof inputDetails === "object" && inputDetails !== null) {
      cachedTokensFromDetails = getIntValue(
        inputDetails as Record<string, unknown>,
        "cached_tokens"
      );
    }

    let reasoningTokens = 0;
    const outputDetails = usage.output_tokens_details;
    if (typeof outputDetails === "object" && outputDetails !== null) {
      reasoningTokens = getIntValue(outputDetails as Record<string, unknown>, "reasoning_tokens");
    }

    // Prefer Anthropic cache_read/cache_creation when present, otherwise fall back to OpenAI cached_tokens
    const useAnthropicCache = cacheReadTokens > 0 || cacheCreationTokens > 0;
    const cachedTokens = useAnthropicCache ? cacheReadTokens : cachedTokensFromDetails;

    return {
      ...defaultResult,
      promptTokens,
      completionTokens,
      totalTokens,
      cachedTokens,
      reasoningTokens,
      cacheCreationTokens: useAnthropicCache ? cacheCreationTokens : 0,
      cacheReadTokens: useAnthropicCache ? cacheReadTokens : cachedTokens,
    };
  }

  return null;
}

/**
 * Extract token usage from response payload.
 */
export function extractUsage(data: Record<string, unknown>): TokenUsage | null {
  // Check top-level usage field (OpenAI Chat Completions, Anthropic, Responses API non-streaming)
  if (typeof data.usage === "object" && data.usage !== null) {
    const result = extractFromUsageObject(data.usage as Record<string, unknown>);
    if (result) return result;
  }

  // Anthropic streaming (and some SDKs) nest usage under `message.usage`
  if (typeof data.message === "object" && data.message !== null) {
    const message = data.message as Record<string, unknown>;
    if (typeof message.usage === "object" && message.usage !== null) {
      const result = extractFromUsageObject(message.usage as Record<string, unknown>);
      if (result) return result;
    }
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
      const result = extractFromUsageObject(response.usage as Record<string, unknown>);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Create a streaming SSE response transformer that extracts usage data.
 */
export function createSSETransformer(
  onUsage: (usage: TokenUsage) => void
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
          // Some upstreams use `data:{...}` without a space after colon.
          if (line.startsWith("data:")) {
            const dataStr = line.slice(5).trim();

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
 * Wrap a stream to track time to first chunk.
 */
function trackFirstChunkTime(
  stream: ReadableStream<Uint8Array>,
  onRequestStartTime: number
): {
  stream: ReadableStream<Uint8Array>;
  timeToFirstChunkMs: number | null;
} {
  let firstChunkReceived = false;
  let timeToFirstChunkMs: number | null = null;

  const trackedStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = stream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          // Track time to first chunk
          if (!firstChunkReceived && value && value.length > 0) {
            firstChunkReceived = true;
            timeToFirstChunkMs = Date.now() - onRequestStartTime;
          }

          controller.enqueue(value);
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });

  return { stream: trackedStream, timeToFirstChunkMs };
}

/**
 * Forward request to upstream service.
 */
export async function forwardRequest(
  request: Request,
  upstream: UpstreamForProxy,
  path: string,
  requestId: string,
  onRequestStartTime?: number
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
  const reqLog = log.child({ requestId });
  reqLog.info(
    { method: request.method, path, upstream: upstream.name, provider: upstream.providerType },
    "upstream request"
  );

  // Log request body summary
  if (body.byteLength > 0) {
    try {
      const bodyJson = JSON.parse(new TextDecoder().decode(body));
      const messageCount =
        (bodyJson.messages || []).length ||
        (Array.isArray(bodyJson.input) ? bodyJson.input.length : 0);
      reqLog.info(
        {
          model: bodyJson.model || "N/A",
          stream: bodyJson.stream || false,
          messages: messageCount,
        },
        "request body"
      );
    } catch {
      reqLog.info({ bytes: body.byteLength }, "request body (non-JSON)");
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
    reqLog.info(
      {
        status: upstreamResponse.status,
        contentType: upstreamResponse.headers.get("content-type") || "unknown",
      },
      "upstream response"
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
      let usage: TokenUsage | undefined;
      const requestStartTime = onRequestStartTime || Date.now();

      const transformedStream = upstreamResponse.body.pipeThrough(
        createSSETransformer((u) => {
          usage = u;
          reqLog.debug(
            { prompt: u.promptTokens, completion: u.completionTokens, total: u.totalTokens },
            "token usage"
          );
        })
      );

      // Track time to first chunk
      const { stream: trackedStream, timeToFirstChunkMs } = trackFirstChunkTime(
        transformedStream,
        requestStartTime
      );

      const [clientStream, loggingStream] = trackedStream.tee();
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
        timeToFirstTokenMs: timeToFirstChunkMs,
      };
    } else {
      // Regular response
      const bodyBytes = new Uint8Array(await upstreamResponse.arrayBuffer());

      // Try to extract usage from JSON response
      let usage: TokenUsage | undefined;

      if (contentType.includes("application/json") && bodyBytes.length > 0) {
        try {
          const data = JSON.parse(new TextDecoder().decode(bodyBytes));
          const extracted = extractUsage(data);
          if (extracted) {
            usage = extracted;
            reqLog.debug(
              {
                prompt: usage.promptTokens,
                completion: usage.completionTokens,
                total: usage.totalTokens,
              },
              "token usage"
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
      reqLog.error({ timeout: upstream.timeout }, "upstream request timed out");
      throw new Error(`Upstream request timed out after ${upstream.timeout}s`);
    }

    reqLog.error({ err: error }, "upstream request failed");
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
    providerType: upstream.providerType,
    baseUrl: upstream.baseUrl,
    apiKey: decrypt(upstream.apiKeyEncrypted),
    timeout: upstream.timeout,
  };
}
