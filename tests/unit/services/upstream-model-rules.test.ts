import { describe, expect, it } from "vitest";
import {
  filterCandidateUpstreamsByLegacyModelSupport,
  matchLegacyUpstreamModelConfig,
  matchUpstreamModelRules,
  normalizeLegacyModelRules,
  parseModelDiscoveryConfig,
  parseUpstreamModelRules,
  resolveLegacyModelRedirects,
} from "@/lib/services/upstream-model-rules";

describe("normalizeLegacyModelRules", () => {
  it("should return null when no legacy rules are configured", () => {
    expect(normalizeLegacyModelRules({ allowedModels: null, modelRedirects: null })).toBeNull();
  });

  it("should convert allowedModels and modelRedirects into exact and alias rules", () => {
    expect(
      normalizeLegacyModelRules({
        allowedModels: ["gpt-4o", " gpt-4o ", ""],
        modelRedirects: {
          internal: "gpt-4o",
          " legacy ": " gpt-4.1 ",
          blank: " ",
        },
      })
    ).toEqual([
      {
        type: "exact",
        model: "gpt-4o",
        source: "manual",
      },
      {
        type: "alias",
        alias: "internal",
        targetModel: "gpt-4o",
        source: "manual",
      },
      {
        type: "alias",
        alias: "legacy",
        targetModel: "gpt-4.1",
        source: "manual",
      },
    ]);
  });
});

describe("parseModelDiscoveryConfig", () => {
  it("should return null for empty input", () => {
    expect(parseModelDiscoveryConfig(null)).toBeNull();
  });

  it("should normalize trimmed custom endpoints and fallback defaults", () => {
    expect(
      parseModelDiscoveryConfig({
        mode: "custom",
        customEndpoint: " /v1/models ",
      })
    ).toEqual({
      mode: "custom",
      customEndpoint: "/v1/models",
      enableLiteLlmFallback: false,
    });
  });
});

describe("parseUpstreamModelRules", () => {
  it("should parse exact, regex, and alias rules", () => {
    expect(
      parseUpstreamModelRules([
        { type: "exact", model: "gpt-4o", source: "native" },
        { type: "regex", pattern: "^gpt-4o-mini", source: "manual" },
        { type: "alias", alias: "company-gpt", targetModel: "gpt-4o", source: "manual" },
      ])
    ).toEqual([
      { type: "exact", model: "gpt-4o", source: "native" },
      { type: "regex", pattern: "^gpt-4o-mini", source: "manual" },
      { type: "alias", alias: "company-gpt", targetModel: "gpt-4o", source: "manual" },
    ]);
  });
});

describe("resolveLegacyModelRedirects", () => {
  it("should follow redirect chains", () => {
    expect(
      resolveLegacyModelRedirects("company-gpt", {
        "company-gpt": "gpt-4o",
        "gpt-4o": "gpt-4.1",
      })
    ).toEqual({
      resolvedModel: "gpt-4.1",
      redirectApplied: true,
    });
  });
});

describe("matchLegacyUpstreamModelConfig", () => {
  it("should preserve legacy behavior by redirecting before exact allow checks", () => {
    expect(
      matchLegacyUpstreamModelConfig("company-gpt", {
        allowedModels: ["gpt-4o"],
        modelRedirects: { "company-gpt": "gpt-4o" },
      })
    ).toEqual({
      matches: true,
      restrictiveRulesConfigured: true,
      resolvedModel: "gpt-4o",
      modelRedirectApplied: true,
      matchedRuleType: "alias",
      matchedRuleSource: "manual",
    });
  });

  it("should keep redirect-only upstreams open to all models just like the legacy runtime", () => {
    expect(
      matchLegacyUpstreamModelConfig("unlisted-model", {
        allowedModels: null,
        modelRedirects: { internal: "gpt-4o" },
      })
    ).toEqual({
      matches: true,
      restrictiveRulesConfigured: false,
      resolvedModel: "unlisted-model",
      modelRedirectApplied: false,
      matchedRuleType: null,
      matchedRuleSource: null,
    });
  });

  it("should exclude unmatched models once a legacy allow list exists", () => {
    expect(
      matchLegacyUpstreamModelConfig("claude-3", {
        allowedModels: ["gpt-4o"],
        modelRedirects: null,
      })
    ).toEqual({
      matches: false,
      restrictiveRulesConfigured: true,
      resolvedModel: "claude-3",
      modelRedirectApplied: false,
      matchedRuleType: null,
      matchedRuleSource: null,
    });
  });
});

describe("matchUpstreamModelRules", () => {
  it("should allow alias rules to target manually asserted models", () => {
    expect(
      matchUpstreamModelRules("company-gpt", [
        {
          type: "alias",
          alias: "company-gpt",
          targetModel: "gpt-4.1-enterprise",
          source: "manual",
        },
      ])
    ).toEqual({
      matches: true,
      restrictiveRulesConfigured: true,
      resolvedModel: "gpt-4.1-enterprise",
      modelRedirectApplied: true,
      matchedRuleType: "alias",
      matchedRuleSource: "manual",
    });
  });

  it("should match regex rules when exact and alias rules do not match", () => {
    expect(
      matchUpstreamModelRules("gpt-4o-mini-2025-01", [
        {
          type: "regex",
          pattern: "^gpt-4o-mini",
          source: "manual",
        },
      ])
    ).toEqual({
      matches: true,
      restrictiveRulesConfigured: true,
      resolvedModel: "gpt-4o-mini-2025-01",
      modelRedirectApplied: false,
      matchedRuleType: "regex",
      matchedRuleSource: "manual",
    });
  });
});

describe("filterCandidateUpstreamsByLegacyModelSupport", () => {
  it("should model the future proxy insertion point by filtering candidates after capability matching", () => {
    const result = filterCandidateUpstreamsByLegacyModelSupport(
      [
        {
          id: "up-openai",
          name: "openai-main",
          allowedModels: ["gpt-4o"],
          modelRedirects: null,
        },
        {
          id: "up-anthropic",
          name: "anthropic-main",
          allowedModels: ["claude-3-7-sonnet"],
          modelRedirects: null,
        },
        {
          id: "up-fallback",
          name: "fallback-open",
          allowedModels: null,
          modelRedirects: { internal: "gpt-4o" },
        },
      ],
      "gpt-4o"
    );

    expect(result.allowed.map((candidate) => candidate.id)).toEqual(["up-openai", "up-fallback"]);
    expect(result.excluded).toEqual([
      {
        id: "up-anthropic",
        name: "anthropic-main",
        reason: "model_not_allowed",
      },
    ]);
    expect(result.matchesByUpstreamId["up-openai"]?.matches).toBe(true);
    expect(result.matchesByUpstreamId["up-anthropic"]?.matches).toBe(false);
  });
});
