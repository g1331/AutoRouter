import type { Upstream } from "../db";
import { decrypt } from "../utils/encryption";
import { createLogger } from "../utils/logger";
import { getPrimaryProviderByCapabilities } from "@/lib/route-capabilities";

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
 * Streaming metrics resolved after stream is fully consumed.
 */
export interface StreamMetrics {
  usage: TokenUsage | null;
  ttftMs?: number;
}

/**
 * A single outbound header to inject when the target header is absent.
 */
export interface CompensationHeader {
  header: string;
  value: string;
  source: string;
}

/**
 * Summary of header changes made during a proxy request (names only, no values).
 */
export interface HeaderDiff {
  inbound_count: number;
  outbound_count: number;
  dropped: string[];
  auth_replaced: string | null;
  compensated: Array<{ header: string; source: string }>;
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
  streamMetricsPromise?: Promise<StreamMetrics>;
  ttftMs?: number;
  headerDiff?: HeaderDiff;
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
  "cf-ew-via",
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
 * Also returns the list of dropped header names for HeaderDiff.
 */
export function filterHeaders(headers: Headers): {
  filtered: Record<string, string>;
  dropped: string[];
} {
  const filtered: Record<string, string> = {};
  const dropped: string[] = [];
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(lower) && !isInfrastructureRequestHeader(lower)) {
      filtered[key] = value;
    } else {
      dropped.push(lower);
    }
  });
  return { filtered, dropped };
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

const TTFT_METADATA_ONLY_EVENT_TYPES = new Set([
  "message_start",
  "message_delta",
  "message_stop",
  "content_block_start",
  "content_block_stop",
  "ping",
  "response.created",
  "response.in_progress",
  "response.completed",
  "response.output_item.added",
  "response.output_item.done",
  "response.content_part.added",
  "response.content_part.done",
  "response.reasoning_summary_part.added",
  "response.reasoning_summary_part.done",
]);

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasOpenAIChatTextPart(parts: unknown): boolean {
  if (!Array.isArray(parts)) {
    return false;
  }

  for (const part of parts) {
    if (typeof part === "object" && part !== null) {
      const partRecord = part as Record<string, unknown>;
      if (isNonEmptyText(partRecord.text)) {
        return true;
      }
    }
  }

  return false;
}

function hasOpenAIChatChoiceTextPayload(choiceRecord: Record<string, unknown>): boolean {
  const delta = choiceRecord.delta;
  if (typeof delta === "object" && delta !== null) {
    const deltaRecord = delta as Record<string, unknown>;
    if (isNonEmptyText(deltaRecord.content) || hasOpenAIChatTextPart(deltaRecord.content)) {
      return true;
    }
    if (isNonEmptyText(deltaRecord.refusal)) {
      return true;
    }
  }

  const message = choiceRecord.message;
  if (typeof message === "object" && message !== null) {
    const messageRecord = message as Record<string, unknown>;
    if (isNonEmptyText(messageRecord.content) || hasOpenAIChatTextPart(messageRecord.content)) {
      return true;
    }
    if (isNonEmptyText(messageRecord.refusal)) {
      return true;
    }
  }

  return false;
}

function hasOpenAIChatTextPayload(data: Record<string, unknown>): boolean {
  const choices = data.choices;
  if (!Array.isArray(choices)) {
    return false;
  }

  for (const choice of choices) {
    if (typeof choice !== "object" || choice === null) {
      continue;
    }
    if (hasOpenAIChatChoiceTextPayload(choice as Record<string, unknown>)) {
      return true;
    }
  }

  return false;
}

function isOpenAIChatMetadataOnlyChoice(choiceRecord: Record<string, unknown>): boolean {
  if (hasOpenAIChatChoiceTextPayload(choiceRecord)) {
    return false;
  }

  const delta = choiceRecord.delta;
  if (typeof delta === "object" && delta !== null) {
    const deltaRecord = delta as Record<string, unknown>;
    const deltaKeys = Object.keys(deltaRecord);
    if (deltaKeys.length === 0) {
      return true;
    }

    if (
      deltaKeys.every((key) => key === "role") &&
      (deltaRecord.role === undefined || typeof deltaRecord.role === "string")
    ) {
      return true;
    }
  }

  if ("finish_reason" in choiceRecord) {
    const finishReason = choiceRecord.finish_reason;
    if (finishReason === null || typeof finishReason === "string") {
      return true;
    }
  }

  return false;
}

