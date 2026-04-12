import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils/logger", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe("upstream-model-discovery", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves a configured API path prefix for OpenAI-compatible discovery", async () => {
    const { discoverUpstreamModels } = await import("@/lib/services/upstream-model-discovery");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [{ id: "gpt-4.1" }, { id: "gpt-4.1-mini" }],
      }),
    });

    const catalog = await discoverUpstreamModels({
      id: "up-openai",
      name: "OpenAI",
      baseUrl: "https://www.right.codes/codex/v1",
      apiKey: "sk-test",
      routeCapabilities: ["openai_chat_compatible"],
      modelDiscovery: {
        mode: "openai_compatible",
        customEndpoint: null,
        enableLiteLlmFallback: false,
      },
    });

    expect(catalog).toEqual([
      { model: "gpt-4.1", source: "native" },
      { model: "gpt-4.1-mini", source: "native" },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.right.codes/codex/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test",
          Accept: "application/json",
        }),
      })
    );
  });

  it("keeps the default OpenAI-compatible models path for a root base URL", async () => {
    const { discoverUpstreamModels } = await import("@/lib/services/upstream-model-discovery");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [{ id: "gpt-4.1" }],
      }),
    });

    await discoverUpstreamModels({
      id: "up-openai-root",
      name: "OpenAI Root",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test",
      routeCapabilities: ["openai_chat_compatible"],
      modelDiscovery: {
        mode: "openai_compatible",
        customEndpoint: null,
        enableLiteLlmFallback: false,
      },
    });

    expect(fetchMock).toHaveBeenCalledWith("https://api.openai.com/v1/models", expect.any(Object));
  });

  it("uses Anthropic headers for anthropic-native discovery", async () => {
    const { discoverUpstreamModels } = await import("@/lib/services/upstream-model-discovery");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [{ id: "claude-sonnet-4-20250514" }],
      }),
    });

    await discoverUpstreamModels({
      id: "up-anthropic",
      name: "Anthropic",
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-test",
      routeCapabilities: ["anthropic_messages"],
      modelDiscovery: {
        mode: "anthropic_native",
        customEndpoint: null,
        enableLiteLlmFallback: false,
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-api-key": "sk-ant-test",
          "anthropic-version": "2023-06-01",
        }),
      })
    );
  });

  it("uses Gemini native discovery and strips the models/ prefix", async () => {
    const { discoverUpstreamModels } = await import("@/lib/services/upstream-model-discovery");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        models: [{ name: "models/gemini-2.5-pro" }, { name: "models/gemini-2.5-flash" }],
      }),
    });

    const catalog = await discoverUpstreamModels({
      id: "up-gemini",
      name: "Gemini",
      baseUrl: "https://generativelanguage.googleapis.com",
      apiKey: "gemini-key",
      routeCapabilities: ["gemini_native_generate"],
      modelDiscovery: {
        mode: "gemini_native",
        customEndpoint: null,
        enableLiteLlmFallback: false,
      },
    });

    expect(catalog).toEqual([
      { model: "gemini-2.5-pro", source: "native" },
      { model: "gemini-2.5-flash", source: "native" },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models?key=gemini-key",
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "application/json" }),
      })
    );
  });

  it("resolves relative custom discovery endpoints from the configured API root", async () => {
    const { discoverUpstreamModels } = await import("@/lib/services/upstream-model-discovery");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [{ id: "gpt-4.1" }],
      }),
    });

    await discoverUpstreamModels({
      id: "up-custom",
      name: "Custom Discovery",
      baseUrl: "https://www.right.codes/codex/v1",
      apiKey: "sk-test",
      routeCapabilities: ["openai_chat_compatible"],
      modelDiscovery: {
        mode: "custom",
        customEndpoint: "catalog/models",
        enableLiteLlmFallback: false,
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.right.codes/codex/v1/catalog/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test",
        }),
      })
    );
  });

  it("treats LiteLLM catalogs as inferred metadata", async () => {
    const { discoverUpstreamModels } = await import("@/lib/services/upstream-model-discovery");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        "gpt-4.1": { input_cost_per_token: 0.000002 },
        "claude-sonnet-4": { input_cost_per_token: 0.000003 },
      }),
    });

    const catalog = await discoverUpstreamModels({
      id: "up-litellm",
      name: "LiteLLM",
      baseUrl: "https://proxy.example.com",
      apiKey: "unused",
      routeCapabilities: ["openai_chat_compatible"],
      modelDiscovery: {
        mode: "litellm",
        customEndpoint: null,
        enableLiteLlmFallback: false,
      },
    });

    expect(catalog).toEqual([
      { model: "gpt-4.1", source: "inferred" },
      { model: "claude-sonnet-4", source: "inferred" },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("falls back to LiteLLM when native discovery fails and fallback is enabled", async () => {
    const { refreshUpstreamModelCatalog } = await import("@/lib/services/upstream-model-discovery");

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          "gpt-4.1": { input_cost_per_token: 0.000002 },
        }),
      });

    const result = await refreshUpstreamModelCatalog({
      id: "up-fallback",
      name: "OpenAI with fallback",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test",
      routeCapabilities: ["openai_chat_compatible"],
      modelDiscovery: {
        mode: "openai_compatible",
        customEndpoint: null,
        enableLiteLlmFallback: true,
      },
    });

    expect(result.modelCatalogLastStatus).toBe("success");
    expect(result.fallbackUsed).toBe(true);
    expect(result.modelCatalog).toEqual([{ model: "gpt-4.1", source: "inferred" }]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.openai.com/v1/models",
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json",
      expect.any(Object)
    );
  });

  it("returns a failure patch when discovery is not configured", async () => {
    const { refreshUpstreamModelCatalog } = await import("@/lib/services/upstream-model-discovery");

    const result = await refreshUpstreamModelCatalog({
      id: "up-none",
      name: "No discovery",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test",
      routeCapabilities: ["openai_chat_compatible"],
      modelDiscovery: null,
    });

    expect(result).toEqual(
      expect.objectContaining({
        upstreamId: "up-none",
        upstreamName: "No discovery",
        modelCatalog: null,
        modelCatalogUpdatedAt: null,
        modelCatalogLastStatus: "failure",
        fallbackUsed: false,
      })
    );
    expect(result.modelCatalogLastError).toContain("not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
