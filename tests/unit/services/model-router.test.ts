import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getProviderTypeForModel,
  detectCircularRedirect,
  validateModelRedirects,
  resolveModelWithRedirects,
  filterUpstreamsByModel,
  filterUpstreamsByCircuitBreaker,
  getUpstreamsByProviderType,
  routeByModel,
  NoUpstreamGroupError,
  NoHealthyUpstreamError,
  CircularRedirectError,
  VALID_PROVIDER_TYPES,
  MODEL_PREFIX_TO_PROVIDER_TYPE,
} from "@/lib/services/model-router";
import type { Upstream } from "@/lib/db";
import { db } from "@/lib/db";

type PartialUpstream = Partial<Upstream> & { id: string; name: string };

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      upstreams: {
        findMany: vi.fn(),
      },
      circuitBreakerStates: {
        findFirst: vi.fn(),
      },
    },
  },
  upstreams: {},
  circuitBreakerStates: {},
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
    beforeEach(() => {
      // Default mock for circuit breaker state (all upstreams closed/healthy)
      vi.mocked(db.query.circuitBreakerStates.findFirst).mockResolvedValue(null);
    });

    it("should throw NoUpstreamGroupError when no upstreams exist for provider type", async () => {
      // Mock no upstreams for provider_type
      vi.mocked(db.query.upstreams.findMany).mockResolvedValue([]);

      await expect(routeByModel("gpt-4")).rejects.toThrow(NoUpstreamGroupError);
    });

    it("should return null upstream when provider type is unknown", async () => {
      const result = await routeByModel("unknown-model");
      expect(result.upstream).toBeNull();
      expect(result.providerType).toBeNull();
    });

    it("should route to upstream with matching allowedModels", async () => {
      // Mock upstreams with provider_type field (new routing method)
      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
        // First call - provider_type query
        {
          id: "upstream-1",
          name: "openai-1",
          providerType: "openai",
          allowedModels: ["gpt-4"],
          modelRedirects: null,
          weight: 1,
          isActive: true,
        },
        {
          id: "upstream-2",
          name: "openai-2",
          providerType: "openai",
          allowedModels: ["gpt-3.5"],
          modelRedirects: null,
          weight: 1,
          isActive: true,
        },
      ] as unknown as Awaited<ReturnType<typeof db.query.upstreams.findMany>>);

      const result = await routeByModel("gpt-4");

      expect(result.upstream).not.toBeNull();
      expect(result.upstream?.id).toBe("upstream-1");
      expect(result.providerType).toBe("openai");
      expect(result.routingDecision.routingType).toBe("provider_type");
      expect(result.candidateUpstreams.length).toBeGreaterThan(0);
      expect(result.routingDecision.circuitBreakerFilter).toBe(false);
    });

    it("should apply model redirects", async () => {
      // Mock upstreams with provider_type field and model redirects
      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
        // First call - provider_type query
        {
          id: "upstream-1",
          name: "openai-1",
          providerType: "openai",
          allowedModels: null,
          modelRedirects: { "gpt-4-turbo": "gpt-4" },
          weight: 1,
          isActive: true,
        },
      ] as unknown as Awaited<ReturnType<typeof db.query.upstreams.findMany>>);

      const result = await routeByModel("gpt-4-turbo");

      expect(result.resolvedModel).toBe("gpt-4");
      expect(result.routingDecision.modelRedirectApplied).toBe(true);
    });

    it("should include routing decision details", async () => {
      // Mock upstreams with provider_type field
      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
        // First call - provider_type query
        {
          id: "upstream-1",
          name: "anthropic-1",
          providerType: "anthropic",
          allowedModels: ["claude-3-opus"],
          modelRedirects: null,
          weight: 1,
          isActive: true,
        },
      ] as unknown as Awaited<ReturnType<typeof db.query.upstreams.findMany>>);

      const result = await routeByModel("claude-3-opus");

      expect(result.routingDecision.originalModel).toBe("claude-3-opus");
      expect(result.routingDecision.resolvedModel).toBe("claude-3-opus");
      expect(result.routingDecision.providerType).toBe("anthropic");
      expect(result.routingDecision.routingType).toBe("provider_type");
      expect(result.routingDecision.upstreamName).toBe("anthropic-1");
      expect(result.routingDecision.allowedModelsFilter).toBe(true);
      expect(result.routingDecision.modelRedirectApplied).toBe(false);
      expect(result.routingDecision.circuitBreakerFilter).toBe(false);
      expect(result.routingDecision.candidateCount).toBe(1);
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

  describe("NoHealthyUpstreamError", () => {
    it("should have correct name", () => {
      const error = new NoHealthyUpstreamError("gpt-4", "openai");
      expect(error.name).toBe("NoHealthyUpstreamError");
    });

    it("should have correct message", () => {
      const error = new NoHealthyUpstreamError("gpt-4", "openai");
      expect(error.message).toBe("No healthy upstreams available for model: gpt-4");
    });

    it("should store model and providerType", () => {
      const error = new NoHealthyUpstreamError("gpt-4", "openai");
      expect(error.model).toBe("gpt-4");
      expect(error.providerType).toBe("openai");
    });

    it("should be instanceof Error", () => {
      const error = new NoHealthyUpstreamError("test", null);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("filterUpstreamsByCircuitBreaker", () => {
    it("should filter out OPEN circuit upstreams", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-02-09T00:00:00.000Z"));

      const upstreams: PartialUpstream[] = [
        { id: "1", name: "upstream-1" },
        { id: "2", name: "upstream-2" },
        { id: "3", name: "upstream-3" },
      ];

      // Mock circuit breaker states: first two closed, third open
      vi.mocked(db.query.circuitBreakerStates.findFirst)
        .mockResolvedValueOnce(null) // closed (no record = closed)
        .mockResolvedValueOnce(null) // closed (no record = closed)
        .mockResolvedValueOnce({
          id: "cb-3",
          upstreamId: "3",
          state: "open",
          failureCount: 5,
          openedAt: new Date("2026-02-08T23:59:30.000Z"),
          config: { openDuration: 5 * 60_000 },
        } as unknown as Awaited<ReturnType<typeof db.query.circuitBreakerStates.findFirst>>);

      const result = await filterUpstreamsByCircuitBreaker(upstreams as Upstream[]);

      expect(result.allowed).toHaveLength(2);
      expect(result.allowed[0].id).toBe("1");
      expect(result.allowed[1].id).toBe("2");
      expect(result.excluded).toHaveLength(1);
      expect(result.excluded[0].id).toBe("3");
      expect(result.excluded[0].reason).toBe("circuit_open");

      vi.useRealTimers();
    });

    it("should allow all upstreams when no circuit breaker states", async () => {
      const upstreams: PartialUpstream[] = [
        { id: "1", name: "upstream-1" },
        { id: "2", name: "upstream-2" },
      ];

      vi.mocked(db.query.circuitBreakerStates.findFirst).mockResolvedValue(null);

      const result = await filterUpstreamsByCircuitBreaker(upstreams as Upstream[]);

      expect(result.allowed).toHaveLength(2);
      expect(result.excluded).toHaveLength(0);
    });
  });

  describe("getUpstreamsByProviderType", () => {
    it("should return upstreams by provider_type field", async () => {
      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
        // provider_type query returns results
        {
          id: "upstream-1",
          name: "openai-1",
          providerType: "openai",
        },
      ] as unknown as Awaited<ReturnType<typeof db.query.upstreams.findMany>>);

      const result = await getUpstreamsByProviderType("openai");

      expect(result.upstreams).toHaveLength(1);
      expect(result.upstreams[0].id).toBe("upstream-1");
      expect(result.routingType).toBe("provider_type");
    });

    it("should return empty array when no upstreams found", async () => {
      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([]);

      const result = await getUpstreamsByProviderType("openai");

      expect(result.upstreams).toHaveLength(0);
      expect(result.routingType).toBe("provider_type");
    });
  });

  describe("routeByModel with circuit breaker", () => {
    it("should skip OPEN circuit upstreams", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-02-09T00:00:00.000Z"));

      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
        // First call - provider_type query
        {
          id: "upstream-1",
          name: "openai-1",
          providerType: "openai",
          allowedModels: null,
          modelRedirects: null,
          weight: 1,
          isActive: true,
        },
        {
          id: "upstream-2",
          name: "openai-2",
          providerType: "openai",
          allowedModels: null,
          modelRedirects: null,
          weight: 1,
          isActive: true,
        },
      ] as unknown as Awaited<ReturnType<typeof db.query.upstreams.findMany>>);

      // Mock circuit breaker: first upstream OPEN, second closed
      // Called twice: once for filterUpstreamsByCircuitBreaker, once for buildCandidateList
      vi.mocked(db.query.circuitBreakerStates.findFirst)
        .mockResolvedValueOnce({
          id: "cb-1",
          upstreamId: "upstream-1",
          state: "open",
          failureCount: 5,
          openedAt: new Date("2026-02-08T23:59:30.000Z"),
          config: { openDuration: 5 * 60_000 },
        } as unknown as Awaited<ReturnType<typeof db.query.circuitBreakerStates.findFirst>>)
        .mockResolvedValueOnce(null) // second upstream closed (filter)
        .mockResolvedValueOnce({
          id: "cb-1",
          upstreamId: "upstream-1",
          state: "open",
          failureCount: 5,
          openedAt: new Date("2026-02-08T23:59:30.000Z"),
          config: { openDuration: 5 * 60_000 },
        } as unknown as Awaited<ReturnType<typeof db.query.circuitBreakerStates.findFirst>>)
        .mockResolvedValueOnce(null); // second upstream closed (candidate list)

      const result = await routeByModel("gpt-4");

      expect(result.upstream).not.toBeNull();
      expect(result.upstream?.id).toBe("upstream-2");
      expect(result.excludedUpstreams).toHaveLength(1);
      expect(result.excludedUpstreams[0].reason).toBe("circuit_open");
      expect(result.routingDecision.circuitBreakerFilter).toBe(true);

      vi.useRealTimers();
    });

    it("should throw NoHealthyUpstreamError when all upstreams are OPEN", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-02-09T00:00:00.000Z"));

      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
        // First call - provider_type query
        {
          id: "upstream-1",
          name: "openai-1",
          providerType: "openai",
          allowedModels: null,
          modelRedirects: null,
          weight: 1,
          isActive: true,
        },
      ] as unknown as Awaited<ReturnType<typeof db.query.upstreams.findMany>>);

      // Mock circuit breaker: upstream OPEN
      vi.mocked(db.query.circuitBreakerStates.findFirst).mockResolvedValue({
        id: "cb-1",
        upstreamId: "upstream-1",
        state: "open",
        failureCount: 5,
        openedAt: new Date("2026-02-08T23:59:30.000Z"),
        config: { openDuration: 5 * 60_000 },
      } as unknown as Awaited<ReturnType<typeof db.query.circuitBreakerStates.findFirst>>);

      await expect(routeByModel("gpt-4")).rejects.toThrow(NoHealthyUpstreamError);

      vi.useRealTimers();
    });

    it("should allow OPEN circuit upstream when openDuration has elapsed (eligible to probe)", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-02-09T00:10:00.000Z"));

      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
        {
          id: "upstream-1",
          name: "openai-1",
          providerType: "openai",
          allowedModels: null,
          modelRedirects: null,
          weight: 1,
          isActive: true,
        },
      ] as unknown as Awaited<ReturnType<typeof db.query.upstreams.findMany>>);

      // OPEN since 00:00:00, openDuration=5min -> eligible at 00:10:00
      vi.mocked(db.query.circuitBreakerStates.findFirst).mockResolvedValue({
        id: "cb-1",
        upstreamId: "upstream-1",
        state: "open",
        failureCount: 5,
        openedAt: new Date("2026-02-09T00:00:00.000Z"),
        config: { openDuration: 5 * 60_000 },
      } as unknown as Awaited<ReturnType<typeof db.query.circuitBreakerStates.findFirst>>);

      const result = await routeByModel("gpt-4");

      expect(result.upstream?.id).toBe("upstream-1");
      expect(result.excludedUpstreams).toHaveLength(0);

      vi.useRealTimers();
    });

    it("should return candidate upstreams with circuit state", async () => {
      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
        // First call - provider_type query
        {
          id: "upstream-1",
          name: "openai-1",
          providerType: "openai",
          allowedModels: null,
          modelRedirects: null,
          weight: 1,
          isActive: true,
        },
      ] as unknown as Awaited<ReturnType<typeof db.query.upstreams.findMany>>);

      vi.mocked(db.query.circuitBreakerStates.findFirst).mockResolvedValue(null);

      const result = await routeByModel("gpt-4");

      expect(result.candidateUpstreams).toHaveLength(1);
      expect(result.candidateUpstreams[0].id).toBe("upstream-1");
      expect(result.candidateUpstreams[0].circuitState).toBe("closed");
    });

    it("should log excluded upstreams with model_not_allowed reason", async () => {
      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
        // First call - provider_type query
        {
          id: "upstream-1",
          name: "openai-1",
          providerType: "openai",
          allowedModels: ["gpt-4"],
          modelRedirects: null,
          weight: 1,
          isActive: true,
        },
        {
          id: "upstream-2",
          name: "openai-2",
          providerType: "openai",
          allowedModels: ["gpt-3.5"], // does not support gpt-4
          modelRedirects: null,
          weight: 1,
          isActive: true,
        },
      ] as unknown as Awaited<ReturnType<typeof db.query.upstreams.findMany>>);

      vi.mocked(db.query.circuitBreakerStates.findFirst).mockResolvedValue(null);

      const result = await routeByModel("gpt-4");

      expect(result.upstream?.id).toBe("upstream-1");
      expect(result.excludedUpstreams).toHaveLength(1);
      expect(result.excludedUpstreams[0].id).toBe("upstream-2");
      expect(result.excludedUpstreams[0].reason).toBe("model_not_allowed");
    });
  });
});
