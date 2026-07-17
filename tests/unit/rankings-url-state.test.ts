import { describe, expect, it } from "vitest";
import {
  buildQuery,
  filterRankingsItems,
  hasActiveFilters,
  readStateFromUrl,
  DEFAULT_RANKINGS_STATE,
  type RankingsViewState,
} from "@/components/rankings/rankings-url-state";
import type {
  LeaderboardModelItem,
  LeaderboardUpstreamItem,
  LeaderboardUserItem,
  RankingsItem,
} from "@/types/api";

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
      ...DEFAULT_RANKINGS_STATE,
      dimension: "models",
      range: "30d",
      sortBy: "error_rate",
      order: "asc",
    };
    const restored = readStateFromUrl(new URLSearchParams(buildQuery(state)));
    expect(restored).toMatchObject(state);
  });

  it("round-trips filter state (q/min/errors/upstream) through the query string", () => {
    const state: RankingsViewState = {
      ...DEFAULT_RANKINGS_STATE,
      dimension: "models",
      query: "gpt",
      minRequests: 100,
      errorsOnly: true,
      upstream: "openai-primary",
    };
    const query = buildQuery(state);
    expect(query).toContain("q=gpt");
    expect(query).toContain("min=100");
    expect(query).toContain("errors=1");
    const restored = readStateFromUrl(new URLSearchParams(query));
    expect(restored).toMatchObject({
      query: "gpt",
      minRequests: 100,
      errorsOnly: true,
      upstream: "openai-primary",
    });
  });

  it("ignores invalid min values", () => {
    expect(readStateFromUrl(new URLSearchParams("min=-5")).minRequests).toBe(0);
    expect(readStateFromUrl(new URLSearchParams("min=abc")).minRequests).toBe(0);
    expect(readStateFromUrl(new URLSearchParams("errors=yes")).errorsOnly).toBe(false);
  });

  it("round-trips a custom range with start/end params", () => {
    const state: RankingsViewState = {
      ...DEFAULT_RANKINGS_STATE,
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

function upstreamItem(overrides: Partial<LeaderboardUpstreamItem>): LeaderboardUpstreamItem {
  return {
    id: "up-1",
    name: "OpenAI Primary",
    provider_type: "openai",
    request_count: 100,
    total_tokens: 1000,
    total_cost_usd: 1,
    avg_ttft_ms: 500,
    avg_tps: 40,
    cache_hit_rate: 0,
    error_rate: 0,
    model_distribution: [],
    ...overrides,
  };
}

function modelItem(overrides: Partial<LeaderboardModelItem>): LeaderboardModelItem {
  return {
    model: "gpt-4.1",
    request_count: 100,
    total_tokens: 1000,
    total_cost_usd: 1,
    avg_ttft_ms: 500,
    avg_tps: 40,
    cache_hit_rate: 0,
    error_rate: 0,
    upstream_distribution: [],
    ...overrides,
  };
}

const NO_FILTERS = {
  query: "",
  minRequests: 0,
  errorsOnly: false,
  upstream: "",
};

describe("filterRankingsItems", () => {
  it("matches the name fields of each dimension case-insensitively", () => {
    const upstreams: RankingsItem[] = [
      upstreamItem({ id: "a", name: "OpenAI Primary" }),
      upstreamItem({ id: "b", name: "Claude Backup", provider_type: "anthropic" }),
    ];
    expect(filterRankingsItems(upstreams, { ...NO_FILTERS, query: "claude" })).toHaveLength(1);
    // provider_type is part of the visible name cell, so it is searchable too.
    expect(filterRankingsItems(upstreams, { ...NO_FILTERS, query: "anthropic" })).toHaveLength(1);

    const models: RankingsItem[] = [modelItem({ model: "gpt-4.1" }), modelItem({ model: "o3" })];
    expect(filterRankingsItems(models, { ...NO_FILTERS, query: "GPT" })).toHaveLength(1);

    const user: LeaderboardUserItem = {
      id: "u1",
      username: "alice",
      display_name: "Alice Zhang",
      request_count: 10,
      total_tokens: 100,
      total_cost_usd: 1,
      avg_ttft_ms: 0,
      avg_tps: 0,
      cache_hit_rate: 0,
      error_rate: 0,
      model_distribution: [],
    };
    expect(filterRankingsItems([user], { ...NO_FILTERS, query: "zhang" })).toHaveLength(1);
    expect(filterRankingsItems([user], { ...NO_FILTERS, query: "bob" })).toHaveLength(0);
  });

  it("applies the min-requests threshold", () => {
    const items = [
      upstreamItem({ id: "a", request_count: 12000 }),
      upstreamItem({ id: "b", request_count: 80 }),
    ];
    const result = filterRankingsItems(items, { ...NO_FILTERS, minRequests: 100 });
    expect(result).toHaveLength(1);
    expect((result[0] as LeaderboardUpstreamItem).id).toBe("a");
  });

  it("keeps only items with errors when errorsOnly is set", () => {
    const items = [
      upstreamItem({ id: "a", error_rate: 0 }),
      upstreamItem({ id: "b", error_rate: 2.5 }),
    ];
    const result = filterRankingsItems(items, { ...NO_FILTERS, errorsOnly: true });
    expect(result).toHaveLength(1);
    expect((result[0] as LeaderboardUpstreamItem).id).toBe("b");
  });

  it("filters models by upstream and ignores the upstream filter for other dimensions", () => {
    const models = [
      modelItem({
        model: "gpt-4.1",
        upstream_distribution: [{ name: "openai-primary", count: 5 }],
      }),
      modelItem({ model: "claude-3", upstream_distribution: [{ name: "anthropic-hk", count: 3 }] }),
    ];
    const filtered = filterRankingsItems(models, { ...NO_FILTERS, upstream: "anthropic-hk" });
    expect(filtered).toHaveLength(1);
    expect((filtered[0] as LeaderboardModelItem).model).toBe("claude-3");

    // A stale upstream param must not blank out dimensions without a distribution.
    const upstreams = [upstreamItem({ id: "a" })];
    expect(
      filterRankingsItems(upstreams, { ...NO_FILTERS, upstream: "anthropic-hk" })
    ).toHaveLength(1);
  });

  it("combines filters with AND semantics", () => {
    const items = [
      upstreamItem({ id: "a", name: "OpenAI", request_count: 500, error_rate: 1 }),
      upstreamItem({ id: "b", name: "OpenAI EU", request_count: 50, error_rate: 1 }),
      upstreamItem({ id: "c", name: "Claude", request_count: 900, error_rate: 0 }),
    ];
    const result = filterRankingsItems(items, {
      ...NO_FILTERS,
      query: "openai",
      minRequests: 100,
      errorsOnly: true,
    });
    expect(result).toHaveLength(1);
    expect((result[0] as LeaderboardUpstreamItem).id).toBe("a");
  });
});

describe("hasActiveFilters", () => {
  it("reflects whether any filter deviates from the defaults", () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...NO_FILTERS, query: "x" })).toBe(true);
    expect(hasActiveFilters({ ...NO_FILTERS, minRequests: 1 })).toBe(true);
    expect(hasActiveFilters({ ...NO_FILTERS, errorsOnly: true })).toBe(true);
    expect(hasActiveFilters({ ...NO_FILTERS, upstream: "u" })).toBe(true);
  });
});
