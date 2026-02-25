import { describe, expect, it } from "vitest";
import {
  getPrimaryProviderByCapabilities,
  normalizeRouteCapabilities,
  resolveRouteCapabilities,
  areSingleProviderCapabilities,
} from "@/lib/route-capabilities";

describe("route-capabilities", () => {
  it("normalizes capabilities by trimming, filtering empty values, removing invalid values and deduplicating", () => {
    const result = normalizeRouteCapabilities([
      " openai_chat_compatible ",
      "",
      "invalid_capability",
      "openai_chat_compatible",
      "openai_extended",
    ]);

    expect(result).toEqual(["openai_chat_compatible", "openai_extended"]);
  });

  it("returns null primary provider when normalized capabilities are empty", () => {
    expect(getPrimaryProviderByCapabilities(["", "invalid"])).toBeNull();
  });

  it("derives primary provider from the first normalized capability", () => {
    expect(
      getPrimaryProviderByCapabilities(
        resolveRouteCapabilities(["openai_extended", "anthropic_messages"])
      )
    ).toBe("anthropic");
  });

  describe("areSingleProviderCapabilities", () => {
    it("returns true for empty array", () => {
      expect(areSingleProviderCapabilities([])).toBe(true);
    });

    it("returns true for single capability", () => {
      expect(areSingleProviderCapabilities(["anthropic_messages"])).toBe(true);
    });

    it("returns true for multiple capabilities from the same provider", () => {
      expect(
        areSingleProviderCapabilities([
          "openai_chat_compatible",
          "openai_extended",
          "codex_responses",
        ])
      ).toBe(true);
    });

    it("returns false for capabilities from different providers", () => {
      expect(areSingleProviderCapabilities(["anthropic_messages", "openai_chat_compatible"])).toBe(
        false
      );
    });

    it("returns false for mixed google and openai capabilities", () => {
      expect(areSingleProviderCapabilities(["gemini_native_generate", "openai_extended"])).toBe(
        false
      );
    });
  });
});
