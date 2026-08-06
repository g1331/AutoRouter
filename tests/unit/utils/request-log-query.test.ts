import { describe, expect, it } from "vitest";

import {
  createRequestLogQuery,
  parseRequestLogFilterUrl,
  parseRequestLogListQuery,
  resolveTimeRangeStart,
} from "@/lib/utils/request-log-query";

const READ_AT = new Date("2026-08-06T12:00:00.000Z");

function params(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

describe("request log query module", () => {
  it("normalizes status precedence, complete custom time, and performance presets", () => {
    const filter = createRequestLogQuery({
      statusCode: "429",
      statusClass: "5xx",
      timeRange: "7d",
      customRange: {
        startIso: "2026-08-01T00:00:00.000Z",
        endIso: "2026-08-05T00:00:00.000Z",
      },
      performancePreset: "high_ttft",
    });

    expect(filter.filter.statusCode).toBe(429);
    expect(filter.filter.statusClass).toBeUndefined();
    expect(filter.filter.time).toEqual({
      kind: "custom",
      startIso: "2026-08-01T00:00:00.000Z",
      endIso: "2026-08-05T00:00:00.000Z",
    });
    expect(filter.filter.performance).toEqual({ ttftMinMs: 5000 });
  });

  it("serializes the admin list projection with pagination and sort", () => {
    const filter = createRequestLogQuery({
      apiKeyId: "key-1",
      userId: "user-1",
      upstreamId: "up-1",
      statusClass: "5xx",
      model: "gpt",
      timeRange: "custom",
      customRange: {
        startIso: "2026-08-01T00:00:00.000Z",
        endIso: "2026-08-05T00:00:00.000Z",
      },
      performance: { tpsMax: 30 },
    });

    const projection = filter.list({
      scope: "admin",
      page: 2,
      pageSize: 50,
      sort: { field: "cost", order: "asc" },
      readAt: READ_AT,
    });
    const query = params(projection.search);

    expect(query.get("page")).toBe("2");
    expect(query.get("page_size")).toBe("50");
    expect(query.get("api_key_id")).toBe("key-1");
    expect(query.get("user_id")).toBe("user-1");
    expect(query.get("upstream_id")).toBe("up-1");
    expect(query.get("status_class")).toBe("5xx");
    expect(query.get("model")).toBe("gpt");
    expect(query.get("start_time")).toBe("2026-08-01T00:00:00.000Z");
    expect(query.get("end_time")).toBe("2026-08-05T00:00:00.000Z");
    expect(query.get("tps_max")).toBe("30");
    expect(query.get("sort")).toBe("cost");
    expect(query.get("order")).toBe("asc");
    const parsed = parseRequestLogListQuery(
      new URL(`https://example.test/logs?${projection.search}`),
      "admin"
    );
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    expect(parsed.filters).toEqual({
      apiKeyId: "key-1",
      userId: "user-1",
      upstreamId: "up-1",
      statusClass: "5xx",
      model: "gpt",
      startTime: new Date("2026-08-01T00:00:00.000Z"),
      endTime: new Date("2026-08-05T00:00:00.000Z"),
      tpsMax: 30,
    });
    expect(parsed.sort).toEqual({ field: "cost", order: "asc" });
  });

  it("projects member scope without client-controlled owner fields", () => {
    const filter = createRequestLogQuery({
      id: "log-1",
      userId: "user-1",
      upstreamId: "up-1",
      apiKeyId: "key-1",
      timeRange: "all",
    });

    const list = params(
      filter.list({
        scope: "user",
        page: 1,
        pageSize: 20,
        readAt: READ_AT,
      }).search
    );
    const stats = params(filter.stats({ scope: "user", readAt: READ_AT }).search);

    expect(list.get("id")).toBe("log-1");
    expect(list.get("api_key_id")).toBe("key-1");
    expect(list.get("user_id")).toBeNull();
    expect(list.get("upstream_id")).toBeNull();
    expect(stats.get("id")).toBeNull();
    expect(stats.get("page")).toBeNull();
    expect(stats.get("sort")).toBeNull();
  });

  it("keeps preset identity stable while resolving a fresh runtime boundary", () => {
    const filter = createRequestLogQuery({ timeRange: "7d" });
    const first = filter.list({ scope: "admin", readAt: READ_AT });
    const laterAt = new Date("2026-08-07T12:00:00.000Z");
    const later = filter.list({ scope: "admin", readAt: laterAt });

    expect(params(first.search).get("start_time")).toBe(
      resolveTimeRangeStart("7d", READ_AT).toISOString()
    );
    expect(params(later.search).get("start_time")).toBe(
      resolveTimeRangeStart("7d", laterAt).toISOString()
    );
    expect(first.identity).toBe(later.identity);
  });

  it("canonicalizes URLs by omitting defaults and preserving explicit all", () => {
    const defaultUrl = createRequestLogQuery({
      apiKeyId: "key-1",
      timeRange: "30d",
    }).url({
      scope: "admin",
      sort: { field: "created_at", order: "desc" },
    }).search;
    const allUrl = createRequestLogQuery({ timeRange: "all" }).url({ scope: "admin" }).search;

    expect(defaultUrl).toBe("?api_key_id=key-1");
    expect(allUrl).toBe("?time_range=all");
  });

  it("recovers invalid external time and conditions without widening to all", () => {
    const parsed = parseRequestLogFilterUrl(
      new URL(
        "https://example.test/logs?status_class=bad&start_time=bad&end_time=2026-08-05T00%3A00%3A00.000Z&sort=bad"
      ),
      "admin"
    );

    expect(parsed.query.filter.time).toEqual({ kind: "preset", value: "30d" });
    expect(parsed.query.filter.statusClass).toBeUndefined();
    expect(parsed.sort).toBeUndefined();
    expect(parsed.canonical.search).toBe("");
  });
});
