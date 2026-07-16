import { describe, expect, it } from "vitest";
import {
  buildQuery,
  readStateFromUrl,
  type RankingsViewState,
} from "@/components/rankings/rankings-url-state";

describe("rankings URL view state", () => {
  it("returns defaults for an empty query", () => {
    const state = readStateFromUrl(new URLSearchParams());
    expect(state).toMatchObject({
      dimension: "upstreams",
      range: "7d",
      sortBy: "requests",
      order: "desc",
    });
  });

  it("round-trips a non-default state through the query string", () => {
    const state: RankingsViewState = {
      dimension: "models",
      range: "30d",
      sortBy: "error_rate",
      order: "asc",
    };
    const restored = readStateFromUrl(new URLSearchParams(buildQuery(state)));
    expect(restored).toMatchObject(state);
  });

  it("round-trips a custom range with start/end params", () => {
    const state: RankingsViewState = {
      dimension: "api_keys",
      range: "custom",
      sortBy: "cost",
      order: "desc",
      customRange: {
        start: new Date("2024-06-01T00:00:00.000Z"),
        end: new Date("2024-06-08T00:00:00.000Z"),
      },
    };
    const restored = readStateFromUrl(new URLSearchParams(buildQuery(state)));
    expect(restored.range).toBe("custom");
    expect(restored.customRange?.start.toISOString()).toBe("2024-06-01T00:00:00.000Z");
    expect(restored.customRange?.end.toISOString()).toBe("2024-06-08T00:00:00.000Z");
  });

  it("falls back to defaults for invalid or incomplete params", () => {
    expect(readStateFromUrl(new URLSearchParams("dim=bogus&sort=bogus&order=bogus"))).toMatchObject(
      {
        dimension: "upstreams",
        sortBy: "requests",
        order: "desc",
      }
    );
    // custom without a valid window falls back to the default range
    expect(readStateFromUrl(new URLSearchParams("range=custom")).range).toBe("7d");
    expect(
      readStateFromUrl(
        new URLSearchParams("range=custom&start=2024-06-08T00:00:00Z&end=2024-06-01T00:00:00Z")
      ).range
    ).toBe("7d");
  });

  it("omits default values from the query string", () => {
    expect(buildQuery(readStateFromUrl(new URLSearchParams()))).toBe("");
  });
});
