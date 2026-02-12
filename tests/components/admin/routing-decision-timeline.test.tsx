import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RoutingDecisionTimeline } from "@/components/admin/routing-decision-timeline";
import type { RoutingDecisionLog } from "@/types/api";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("RoutingDecisionTimeline", () => {
  const baseRoutingDecision: RoutingDecisionLog = {
    original_model: "gpt-5.3-codex",
    resolved_model: "gpt-5.3-codex",
    model_redirect_applied: false,
    provider_type: "openai",
    routing_type: "provider_type",
    candidates: [
      { id: "up-1", name: "openai-1", weight: 1, circuit_state: "closed" },
      { id: "up-2", name: "openai-2", weight: 2, circuit_state: "closed" },
    ],
    excluded: [],
    candidate_count: 2,
    final_candidate_count: 1,
    selected_upstream_id: "up-2",
    selection_strategy: "weighted",
  };

  it("shows no-upstream-sent instead of numeric upstream latency when did_send_upstream is false", () => {
    render(
      <RoutingDecisionTimeline
        routingDecision={{
          ...baseRoutingDecision,
          did_send_upstream: false,
          candidate_upstream_id: null,
          actual_upstream_id: null,
          failure_stage: "candidate_selection",
        }}
        upstreamName="rc"
        routingType="provider_type"
        groupName={null}
        failoverAttempts={0}
        routingDurationMs={120}
        durationMs={300}
        statusCode={503}
        compact={false}
      />
    );

    const latencyLabel = screen.getByText(/timelineUpstreamLatency/);
    const latencyRow = latencyLabel.closest("div");
    const gatewayLabel = screen.getByText(/timelineGatewayProcessing/);
    const gatewayRow = gatewayLabel.closest("div");

    expect(latencyRow).toHaveTextContent("timelineNoUpstreamSent");
    expect(gatewayRow).toHaveTextContent("180ms");
  });

  it("shows numeric upstream latency when did_send_upstream is true", () => {
    render(
      <RoutingDecisionTimeline
        routingDecision={{
          ...baseRoutingDecision,
          did_send_upstream: true,
          candidate_upstream_id: "up-2",
          actual_upstream_id: "up-2",
          failure_stage: null,
        }}
        upstreamName="rc"
        routingType="provider_type"
        groupName={null}
        failoverAttempts={0}
        routingDurationMs={120}
        durationMs={300}
        statusCode={200}
        compact={false}
      />
    );

    const latencyLabel = screen.getByText(/timelineUpstreamLatency/);
    const latencyRow = latencyLabel.closest("div");

    expect(latencyRow).not.toHaveTextContent("timelineNoUpstreamSent");
    expect(latencyRow?.textContent).toMatch(/180ms/);
    expect(screen.queryByText(/timelineGatewayProcessing/)).not.toBeInTheDocument();
  });
});
