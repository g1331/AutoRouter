import { describe, expect, it } from "vitest";
import {
  deriveAllowedModelsFromRules,
  deriveModelRedirectsFromRules,
  importCatalogEntriesToModelRules,
  matchUpstreamModelRules,
  normalizeUpstreamModelRules,
  validateUpstreamModelRules,
} from "@/lib/services/upstream-model-rules";

describe("upstream-model-rules", () => {
  describe("normalizeUpstreamModelRules", () => {
    it("should normalize legacy allowed_models and model_redirects into unified rules", () => {
      const rules = normalizeUpstreamModelRules({
        allowedModels: ["gpt-4.1", "gpt-4.1-mini"],
        modelRedirects: {
          "gpt-4.1-preview": "gpt-4.1",
        },
      });

      expect(rules).toEqual([
        {
          type: "exact",
          value: "gpt-4.1",
          targetModel: null,
          source: "manual",
          displayLabel: "精确匹配",
        },
        {
          type: "exact",
          value: "gpt-4.1-mini",
          targetModel: null,
          source: "manual",
          displayLabel: "精确匹配",
        },
        {
          type: "alias",
          value: "gpt-4.1-preview",
          targetModel: "gpt-4.1",
          source: "manual",
          displayLabel: "模型别名",
        },
      ]);
    });

    it("should keep regex rules and normalize display labels", () => {
      const rules = normalizeUpstreamModelRules({
        modelRules: [
          {
            type: "regex",
            value: "^claude-3.*$",
            targetModel: null,
            source: "native",
            displayLabel: null,
          },
        ],
      });

      expect(rules).toEqual([
        {
          type: "regex",
          value: "^claude-3.*$",
          targetModel: null,
          source: "native",
          displayLabel: "模式匹配",
        },
      ]);
    });
  });

  describe("deriveAllowedModelsFromRules", () => {
    it("should only expose exact rules through legacy allowed_models", () => {
      const allowedModels = deriveAllowedModelsFromRules([
        {
          type: "exact",
          value: "gpt-4.1",
          targetModel: null,
          source: "manual",
          displayLabel: "精确匹配",
        },
        {
          type: "regex",
          value: "^gpt-4.*$",
          targetModel: null,
          source: "manual",
          displayLabel: "模式匹配",
        },
      ]);

      expect(allowedModels).toEqual(["gpt-4.1"]);
    });
  });

  describe("deriveModelRedirectsFromRules", () => {
    it("should only expose alias rules through legacy model_redirects", () => {
      const redirects = deriveModelRedirectsFromRules([
        {
          type: "alias",
          value: "gpt-4.1-preview",
          targetModel: "gpt-4.1",
          source: "manual",
          displayLabel: "模型别名",
        },
      ]);

      expect(redirects).toEqual({
        "gpt-4.1-preview": "gpt-4.1",
      });
    });
  });

  describe("matchUpstreamModelRules", () => {
    it("should keep upstream open when no explicit rules exist", () => {
      const result = matchUpstreamModelRules("gpt-4.1", null);

      expect(result).toEqual({
        hasExplicitRules: false,
        matched: true,
        resolvedModel: "gpt-4.1",
        redirectApplied: false,
        matchedRule: null,
      });
    });

    it("should match exact rules without rewriting the model", () => {
      const result = matchUpstreamModelRules("gpt-4.1", [
        {
          type: "exact",
          value: "gpt-4.1",
          targetModel: null,
          source: "manual",
          displayLabel: "精确匹配",
        },
      ]);

      expect(result.matched).toBe(true);
      expect(result.redirectApplied).toBe(false);
      expect(result.resolvedModel).toBe("gpt-4.1");
    });

    it("should match regex rules without rewriting the model", () => {
      const result = matchUpstreamModelRules("claude-3-7-sonnet", [
        {
          type: "regex",
          value: "^claude-3",
          targetModel: null,
          source: "manual",
          displayLabel: "模式匹配",
        },
      ]);

      expect(result.matched).toBe(true);
      expect(result.redirectApplied).toBe(false);
      expect(result.resolvedModel).toBe("claude-3-7-sonnet");
    });

    it("should resolve alias rules to the target model", () => {
      const result = matchUpstreamModelRules("gemini-2.5-flash-lite", [
        {
          type: "alias",
          value: "gemini-2.5-flash-lite",
          targetModel: "gemini-2.5-flash",
          source: "manual",
          displayLabel: "模型别名",
        },
      ]);

      expect(result.matched).toBe(true);
      expect(result.redirectApplied).toBe(true);
      expect(result.resolvedModel).toBe("gemini-2.5-flash");
    });

    it("should reject candidates when explicit rules exist but none match", () => {
      const result = matchUpstreamModelRules("gpt-4.1", [
        {
          type: "exact",
          value: "claude-3-7-sonnet",
          targetModel: null,
          source: "manual",
          displayLabel: "精确匹配",
        },
      ]);

      expect(result.hasExplicitRules).toBe(true);
      expect(result.matched).toBe(false);
      expect(result.redirectApplied).toBe(false);
    });
  });

  describe("validateUpstreamModelRules", () => {
    it("should report invalid regex and circular aliases", () => {
      const errors = validateUpstreamModelRules([
        {
          type: "regex",
          value: "[unterminated",
          targetModel: null,
          source: "manual",
          displayLabel: "模式匹配",
        },
        {
          type: "alias",
          value: "a",
          targetModel: "b",
          source: "manual",
          displayLabel: "模型别名",
        },
        {
          type: "alias",
          value: "b",
          targetModel: "a",
          source: "manual",
          displayLabel: "模型别名",
        },
      ]);

      expect(errors).toContain("Invalid regex rule: [unterminated");
      expect(errors.some((message) => message.includes("Circular alias rule detected"))).toBe(true);
    });
  });

  describe("importCatalogEntriesToModelRules", () => {
    it("should import selected catalog models as exact rules and keep existing alias rules", () => {
      const rules = importCatalogEntriesToModelRules({
        catalog: [
          { model: "gpt-4.1", source: "native" },
          { model: "gpt-4.1-mini", source: "inferred" },
        ],
        selectedModels: ["gpt-4.1-mini"],
        existingRules: [
          {
            type: "alias",
            value: "gpt-4.1-preview",
            targetModel: "gpt-4.1",
            source: "manual",
            displayLabel: "模型别名",
          },
        ],
      });

      expect(rules).toContainEqual({
        type: "alias",
        value: "gpt-4.1-preview",
        targetModel: "gpt-4.1",
        source: "manual",
        displayLabel: "模型别名",
      });
      expect(rules).toContainEqual({
        type: "exact",
        value: "gpt-4.1-mini",
        targetModel: null,
        source: "inferred",
        displayLabel: "精确匹配",
      });
    });

    it("should reject models that are not present in the cached catalog", () => {
      expect(() =>
        importCatalogEntriesToModelRules({
          catalog: [{ model: "gpt-4.1", source: "native" }],
          selectedModels: ["claude-3-7-sonnet"],
        })
      ).toThrow("Model is not present in the cached catalog");
    });
  });
});