function isOpenAIChatMetadataOnlyPayload(data: Record<string, unknown>): boolean {
  const choices = data.choices;
  if (!Array.isArray(choices)) {
    return false;
  }

  let hasAnyChoice = false;
  for (const choice of choices) {
    if (typeof choice !== "object" || choice === null) {
      continue;
    }

    hasAnyChoice = true;
    if (!isOpenAIChatMetadataOnlyChoice(choice as Record<string, unknown>)) {
      return false;
    }
  }

  return hasAnyChoice;
}

function hasAnthropicTextPayload(data: Record<string, unknown>): boolean {
  if (data.type === "content_block_delta") {
    const delta = data.delta;
    if (typeof delta === "object" && delta !== null) {
      const deltaRecord = delta as Record<string, unknown>;
      if (deltaRecord.type === "thinking_delta" || deltaRecord.type === "signature_delta") {
        return isNonEmptyText(deltaRecord.thinking);
      }
      if (deltaRecord.type === "text_delta" || deltaRecord.type === undefined) {
        return isNonEmptyText(deltaRecord.text);
      }
      return false;
    }
    return false;
  }

  if (data.type === "content_block_start") {
    const contentBlock = data.content_block;
    if (typeof contentBlock === "object" && contentBlock !== null) {
      const contentBlockRecord = contentBlock as Record<string, unknown>;
      return isNonEmptyText(contentBlockRecord.text) || isNonEmptyText(contentBlockRecord.thinking);
    }
  }

  return false;
}

function hasOpenAIResponsesTextPayload(data: Record<string, unknown>): boolean {
  if (data.type === "response.output_text.delta" && isNonEmptyText(data.delta)) {
    return true;
  }
  if (data.type === "response.output_text.done" && isNonEmptyText(data.text)) {
    return true;
  }
  if (data.type === "response.reasoning_summary_text.delta" && isNonEmptyText(data.delta)) {
    return true;
  }
  if (data.type === "response.reasoning_summary_text.done" && isNonEmptyText(data.text)) {
    return true;
  }
  if (data.type === "response.custom_tool_call_input.delta" && isNonEmptyText(data.delta)) {
    return true;
  }
  if (data.type === "response.custom_tool_call_input.done" && isNonEmptyText(data.input)) {
    return true;
  }
  if (data.type === "response.function_call_arguments.delta" && isNonEmptyText(data.delta)) {
    return true;
  }
  if (data.type === "response.function_call_arguments.done" && isNonEmptyText(data.arguments)) {
    return true;
  }

  const part = data.part;
  if (typeof part === "object" && part !== null) {
    const partRecord = part as Record<string, unknown>;
    return isNonEmptyText(partRecord.text);
  }

  return false;
}

function isContentBearingSSEEventData(dataStr: string, sseEventName?: string): boolean {
  try {
    const parsed: unknown = JSON.parse(dataStr);
    if (typeof parsed !== "object" || parsed === null) {
      return true;
    }

    const data = parsed as Record<string, unknown>;
    if (
      hasOpenAIChatTextPayload(data) ||
      hasAnthropicTextPayload(data) ||
      hasOpenAIResponsesTextPayload(data)
    ) {
      return true;
    }

    if (isNonEmptyText(data.content) || isNonEmptyText(data.text)) {
      return true;
    }

    if (isOpenAIChatMetadataOnlyPayload(data)) {
      return false;
    }

    const eventType = typeof data.type === "string" ? data.type : (sseEventName ?? null);
    if (eventType && TTFT_METADATA_ONLY_EVENT_TYPES.has(eventType)) {
      return false;
    }

    return true;
  } catch {
    // Non-JSON payloads are treated as content-bearing events.
    return true;
  }
}

/**
 * Options for the SSE transformer.
 */
export interface SSETransformerCallbacks {
  onUsage: (usage: TokenUsage) => void;
  onFirstChunk?: () => void;
}

/**
 * Create a streaming SSE response transformer that extracts usage data.
 */
