import { describe, expect, it } from "vitest";

import {
  LOOP_SECONDS,
  PHASES,
  PHASE_METRICS,
  nextMetrics,
  phaseAt,
  phaseProgress,
  planRequest,
  upstreamStatus,
  wrapTime,
  type PhaseId,
} from "@/components/landing/live-console/scenario";

describe("landing failover scenario", () => {
  it("covers the whole loop with contiguous phases", () => {
    expect(PHASES[0].start).toBe(0);
    expect(PHASES.at(-1)!.end).toBe(LOOP_SECONDS);
    for (let index = 1; index < PHASES.length; index++) {
      expect(PHASES[index].start).toBe(PHASES[index - 1].end);
    }
  });

  it("maps time to phases, wrapping around the loop", () => {
    expect(phaseAt(0).id).toBe("steady");
    expect(phaseAt(4).id).toBe("errors");
    expect(phaseAt(8).id).toBe("tripped");
    expect(phaseAt(12).id).toBe("probing");
    expect(phaseAt(15.9).id).toBe("recovered");
    expect(phaseAt(LOOP_SECONDS + 1).id).toBe("steady");
    expect(wrapTime(-1)).toBe(LOOP_SECONDS - 1);
    expect(phaseProgress(2)).toBeCloseTo(0.5);
  });

  it("walks the failing upstream through errors, open, half-open and back", () => {
    const sequence = PHASES.map(({ id }) => upstreamStatus(id, "anthropic"));
    expect(sequence).toEqual(["serving", "failing", "open", "half", "serving"]);
    const standby = PHASES.map(({ id }) => upstreamStatus(id, "azure"));
    expect(standby).toEqual(["standby", "standby", "serving", "serving", "standby"]);
    expect(PHASES.every(({ id }) => upstreamStatus(id, "openai") === "serving")).toBe(true);
  });

  it("routes requests according to the phase", () => {
    const targets = (phase: PhaseId) =>
      new Set(Array.from({ length: 50 }, (_, i) => planRequest(phase, i / 50).target));

    expect(targets("steady")).toEqual(new Set(["openai", "anthropic"]));
    expect(targets("tripped")).toEqual(new Set(["openai", "azure"]));
    expect(planRequest("errors", 0.8)).toEqual({
      target: "anthropic",
      kind: "fail",
      retryTo: "openai",
    });
    expect(planRequest("probing", 0.99)).toEqual({ target: "anthropic", kind: "probe" });
  });

  it("moves metrics toward the phase target", () => {
    let metrics = PHASE_METRICS.steady;
    for (let tick = 0; tick < 30; tick++) metrics = nextMetrics(metrics, "errors", tick);
    expect(metrics.success).toBeCloseTo(PHASE_METRICS.errors.success, 1);
    expect(Math.abs(metrics.latency - PHASE_METRICS.errors.latency)).toBeLessThan(15);
    expect(nextMetrics(metrics, "tripped", 0).breakers).toBe(1);
  });
});
