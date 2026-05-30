import { beforeEach, describe, expect, it } from "vitest";

import {
  getPulseWindowSnapshot,
  recordPulseSample,
  resetPulseWindow,
} from "@/lib/services/live-pulse-aggregator";

const BASE = 1_000_000_000_000; // fixed epoch ms base for deterministic buckets

describe("live-pulse-aggregator", () => {
  beforeEach(() => {
    resetPulseWindow();
  });

  it("returns a zero-valued snapshot when there are no samples", () => {
    const snapshot = getPulseWindowSnapshot(BASE);

    expect(snapshot).toEqual({
      requestsPerMinute: 0,
      errorRatePct: 0,
      avgLatencyMs: 0,
      tokensPerMinute: 0,
      sampleCount: 0,
      windowSeconds: 60,
    });
  });

  it("aggregates request count, tokens and latency within the window", () => {
    recordPulseSample({ statusCode: 200, durationMs: 100, totalTokens: 10, occurredAt: BASE });
    recordPulseSample({
      statusCode: 200,
      durationMs: 300,
      totalTokens: 20,
      occurredAt: BASE + 5_000,
    });
    recordPulseSample({
      statusCode: 201,
      durationMs: 200,
      totalTokens: 30,
      occurredAt: BASE + 10_000,
    });

    const snapshot = getPulseWindowSnapshot(BASE + 10_000);

    expect(snapshot.requestsPerMinute).toBe(3);
    expect(snapshot.sampleCount).toBe(3);
    expect(snapshot.tokensPerMinute).toBe(60);
    // (100 + 300 + 200) / 3 = 200
    expect(snapshot.avgLatencyMs).toBe(200);
    expect(snapshot.errorRatePct).toBe(0);
  });

  it("drops samples that fall outside the 60 second window", () => {
    // Sample at BASE is 61s before the read time, so it must be excluded.
    recordPulseSample({ statusCode: 200, durationMs: 100, totalTokens: 10, occurredAt: BASE });
    recordPulseSample({
      statusCode: 200,
      durationMs: 150,
      totalTokens: 5,
      occurredAt: BASE + 61_000,
    });

    const snapshot = getPulseWindowSnapshot(BASE + 61_000);

    expect(snapshot.requestsPerMinute).toBe(1);
    expect(snapshot.tokensPerMinute).toBe(5);
    expect(snapshot.avgLatencyMs).toBe(150);
  });

  it("computes error rate from non-2xx requests only", () => {
    recordPulseSample({ statusCode: 200, durationMs: 100, totalTokens: 10, occurredAt: BASE });
    recordPulseSample({
      statusCode: 500,
      durationMs: 50,
      totalTokens: 0,
      occurredAt: BASE + 1_000,
    });
    recordPulseSample({
      statusCode: 429,
      durationMs: 40,
      totalTokens: 0,
      occurredAt: BASE + 2_000,
    });
    recordPulseSample({
      statusCode: null,
      durationMs: null,
      totalTokens: 0,
      occurredAt: BASE + 3_000,
    });

    const snapshot = getPulseWindowSnapshot(BASE + 3_000);

    expect(snapshot.requestsPerMinute).toBe(4);
    // 3 of 4 are non-2xx => 75%
    expect(snapshot.errorRatePct).toBe(75);
  });

  it("averages latency over successful requests only", () => {
    recordPulseSample({ statusCode: 200, durationMs: 100, totalTokens: 10, occurredAt: BASE });
    recordPulseSample({
      statusCode: 200,
      durationMs: 300,
      totalTokens: 10,
      occurredAt: BASE + 1_000,
    });
    // Failed request with a long duration must not affect the success average.
    recordPulseSample({
      statusCode: 503,
      durationMs: 9_000,
      totalTokens: 0,
      occurredAt: BASE + 2_000,
    });

    const snapshot = getPulseWindowSnapshot(BASE + 2_000);

    // (100 + 300) / 2 = 200, failed 9000ms excluded
    expect(snapshot.avgLatencyMs).toBe(200);
  });
});
