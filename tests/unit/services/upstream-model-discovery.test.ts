import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildUpstreamModelDiscoveryRequest,
  normalizeApiRoot,
  refreshUpstreamModelCatalog,
} from "@/lib/services/upstream-model-discovery";

describe("upstream-model-discovery", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("normalizeApiRoot", () => {
    it("should preserve configured API-root path prefixes", () => {
      expect(normalizeApiRoot("https://gateway.example.com/codex/v1/")).toBe(
        "https://gateway.example.com/codex/v1"
      );
    });

    it("should avoid duplicating trailing models segments", () => {
      expect(normalizeApiRoot("https://gateway.example.com/codex/v1/models")).toBe(
        "https://gateway.example.com/codex/v1"
      );
    });
  });

  describe("buildUpstreamModelDiscoveryRequest", () => {
    it("should build an OpenAI-compatible request from the configured API root", () => {
      const request = buildUpstreamModelDiscoveryRequest({
        baseUrl: "https://gateway.example.com/codex/v1",
        apiKey: "sk-test",
        routeCapabilities: ["openai_chat_compatible"],
      });

      expect(request).toEqual({
        url: "https://gateway.example.com/codex/v1/models",
        headers: {
          Authorization: "Bearer sk-test",
        },
      });
    });

    it("should build a Gemini native request with query-key authentication", () => {
      const request = buildUpstreamModelDiscoveryRequest({
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        apiKey: "gemini-key",
        routeCapabilities: ["gemini_native_generate"],
      });

      expect(request).toEqual({
        url: "https://generativelanguage.googleapis.com/v1beta/models?key=gemini-key",
        headers: {},
      });
    });

    it("should build an Anthropic native request with header-based authentication", () => {
      const request = buildUpstreamModelDiscoveryRequest({
        baseUrl: "https://api.anthropic.com/v1/",
        apiKey: "sk-ant-test",
        routeCapabilities: ["anthropic_messages"],
        modelDiscovery: {
          mode: "anthropic_native",
          customEndpoint: null,
          enableLiteLlmFallback: false,
        },
      });

      expect(request).toEqual({
        url: "https://api.anthropic.com/v1/models",
        headers: {
          "x-api-key": "sk-ant-test",
          "anthropic-version": "2023-06-01",
        },
      });
    });

    it("should build a custom Gemini request with query-key authentication", () => {
      const request = buildUpstreamModelDiscoveryRequest({
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openapi/",
        apiKey: "gemini-key",
        routeCapabilities: ["gemini_native_generate"],
        modelDiscovery: {
          mode: "custom",
          customEndpoint: "models?alt=sse",
          enableLiteLlmFallback: false,
        },
      });

      expect(request).toEqual({
        url: "https://generativelanguage.googleapis.com/v1beta/openapi/models?alt=sse&key=gemini-key",
        headers: {},
      });
    });

    it("should build a LiteLLM request without provider authentication", () => {
      const request = buildUpstreamModelDiscoveryRequest({
        baseUrl: "https://gateway.example.com/codex/v1",
        apiKey: "sk-test",
        routeCapabilities: ["openai_chat_compatible"],
        modelDiscovery: {
          mode: "litellm",
          customEndpoint: null,
          enableLiteLlmFallback: false,
        },
      });

      expect(request).toEqual({
        url: "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json",
        headers: {},
      });
    });

    it("should reject custom discovery mode without a custom endpoint", () => {
      expect(() =>
        buildUpstreamModelDiscoveryRequest({
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-test",
          routeCapabilities: ["openai_chat_compatible"],
          modelDiscovery: {
            mode: "custom",
            customEndpoint: "   ",
            enableLiteLlmFallback: false,
          },
        })
      ).toThrow("Custom discovery endpoint is required when mode is custom");
    });

    it("should reject requests when discovery mode cannot be inferred", () => {
      expect(() =>
        buildUpstreamModelDiscoveryRequest({
          baseUrl: "https://gateway.example.com",
          apiKey: "sk-test",
          routeCapabilities: [],
        })
      ).toThrow("Unable to infer model discovery mode from route capabilities");
    });
  });

  describe("refreshUpstreamModelCatalog", () => {
    it("should refresh catalog entries from a native provider response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [{ id: "gpt-4.1" }, { id: "gpt-4.1-mini" }],
        }),
      });

      const result = await refreshUpstreamModelCatalog({
        baseUrl: "https://gateway.example.com/codex/v1",
        apiKey: "sk-test",
        routeCapabilities: ["openai_chat_compatible"],
      });

      expect(result.modelCatalog).toEqual([
        { model: "gpt-4.1", source: "native" },
        { model: "gpt-4.1-mini", source: "native" },
      ]);
      expect(result.modelCatalogLastStatus).toBe("success");
      expect(result.modelCatalogUpdatedAt).toBeInstanceOf(Date);
      expect(result.modelCatalogLastFailedAt).toBeNull();
    });

    it("should keep the previous catalog and record a failure when refresh fails without fallback", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: vi.fn().mockResolvedValue("upstream unavailable"),
      });

      const previousCatalog = [{ model: "gpt-4.1", source: "native" as const }];
      const result = await refreshUpstreamModelCatalog({
        baseUrl: "https://gateway.example.com/codex/v1",
        apiKey: "sk-test",
        routeCapabilities: ["openai_chat_compatible"],
        previousCatalog,
      });

      expect(result.modelCatalog).toEqual(previousCatalog);
      expect(result.modelCatalogLastStatus).toBe("failed");
      expect(result.modelCatalogLastError).toContain("HTTP 503");
      expect(result.modelCatalogLastFailedAt).toBeInstanceOf(Date);
    });

    it("should use LiteLLM fallback entries when native refresh fails and fallback is enabled", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: vi.fn().mockResolvedValue("temporary failure"),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            "gpt-4.1": { max_input_tokens: 128000 },
            "claude-3-7-sonnet": { max_input_tokens: 200000 },
          }),
        });

      const result = await refreshUpstreamModelCatalog({
        baseUrl: "https://gateway.example.com/codex/v1",
        apiKey: "sk-test",
        routeCapabilities: ["openai_chat_compatible"],
        modelDiscovery: {
          mode: "openai_compatible",
          customEndpoint: null,
          enableLiteLlmFallback: true,
        },
      });

      expect(result.modelCatalog).toEqual([
        { model: "claude-3-7-sonnet", source: "inferred" },
        { model: "gpt-4.1", source: "inferred" },
      ]);
      expect(result.modelCatalogLastStatus).toBe("success");
      expect(result.modelCatalogLastError).toBeNull();
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json",
        expect.objectContaining({
          method: "GET",
        })
      );
    });

    it("should refresh a LiteLLM catalog directly when litellm mode is selected", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          "gpt-4.1": { max_input_tokens: 128000 },
          "claude-3-7-sonnet": { max_input_tokens: 200000 },
        }),
      });

      const result = await refreshUpstreamModelCatalog({
        baseUrl: "https://gateway.example.com/codex/v1",
        apiKey: "sk-test",
        routeCapabilities: ["openai_chat_compatible"],
        modelDiscovery: {
          mode: "litellm",
          customEndpoint: null,
          enableLiteLlmFallback: false,
        },
      });

      expect(result.modelCatalog).toEqual([
        { model: "claude-3-7-sonnet", source: "inferred" },
        { model: "gpt-4.1", source: "inferred" },
      ]);
      expect(result.modelCatalogLastStatus).toBe("success");
      expect(result.modelDiscovery).toEqual({
        mode: "litellm",
        customEndpoint: null,
        enableLiteLlmFallback: false,
      });
    });

    it("should parse model names from a models array and strip provider prefixes", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          models: [{ name: "models/gemini-2.5-pro" }, { model: "gpt-4.1" }, "claude-3-7-sonnet"],
        }),
      });

      const result = await refreshUpstreamModelCatalog({
        baseUrl: "https://gateway.example.com/codex/v1",
        apiKey: "sk-test",
        routeCapabilities: ["openai_chat_compatible"],
      });

      expect(result.modelCatalog).toEqual([
        { model: "claude-3-7-sonnet", source: "native" },
        { model: "gemini-2.5-pro", source: "native" },
        { model: "gpt-4.1", source: "native" },
      ]);
    });

    it("should preserve the previous catalog when the native response contains no models", async () => {
      const previousCatalog = [{ model: "gpt-4.1", source: "native" as const }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [],
        }),
      });

      const result = await refreshUpstreamModelCatalog({
        baseUrl: "https://gateway.example.com/codex/v1",
        apiKey: "sk-test",
        routeCapabilities: ["openai_chat_compatible"],
        previousCatalog,
      });

      expect(result.modelCatalog).toEqual(previousCatalog);
      expect(result.modelCatalogLastStatus).toBe("failed");
      expect(result.modelCatalogLastError).toBe(
        "Model discovery response did not contain any model entries"
      );
    });

    it("should combine the native and fallback errors when LiteLLM fallback also fails", async () => {
      const previousCatalog = [{ model: "gpt-4.1", source: "native" as const }];
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: vi.fn().mockResolvedValue("upstream unavailable"),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({}),
        });

      const result = await refreshUpstreamModelCatalog({
        baseUrl: "https://gateway.example.com/codex/v1",
        apiKey: "sk-test",
        routeCapabilities: ["openai_chat_compatible"],
        previousCatalog,
        modelDiscovery: {
          mode: "openai_compatible",
          customEndpoint: null,
          enableLiteLlmFallback: true,
        },
      });

      expect(result.modelCatalog).toEqual(previousCatalog);
      expect(result.modelCatalogLastStatus).toBe("failed");
      expect(result.modelCatalogLastError).toContain("HTTP 503");
      expect(result.modelCatalogLastError).toContain(
        "LiteLLM fallback failed: LiteLLM catalog did not contain any model entries"
      );
      expect(result.modelCatalogLastFailedAt).toBeInstanceOf(Date);
    });

    it("should reject refreshes when discovery configuration cannot be determined", async () => {
      await expect(
        refreshUpstreamModelCatalog({
          baseUrl: "https://gateway.example.com/codex/v1",
          apiKey: "sk-test",
          routeCapabilities: [],
        })
      ).rejects.toThrow("Unable to determine model discovery configuration");
    });
  });
});
