import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getProviderTypeForModel,
  detectCircularRedirect,
  validateModelRedirects,
  resolveModelWithRedirects,
  filterUpstreamsByModel,
  routeByModel,
  NoUpstreamGroupError,
  CircularRedirectError,
  VALID_PROVIDER_TYPES,
  MODEL_PREFIX_TO_PROVIDER_TYPE,
  type ProviderType,
} from "@/lib/services/model-router";
import type { Upstream } from "@/lib/db";

type PartialUpstream = Partial<Upstream> & { id: string; name: string };

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      upstreamGroups: {
        findFirst: vi.fn(),
      },
      upstreams: {
        findMany: vi.fn(),
      },
    },
  },
  upstreams: {},
  upstreamGroups: {},
}));

describe("model-router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("VALID_PROVIDER_TYPES", () => {
    it("should contain all valid provider types", () => {
      expect(VALID_PROVIDER_TYPES).toContain("anthropic");
      expect(VALID_PROVIDER_TYPES).toContain("openai");
      expect(VALID_PROVIDER_TYPES).toContain("google");
      expect(VALID_PROVIDER_TYPES).toContain("custom");
      expect(VALID_PROVIDER_TYPES).toHaveLength(4);
    });
  });

  describe("MODEL_PREFIX_TO_PROVIDER_TYPE", () => {
    it("should map claude- prefix to anthropic", () => {
      expect(MODEL_PREFIX_TO_PROVIDER_TYPE["claude-"]).toBe("anthropic");
    });

    it("should map gpt- prefix to openai", () => {
      expect(MODEL_PREFIX_TO_PROVIDER_TYPE["gpt-"]).toBe("openai");
    });

    it("should map gemini- prefix to google", () => {
      expect(MODEL_PREFIX_TO_PROVIDER_TYPE["gemini-"]).toBe("google");
    });
  });

  describe("getProviderTypeForModel", () => {
    it("should return anthropic for claude models", () => {
      expect(getProviderTypeForModel("claude-3-opus-20240229")).toBe("anthropic");
      expect(getProviderTypeForModel("claude-3-sonnet")).toBe("anthropic");
      expect(getProviderTypeForModel("claude-3-haiku")).toBe("anthropic");
    });

    it("should return openai for gpt models", () => {
      expect(getProviderTypeForModel("gpt-4")).toBe("openai");
      expect(getProviderTypeForModel("gpt-4-turbo")).toBe("openai");
      expect(getProviderTypeForModel("gpt-3.5-turbo")).toBe("openai");
    });

    it("should return google for gemini models", () => {
      expect(getProviderTypeForModel("gemini-pro")).toBe("google");
      expect(getProviderTypeForModel("gemini-ultra")).toBe("google");
    });

    it("should be case insensitive", () => {
      expect(getProviderTypeForModel("CLAUDE-3-OPUS")).toBe("anthropic");
      expect(getProviderTypeForModel("GPT-4")).toBe("openai");
      expect(getProviderTypeForModel("GEMINI-PRO")).toBe("google");
    });

    it("should return null for unknown model prefixes", () => {
      expect(getProviderTypeForModel("unknown-model")).toBeNull();
      expect(getProviderTypeForModel("llama-2")).toBeNull();
    });
  });

  describe("detectCircularRedirect", () => {
    it("should detect simple circular redirect", () => {
      const redirects = { a: "b", b: "a" };
      expect(detectCircularRedirect(redirects, "a")).toBe(true);
      expect(detectCircularRedirect(redirects, "b")).toBe(true);
    });

    it("should detect chain circular redirect", () => {
      const redirects = { a: "b", b: "c", c: "a" };
      expect(detectCircularRedirect(redirects, "a")).toBe(true);
      expect(detectCircularRedirect(redirects, "b")).toBe(true);
      expect(detectCircularRedirect(redirects, "c")).toBe(true);
    });

    it("should not detect false positive", () => {
      const redirects = { a: "b", b: "c" };
      expect(detectCircularRedirect(redirects, "a")).toBe(false);
      expect(detectCircularRedirect(redirects, "b")).toBe(false);
      expect(detectCircularRedirect(redirects, "c")).toBe(false);
    });

    it("should handle empty redirects", () => {
      expect(detectCircularRedirect({}, "a")).toBe(false);
    });

    it("should handle non-existent source model", () => {
      const redirects = { a: "b" };
      expect(detectCircularRedirect(redirects, "c")).toBe(false);
    });
  });

  describe("validateModelRedirects", () => {
    it("should return null for valid redirects", () => {
      const redirects = { a: "b", b: "c" };
      expect(validateModelRedirects(redirects)).toBeNull();
    });

    it("should return null for empty redirects", () => {
      expect(validateModelRedirects({})).toBeNull();
      expect(validateModelRedirects(null)).toBeNull();
    });

    it("should return error message for circular redirect", () => {
      const redirects = { a: "b", b: "a" };
      const result = validateModelRedirects(redirects);
      expect(result).toContain("Circular redirect detected");
      expect(result).toContain("a");
    });

    it("should return error message for chain circular redirect", () => {
      const redirects = { a: "b", b: "c", c: "a" };
      const result = validateModelRedirects(redirects);
      expect(result).toContain("Circular redirect detected");
    });
  });

  describe("resolveModelWithRedirects", () => {
    it("should return original model when no redirects", () => {
      const result = resolveModelWithRedirects("gpt-4", null);
      expect(result.resolvedModel).toBe("gpt-4");
      expect(result.redirectApplied).toBe(false);
    });

    it("should apply single redirect", () => {
      const redirects = { "gpt-4-turbo": "gpt-4" };
      const result = resolveModelWithRedirects("gpt-4-turbo", redirects);
      expect(result.resolvedModel).toBe("gpt-4");
      expect(result.redirectApplied).toBe(true);
    });

    it("should follow redirect chain", () => {
      const redirects = { a: "b", b: "c", c: "d" };
      const result = resolveModelWithRedirects("a", redirects);
      expect(result.resolvedModel).toBe("d");
      expect(result.redirectApplied).toBe(true);
    });

    it("should stop at max depth", () => {
      const redirects: Record<string, string> = {};
      for (let i = 0; i < 20; i++) {
        redirects[`model-${i}`] = `model-${i + 1}`;
      }
      const result = resolveModelWithRedirects("model-0", redirects);
      // Should stop at depth 10
      expect(result.redirectApplied).toBe(true);
    });

    it("should return original model if not in redirects", () => {
      const redirects = { a: "b" };
      const result = resolveModelWithRedirects("c", redirects);
      expect(result.resolvedModel).toBe("c");
      expect(result.redirectApplied).toBe(false);
    });
  });

  describe("filterUpstreamsByModel", () => {
    it("should include upstreams with no allowedModels", () => {
      const upstreams: PartialUpstream[] = [
        { id: "1", name: "upstream-1", allowedModels: null },
        { id: "2", name: "upstream-2", allowedModels: [] },
      ];
      const result = filterUpstreamsByModel(upstreams as Upstream[], "gpt-4");
      expect(result).toHaveLength(2);
    });

    it("should include upstreams that support the model", () => {
      const upstreams: PartialUpstream[] = [
        { id: "1", name: "upstream-1", allowedModels: ["gpt-4", "gpt-3.5"] },
        { id: "2", name: "upstream-2", allowedModels: ["claude-3"] },
      ];
      const result = filterUpstreamsByModel(upstreams as Upstream[], "gpt-4");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("should exclude upstreams that do not support the model", () => {
      const upstreams: PartialUpstream[] = [
        { id: "1", name: "upstream-1", allowedModels: ["gpt-4"] },
        { id: "2", name: "upstream-2", allowedModels: ["claude-3"] },
      ];
      const result = filterUpstreamsByModel(upstreams as Upstream[], "gpt-3.5");
      expect(result).toHaveLength(0);
    });

    it("should handle mixed upstreams", () => {
      const upstreams: PartialUpstream[] = [
        { id: "1", name: "upstream-1", allowedModels: null },
        { id: "2", name: "upstream-2", allowedModels: ["gpt-4"] },
        { id: "3", name: "upstream-3", allowedModels: ["claude-3"] },
      ];
      const result = filterUpstreamsByModel(upstreams as Upstream[], "gpt-4");
      expect(result).toHaveLength(2);
      expect(result.map((u) => u.id)).toContain("1");
      expect(result.map((u) => u.id)).toContain("2");
    });
  });

  describe("routeByModel", () => {
    it("should throw NoUpstreamGroupError when group does not exist", async () => {
      const { db } = await import("@/lib/db");
      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue(null);

      await expect(routeByModel("gpt-4")).rejects.toThrow(NoUpstreamGroupError);
    });

    it("should return null upstream when provider type is unknown", async () => {
      const result = await routeByModel("unknown-model");
      expect(result.upstream).toBeNull();
      expect(result.providerType).toBeNull();
      expect(result.groupName).toBeNull();
    });

    it("should route to upstream with matching allowedModels", async () => {
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue({
        id: "group-id",
        name: "openai",
        provider: "openai",
      } as unknown as Awaited<ReturnType<typeof db.query.upstreamGroups.findFirst>>);

      vi.mocked(db.query.upstreams.findMany).mockResolvedValue([
        {
          id: "upstream-1",
          name: "openai-1",
          allowedModels: ["gpt-4"],
          modelRedirects: null,
        },
        {
          id: "upstream-2",
          name: "openai-2",
          allowedModels: ["gpt-3.5"],
          modelRedirects: null,
        },
      ] as unknown as Awaited<ReturnType<typeof db.query.upstreams.findMany>>);

      const result = await routeByModel("gpt-4");

      expect(result.upstream).not.toBeNull();
      expect(result.upstream?.id).toBe("upstream-1");
      expect(result.providerType).toBe("openai");
      expect(result.groupName).toBe("openai");
    });

    it("should apply model redirects", async () => {
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue({
        id: "group-id",
        name: "openai",
        provider: "openai",
      } as unknown as Awaited<ReturnType<typeof db.query.upstreamGroups.findFirst>>);

      vi.mocked(db.query.upstreams.findMany).mockResolvedValue([
        {
          id: "upstream-1",
          name: "openai-1",
          allowedModels: null,
          modelRedirects: { "gpt-4-turbo": "gpt-4" },
        },
      ] as unknown as Awaited<ReturnType<typeof db.query.upstreams.findMany>>);

      const result = await routeByModel("gpt-4-turbo");

      expect(result.resolvedModel).toBe("gpt-4");
      expect(result.routingDecision.modelRedirectApplied).toBe(true);
    });

    it("should include routing decision details", async () => {
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue({
        id: "group-id",
        name: "anthropic",
        provider: "anthropic",
      } as unknown as Awaited<ReturnType<typeof db.query.upstreamGroups.findFirst>>);

      vi.mocked(db.query.upstreams.findMany).mockResolvedValue([
        {
          id: "upstream-1",
          name: "anthropic-1",
          allowedModels: ["claude-3-opus"],
          modelRedirects: null,
        },
      ] as unknown as Awaited<ReturnType<typeof db.query.upstreams.findMany>>);

      const result = await routeByModel("claude-3-opus");

      expect(result.routingDecision.originalModel).toBe("claude-3-opus");
      expect(result.routingDecision.resolvedModel).toBe("claude-3-opus");
      expect(result.routingDecision.providerType).toBe("anthropic");
      expect(result.routingDecision.groupName).toBe("anthropic");
      expect(result.routingDecision.upstreamName).toBe("anthropic-1");
      expect(result.routingDecision.allowedModelsFilter).toBe(true);
      expect(result.routingDecision.modelRedirectApplied).toBe(false);
    });
  });

  describe("NoUpstreamGroupError", () => {
    it("should have correct name", () => {
      const error = new NoUpstreamGroupError("gpt-4");
      expect(error.name).toBe("NoUpstreamGroupError");
    });

    it("should have correct message", () => {
      const error = new NoUpstreamGroupError("gpt-4");
      expect(error.message).toBe("No upstream group configured for model: gpt-4");
    });

    it("should be instanceof Error", () => {
      const error = new NoUpstreamGroupError("test");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("CircularRedirectError", () => {
    it("should have correct name", () => {
      const error = new CircularRedirectError("gpt-4");
      expect(error.name).toBe("CircularRedirectError");
    });

    it("should have correct message", () => {
      const error = new CircularRedirectError("gpt-4");
      expect(error.message).toBe("Circular model redirect detected: gpt-4");
    });

    it("should be instanceof Error", () => {
      const error = new CircularRedirectError("test");
      expect(error).toBeInstanceOf(Error);
    });
  });
});
