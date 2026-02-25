import { describe, expect, it } from "vitest";
import {
  getPrimaryProviderByCapabilities,
  normalizeRouteCapabilities,
  resolveRouteCapabilities,
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
});
