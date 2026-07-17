import { describe, expect, it } from "vitest";

import { pickUpstreamLocalModels } from "@/lib/api-key-models";

describe("pickUpstreamLocalModels", () => {
  it("prefers the synced model catalog over other sources", () => {
    expect(
      pickUpstreamLocalModels({
        catalogModels: ["gpt-5.5", "gpt-5.2-mini"],
        allowedModels: ["gpt-4.1"],
        exactRuleModels: ["gpt-4o"],
      })
    ).toEqual(["gpt-5.5", "gpt-5.2-mini"]);
  });

  it("falls back to declared allowed models when the catalog is empty", () => {
    expect(
      pickUpstreamLocalModels({
        catalogModels: [],
        allowedModels: ["gpt-4.1", " gpt-4o "],
        exactRuleModels: ["claude-x"],
      })
    ).toEqual(["gpt-4.1", "gpt-4o"]);
  });

  it("falls back to exact rule models when catalog and allowed models are empty", () => {
    expect(
      pickUpstreamLocalModels({
        catalogModels: [],
        allowedModels: [],
        exactRuleModels: ["claude-x"],
      })
    ).toEqual(["claude-x"]);
  });

  it("treats a whitespace-only catalog as empty and falls through", () => {
    expect(
      pickUpstreamLocalModels({
        catalogModels: ["  ", ""],
        allowedModels: ["gpt-4.1"],
        exactRuleModels: [],
      })
    ).toEqual(["gpt-4.1"]);
  });

  it("returns an empty list when no local source has models", () => {
    expect(
      pickUpstreamLocalModels({
        catalogModels: [],
        allowedModels: [],
        exactRuleModels: [],
      })
    ).toEqual([]);
  });
});
