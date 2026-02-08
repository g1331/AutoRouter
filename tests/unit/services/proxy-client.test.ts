import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  filterHeaders,
  injectAuthHeader,
  extractUsage,
  createSSETransformer,
  forwardRequest,
  prepareUpstreamForProxy,
  type UpstreamForProxy,
} from "@/lib/services/proxy-client";
import type { Upstream } from "@/lib/db";

// Mock encryption module
vi.mock("@/lib/utils/encryption", () => ({
  decrypt: vi.fn((encrypted: string) => `decrypted-${encrypted}`),
}));

describe("proxy-client", () => {
  describe("filterHeaders", () => {
    it("should pass through normal headers", () => {
      const headers = new Headers({
        "Content-Type": "application/json",
        "X-Custom-Header": "value",
        Accept: "application/json",
      });

      const filtered = filterHeaders(headers);

      // Headers API normalizes keys to lowercase
      expect(filtered["content-type"]).toBe("application/json");
      expect(filtered["x-custom-header"]).toBe("value");
      expect(filtered["accept"]).toBe("application/json");
    });

    it("should remove hop-by-hop headers", () => {
      const headers = new Headers({
        "Content-Type": "application/json",
        Connection: "keep-alive",
        "Keep-Alive": "timeout=5",
        "Transfer-Encoding": "chunked",
        Host: "example.com",
        Upgrade: "websocket",
      });

      const filtered = filterHeaders(headers);

      expect(filtered["content-type"]).toBe("application/json");
      expect(filtered["connection"]).toBeUndefined();
      expect(filtered["keep-alive"]).toBeUndefined();
      expect(filtered["transfer-encoding"]).toBeUndefined();
      expect(filtered["host"]).toBeUndefined();
      expect(filtered["upgrade"]).toBeUndefined();
    });

    it("should handle empty headers", () => {
      const headers = new Headers();
      const filtered = filterHeaders(headers);
      expect(Object.keys(filtered)).toHaveLength(0);
    });
  });

  describe("injectAuthHeader", () => {
    const openaiUpstream: UpstreamForProxy = {
      id: "1",
      name: "openai",
      providerType: "openai",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test-key",
      timeout: 60,
    };

    const anthropicUpstream: UpstreamForProxy = {
      id: "2",
      name: "anthropic",
      providerType: "anthropic",
      baseUrl: "https://api.anthropic.com",
      apiKey: "ant-test-key",
      timeout: 60,
    };

    it("should inject Bearer token for OpenAI", () => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      const result = injectAuthHeader(headers, openaiUpstream);

      expect(result["Authorization"]).toBe("Bearer sk-test-key");
      expect(result["x-api-key"]).toBeUndefined();
    });

    it("should inject x-api-key for Anthropic", () => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      const result = injectAuthHeader(headers, anthropicUpstream);

      expect(result["x-api-key"]).toBe("ant-test-key");
      expect(result["Authorization"]).toBeUndefined();
    });

    it("should preserve client anthropic-version header", () => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "anthropic-version": "2024-01-01",
      };

      const result = injectAuthHeader(headers, anthropicUpstream);

      expect(result["anthropic-version"]).toBe("2024-01-01");
    });

    it("should remove client auth headers", () => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        authorization: "Bearer client-key",
        "x-api-key": "client-api-key",
      };

      const result = injectAuthHeader(headers, openaiUpstream);

      expect(result["Authorization"]).toBe("Bearer sk-test-key");
      expect(result["authorization"]).toBeUndefined();
      expect(result["x-api-key"]).toBeUndefined();
    });
  });

  describe("extractUsage", () => {
    it("should extract OpenAI format usage", () => {
      const data = {
        id: "chatcmpl-123",
        object: "chat.completion",
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      const usage = extractUsage(data);

      expect(usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cachedTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      });
    });

    it("should extract OpenAI detailed cached_tokens and reasoning_tokens", () => {
      const data = {
        id: "chatcmpl-456",
        object: "chat.completion",
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 200,
          total_tokens: 1200,
          prompt_tokens_details: {
            cached_tokens: 800,
          },
          completion_tokens_details: {
            reasoning_tokens: 150,
          },
        },
      };

      const usage = extractUsage(data);

      expect(usage).toEqual({
        promptTokens: 1000,
        completionTokens: 200,
        totalTokens: 1200,
        cachedTokens: 800,
        reasoningTokens: 150,
        cacheCreationTokens: 0,
        cacheReadTokens: 800,
      });
    });

    it("should extract Anthropic format usage", () => {
      const data = {
        type: "message",
        content: [{ type: "text", text: "Hello" }],
        usage: {
          input_tokens: 80,
          output_tokens: 40,
        },
      };

      const usage = extractUsage(data);

      expect(usage).toEqual({
        promptTokens: 80,
        completionTokens: 40,
        totalTokens: 120,
        cachedTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      });
    });

    it("should extract Anthropic cache_read/cache_creation tokens", () => {
      const data = {
        type: "message",
        usage: {
          input_tokens: 2000,
          output_tokens: 300,
          cache_creation_input_tokens: 500,
          cache_read_input_tokens: 1200,
        },
      };

      const usage = extractUsage(data);

      expect(usage).toEqual({
        promptTokens: 2000,
        completionTokens: 300,
        totalTokens: 2300,
        cachedTokens: 1200,
        reasoningTokens: 0,
        cacheCreationTokens: 500,
        cacheReadTokens: 1200,
      });
    });

    it("should return null for data without usage", () => {
      const data = {
        id: "123",
        content: "Hello",
      };

      const usage = extractUsage(data);
      expect(usage).toBeNull();
    });

    it("should handle missing fields gracefully", () => {
      const data = {
        usage: {
          prompt_tokens: 100,
          // missing completion_tokens and total_tokens
        },
      };

      const usage = extractUsage(data);

      expect(usage).toEqual({
        promptTokens: 100,
        completionTokens: 0,
        totalTokens: 100,
        cachedTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      });
    });

    it("should return null for non-object usage field", () => {
      const data = {
        usage: "invalid",
      };

      const usage = extractUsage(data);
      expect(usage).toBeNull();
    });

    it("should return null for null usage field", () => {
      const data = {
        usage: null,
      };

      const usage = extractUsage(data);
      expect(usage).toBeNull();
    });

    it("should handle Anthropic message_start event", () => {
      const data = {
        type: "message",
        usage: {
          input_tokens: 50,
          output_tokens: 0,
        },
      };

      const usage = extractUsage(data);
      expect(usage).toEqual({
        promptTokens: 50,
        completionTokens: 0,
        totalTokens: 50,
        cachedTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      });
    });

    it("should extract OpenAI Responses API format usage", () => {
      // OpenAI Responses API uses input_tokens/output_tokens without type="message"
      const data = {
        id: "resp_123",
        object: "response",
        status: "completed",
        usage: {
          input_tokens: 137,
          output_tokens: 914,
          total_tokens: 1051,
        },
      };

      const usage = extractUsage(data);

      expect(usage).toEqual({
        promptTokens: 137,
        completionTokens: 914,
        totalTokens: 1051,
        cachedTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      });
    });

    it("should extract OpenAI Responses API detailed cached_tokens/reasoning_tokens (when present)", () => {
      const data = {
        id: "resp_789",
        object: "response",
        status: "completed",
        usage: {
          input_tokens: 1000,
          output_tokens: 200,
          total_tokens: 1200,
          input_tokens_details: {
            cached_tokens: 700,
          },
          output_tokens_details: {
            reasoning_tokens: 50,
          },
        },
      };

      const usage = extractUsage(data);

      expect(usage).toEqual({
        promptTokens: 1000,
        completionTokens: 200,
        totalTokens: 1200,
        cachedTokens: 700,
        reasoningTokens: 50,
        cacheCreationTokens: 0,
        cacheReadTokens: 700,
      });
    });

    it("should calculate total_tokens if missing in Responses API format", () => {
      const data = {
        id: "resp_456",
        usage: {
          input_tokens: 100,
          output_tokens: 200,
        },
      };

      const usage = extractUsage(data);

      expect(usage).toEqual({
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 300,
        cachedTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      });
    });
  });

  describe("createSSETransformer", () => {
    it("should pass through SSE events unchanged", async () => {
      const onUsage = vi.fn();
      const transformer = createSSETransformer(onUsage);

      const input = 'data: {"id":"1"}\n\n';
      const encoder = new TextEncoder();
      const reader = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(input));
          controller.close();
        },
      })
        .pipeThrough(transformer)
        .getReader();

      const chunks: Uint8Array[] = [];
      let result = await reader.read();
      while (!result.done) {
        chunks.push(result.value);
        result = await reader.read();
      }

      const output = new TextDecoder().decode(chunks[0]);
      expect(output).toBe(input);
    });

    it("should extract usage from OpenAI SSE event", async () => {
      const onUsage = vi.fn();
      const transformer = createSSETransformer(onUsage);

      const input =
        'data: {"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}\n\n';
      const encoder = new TextEncoder();
      const reader = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(input));
          controller.close();
        },
      })
        .pipeThrough(transformer)
        .getReader();

      // Drain the stream
      while (!(await reader.read()).done) {}

      expect(onUsage).toHaveBeenCalledWith({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        cachedTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      });
    });

    it("should extract usage from Anthropic SSE event", async () => {
      const onUsage = vi.fn();
      const transformer = createSSETransformer(onUsage);

      const input = 'data: {"type":"message","usage":{"input_tokens":15,"output_tokens":25}}\n\n';
      const encoder = new TextEncoder();
      const reader = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(input));
          controller.close();
        },
      })
        .pipeThrough(transformer)
        .getReader();

      while (!(await reader.read()).done) {}

      expect(onUsage).toHaveBeenCalledWith({
        promptTokens: 15,
        completionTokens: 25,
        totalTokens: 40,
        cachedTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      });
    });

    it("should extract usage from OpenAI Responses API SSE event", async () => {
      const onUsage = vi.fn();
      const transformer = createSSETransformer(onUsage);

      // OpenAI Responses API format: input_tokens/output_tokens without type="message"
      const input =
        'data: {"id":"resp_123","usage":{"input_tokens":137,"output_tokens":914,"total_tokens":1051}}\n\n';
      const encoder = new TextEncoder();
      const reader = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(input));
          controller.close();
        },
      })
        .pipeThrough(transformer)
        .getReader();

      while (!(await reader.read()).done) {}

      expect(onUsage).toHaveBeenCalledWith({
        promptTokens: 137,
        completionTokens: 914,
        totalTokens: 1051,
        cachedTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      });
    });

    it("should extract usage from OpenAI Responses API response.completed event", async () => {
      const onUsage = vi.fn();
      const transformer = createSSETransformer(onUsage);

      // OpenAI Responses API streaming: usage is nested in response.completed event
      const input =
        'data: {"type":"response.completed","response":{"id":"resp_123","status":"completed","usage":{"input_tokens":200,"output_tokens":500,"total_tokens":700}}}\n\n';
      const encoder = new TextEncoder();
      const reader = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(input));
          controller.close();
        },
      })
        .pipeThrough(transformer)
        .getReader();

      while (!(await reader.read()).done) {}

      expect(onUsage).toHaveBeenCalledWith({
        promptTokens: 200,
        completionTokens: 500,
        totalTokens: 700,
        cachedTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      });
    });

    it("should handle [DONE] message", async () => {
      const onUsage = vi.fn();
      const transformer = createSSETransformer(onUsage);

      const input = "data: [DONE]\n\n";
      const encoder = new TextEncoder();
      const reader = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(input));
          controller.close();
        },
      })
        .pipeThrough(transformer)
        .getReader();

      while (!(await reader.read()).done) {}

      expect(onUsage).not.toHaveBeenCalled();
    });

    it("should handle multiple events in chunks", async () => {
      const onUsage = vi.fn();
      const transformer = createSSETransformer(onUsage);

      const event1 = 'data: {"id":"1"}\n\n';
      const event2 =
        'data: {"usage":{"prompt_tokens":5,"completion_tokens":10,"total_tokens":15}}\n\n';
      const encoder = new TextEncoder();

      const reader = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(event1 + event2));
          controller.close();
        },
      })
        .pipeThrough(transformer)
        .getReader();

      while (!(await reader.read()).done) {}

      expect(onUsage).toHaveBeenCalledTimes(1);
      expect(onUsage).toHaveBeenCalledWith({
        promptTokens: 5,
        completionTokens: 10,
        totalTokens: 15,
        cachedTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      });
    });

    it("should handle chunked events across multiple reads", async () => {
      const onUsage = vi.fn();
      const transformer = createSSETransformer(onUsage);

      const encoder = new TextEncoder();
      const reader = new ReadableStream({
        start(controller) {
          // Split an event across two chunks
          controller.enqueue(encoder.encode('data: {"usage":{"prompt'));
          controller.enqueue(
            encoder.encode('_tokens":7,"completion_tokens":14,"total_tokens":21}}\n\n')
          );
          controller.close();
        },
      })
        .pipeThrough(transformer)
        .getReader();

      while (!(await reader.read()).done) {}

      expect(onUsage).toHaveBeenCalledWith({
        promptTokens: 7,
        completionTokens: 14,
        totalTokens: 21,
        cachedTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      });
    });

    it("should handle non-JSON data lines gracefully", async () => {
      const onUsage = vi.fn();
      const transformer = createSSETransformer(onUsage);

      const input = "data: not-json-data\n\n";
      const encoder = new TextEncoder();
      const reader = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(input));
          controller.close();
        },
      })
        .pipeThrough(transformer)
        .getReader();

      while (!(await reader.read()).done) {}

      expect(onUsage).not.toHaveBeenCalled();
    });

    it("should flush remaining buffer on close", async () => {
      const onUsage = vi.fn();
      const transformer = createSSETransformer(onUsage);

      // Data without double newline (incomplete event)
      const input = "data: partial";
      const encoder = new TextEncoder();
      const reader = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(input));
          controller.close();
        },
      })
        .pipeThrough(transformer)
        .getReader();

      const chunks: Uint8Array[] = [];
      let result = await reader.read();
      while (!result.done) {
        chunks.push(result.value);
        result = await reader.read();
      }

      const output = new TextDecoder().decode(chunks[0]);
      expect(output).toBe(input);
    });
  });

  describe("prepareUpstreamForProxy", () => {
    it("should decrypt API key and map upstream fields", () => {
      const upstream: Upstream = {
        id: "upstream-1",
        name: "Test Upstream",
        providerType: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKeyEncrypted: "encrypted-key-123",
        apiKeyMasked: "sk-***123",
        timeout: 120,
        isDefault: true,
        isActive: true,
        description: "Test",
        config: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = prepareUpstreamForProxy(upstream);

      expect(result).toEqual({
        id: "upstream-1",
        name: "Test Upstream",
        providerType: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "decrypted-encrypted-key-123",
        timeout: 120,
      });
    });

    it("should handle anthropic provider", () => {
      const upstream: Upstream = {
        id: "upstream-2",
        name: "Anthropic",
        providerType: "anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        apiKeyEncrypted: "ant-encrypted",
        apiKeyMasked: "ant-***",
        timeout: 60,
        isDefault: false,
        isActive: true,
        description: null,
        config: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = prepareUpstreamForProxy(upstream);

      expect(result.providerType).toBe("anthropic");
      expect(result.apiKey).toBe("decrypted-ant-encrypted");
    });
  });

  describe("forwardRequest", () => {
    const mockUpstream: UpstreamForProxy = {
      id: "test-upstream",
      name: "Test OpenAI",
      providerType: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test-key",
      timeout: 30,
    };

    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      global.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    it("should forward request to upstream with correct URL", async () => {
      const mockResponse = new Response(JSON.stringify({ id: "123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const request = new Request("http://localhost/api/proxy/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4", messages: [] }),
      });

      await forwardRequest(request, mockUpstream, "chat/completions", "req-123");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    it("should inject authorization header for OpenAI", async () => {
      const mockResponse = new Response(JSON.stringify({ id: "123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const request = new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      await forwardRequest(request, mockUpstream, "chat/completions", "req-123");

      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[1].headers["Authorization"]).toBe("Bearer sk-test-key");
    });

    it("should inject x-api-key for Anthropic", async () => {
      const anthropicUpstream: UpstreamForProxy = {
        ...mockUpstream,
        providerType: "anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        apiKey: "ant-key",
      };

      const mockResponse = new Response(JSON.stringify({ id: "123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const request = new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      await forwardRequest(request, anthropicUpstream, "messages", "req-123");

      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[1].headers["x-api-key"]).toBe("ant-key");
    });

    it("should return non-streaming response with usage extraction", async () => {
      const responseBody = {
        id: "chatcmpl-123",
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      const mockResponse = new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const request = new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4" }),
      });

      const result = await forwardRequest(request, mockUpstream, "chat/completions", "req-123");

      expect(result.statusCode).toBe(200);
      expect(result.isStream).toBe(false);
      expect(result.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cachedTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      });
    });

    it("should handle streaming response", async () => {
      const sseData = 'data: {"id":"1"}\n\ndata: [DONE]\n\n';
      const mockResponse = new Response(sseData, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const request = new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4", stream: true }),
      });

      const result = await forwardRequest(request, mockUpstream, "chat/completions", "req-123");

      expect(result.statusCode).toBe(200);
      expect(result.isStream).toBe(true);
      expect(result.body).toBeInstanceOf(ReadableStream);

      await expect(result.usagePromise).resolves.toBeNull();
    });

    it("should handle timeout error", async () => {
      // Mock fetch to immediately trigger abort when signal is set
      global.fetch = vi.fn().mockImplementation((_url: string, options: RequestInit) => {
        return new Promise((_, reject) => {
          const signal = options.signal;
          if (signal) {
            // Check if already aborted
            if (signal.aborted) {
              const error = new Error("Aborted");
              error.name = "AbortError";
              reject(error);
              return;
            }
            signal.addEventListener("abort", () => {
              const error = new Error("Aborted");
              error.name = "AbortError";
              reject(error);
            });
          }
        });
      });

      const shortTimeoutUpstream: UpstreamForProxy = {
        ...mockUpstream,
        timeout: 0.001, // 1ms timeout - very short to complete quickly
      };

      const request = new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      await expect(
        forwardRequest(request, shortTimeoutUpstream, "chat/completions", "req-123")
      ).rejects.toThrow("Upstream request timed out after 0.001s");
    });

    it("should handle network errors", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const request = new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      await expect(
        forwardRequest(request, mockUpstream, "chat/completions", "req-123")
      ).rejects.toThrow("Network error");
    });

    it("should strip trailing slash from base URL", async () => {
      const upstreamWithSlash: UpstreamForProxy = {
        ...mockUpstream,
        baseUrl: "https://api.openai.com/v1/",
      };

      const mockResponse = new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const request = new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({}),
      });

      await forwardRequest(request, upstreamWithSlash, "/chat/completions", "req-123");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/chat/completions",
        expect.anything()
      );
    });

    it("should handle request without body", async () => {
      const mockResponse = new Response(JSON.stringify({ models: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const request = new Request("http://localhost/api", {
        method: "GET",
      });

      const result = await forwardRequest(request, mockUpstream, "models", "req-123");

      expect(result.statusCode).toBe(200);
      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[1].body).toBeUndefined();
    });

    it("should filter hop-by-hop headers from response", async () => {
      const mockResponse = new Response(JSON.stringify({}), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          Connection: "keep-alive",
          "Transfer-Encoding": "chunked",
          "X-Custom-Header": "value",
        },
      });

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const request = new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const result = await forwardRequest(request, mockUpstream, "chat/completions", "req-123");

      expect(result.headers.get("Content-Type")).toBe("application/json");
      expect(result.headers.get("X-Custom-Header")).toBe("value");
      expect(result.headers.get("Connection")).toBeNull();
      expect(result.headers.get("Transfer-Encoding")).toBeNull();
    });

    it("should handle non-JSON response body", async () => {
      const mockResponse = new Response("Plain text response", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const request = new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const result = await forwardRequest(request, mockUpstream, "chat/completions", "req-123");

      expect(result.statusCode).toBe(200);
      expect(result.isStream).toBe(false);
      expect(result.usage).toBeUndefined();
    });

    it("should return upstream error status codes", async () => {
      const mockResponse = new Response(JSON.stringify({ error: "Rate limited" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const request = new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const result = await forwardRequest(request, mockUpstream, "chat/completions", "req-123");

      expect(result.statusCode).toBe(429);
    });
  });
});