export function createSSETransformer(
  callbacks: SSETransformerCallbacks
): TransformStream<Uint8Array, Uint8Array> {
  let buffer = "";
  let firstChunkFired = false;

  return new TransformStream({
    transform(chunk, controller) {
      const chunkStr = new TextDecoder().decode(chunk);
      buffer += chunkStr;

      // Process complete events (delimited by double newline)
      while (buffer.includes("\n\n")) {
        const idx = buffer.indexOf("\n\n");
        const event = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        let sseEventName: string | undefined;

        // Parse SSE event for usage data
        for (const line of event.split("\n")) {
          if (line.startsWith("event:")) {
            const eventName = line.slice(6).trim();
            if (eventName.length > 0) {
              sseEventName = eventName;
            }
            continue;
          }

          // Some upstreams use `data:{...}` without a space after colon.
          if (line.startsWith("data:")) {
            const dataStr = line.slice(5).trim();

            if (dataStr === "[DONE]" || dataStr === "") {
              continue;
            }

            // Fire onFirstChunk on the first content-bearing data event.
            if (
              !firstChunkFired &&
              callbacks.onFirstChunk &&
              isContentBearingSSEEventData(dataStr, sseEventName)
            ) {
              firstChunkFired = true;
              callbacks.onFirstChunk();
            }

            try {
              const data = JSON.parse(dataStr);
              const usage = extractUsage(data);
              if (usage) {
                callbacks.onUsage(usage);
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
  requestId: string,
  compensationHeaders?: CompensationHeader[]
): Promise<ProxyResult> {
  // Prepare headers
  const originalHeaders = new Headers(request.headers);
  const inboundCount = [...originalHeaders.keys()].length;
  const { filtered: filteredHeaders, dropped } = filterHeaders(originalHeaders);

  // Inject compensation headers (missing_only mode: only when absent)
  const compensated: Array<{ header: string; source: string }> = [];
  if (compensationHeaders) {
    for (const comp of compensationHeaders) {
      const lower = comp.header.toLowerCase();
      const alreadyPresent = Object.keys(filteredHeaders).some((k) => k.toLowerCase() === lower);
      if (!alreadyPresent) {
        filteredHeaders[comp.header] = comp.value;
        compensated.push({ header: comp.header, source: comp.source });
      }
    }
  }

  const headers = injectAuthHeader(filteredHeaders, upstream);

  // Determine which auth header was replaced
  const hadAuthorization = Object.keys(filteredHeaders).some(
    (k) => k.toLowerCase() === "authorization"
  );
  const hadApiKey = Object.keys(filteredHeaders).some((k) => k.toLowerCase() === "x-api-key");
  const authReplaced = hadAuthorization ? "authorization" : hadApiKey ? "x-api-key" : null;

  const outboundCount = Object.keys(headers).length;

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

  const upstreamSendTime = Date.now();

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
      let ttftMs: number | undefined;

      const transformedStream = upstreamResponse.body.pipeThrough(
        createSSETransformer({
          onUsage: (u) => {
            usage = u;
            reqLog.debug(
              { prompt: u.promptTokens, completion: u.completionTokens, total: u.totalTokens },
              "token usage"
            );
          },
          onFirstChunk: () => {
            ttftMs = Date.now() - upstreamSendTime;
            reqLog.debug({ ttftMs }, "time to first token");
          },
        })
      );

      const [clientStream, loggingStream] = transformedStream.tee();
      const streamMetricsPromise = (async (): Promise<StreamMetrics> => {
        try {
          await drainStream(loggingStream);
        } catch {
          // Ignore stream consumption errors
        }

        return { usage: usage ?? null, ttftMs };
      })();

      return {
        statusCode: upstreamResponse.status,
        headers: responseHeaders,
        body: clientStream,
        isStream: true,
        usage,
        streamMetricsPromise,
        headerDiff: {
          inbound_count: inboundCount,
          outbound_count: outboundCount,
          dropped,
          auth_replaced: authReplaced,
          compensated,
        },
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
        headerDiff: {
          inbound_count: inboundCount,
          outbound_count: outboundCount,
          dropped,
          auth_replaced: authReplaced,
          compensated,
        },
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
    providerType: getPrimaryProviderByCapabilities(upstream.routeCapabilities) ?? "unknown",
    baseUrl: upstream.baseUrl,
    apiKey: decrypt(upstream.apiKeyEncrypted),
    timeout: upstream.timeout,
  };
}
