import { describe, it, expect } from "vitest";
import {
  filterHeaders,
  injectAuthHeader,
  extractUsage,
  type UpstreamForProxy,
} from "@/lib/services/proxy-client";

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
      provider: "openai",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test-key",
      timeout: 60,
    };

    const anthropicUpstream: UpstreamForProxy = {
      id: "2",
      name: "anthropic",
      provider: "anthropic",
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
      expect(result["anthropic-version"]).toBe("2023-06-01");
    });

    it("should preserve existing anthropic-version if present", () => {
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
        totalTokens: 0,
      });
    });
  });
});
