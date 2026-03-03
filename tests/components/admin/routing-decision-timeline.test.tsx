import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RoutingDecisionTimeline } from "@/components/admin/routing-decision-timeline";
import type { FailoverAttempt, RoutingDecisionLog } from "@/types/api";

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

  it("shows no-upstream-sent as final upstream when did_send_upstream is false", () => {
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
        statusCode={503}
        compact={false}
      />
    );

    expect(screen.getByText(/timelineNoUpstreamSent/)).toBeInTheDocument();
    expect(screen.getByText(/failureStage.candidate_selection/)).toBeInTheDocument();
  });

  it("shows real upstream name when did_send_upstream is true", () => {
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
        statusCode={200}
        compact={false}
      />
    );

    expect(screen.getByText("rc")).toBeInTheDocument();
    expect(screen.queryByText(/timelineNoUpstreamSent/)).not.toBeInTheDocument();
  });

  it("keeps timeline focused on routing decision without performance metrics", () => {
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
        statusCode={200}
        compact={false}
      />
    );

    expect(screen.queryByText(/timelineTotalDuration/)).not.toBeInTheDocument();
    expect(screen.queryByText(/timelineUpstreamLatency/)).not.toBeInTheDocument();
    expect(screen.queryByText(/perfTtft/)).not.toBeInTheDocument();
    expect(screen.queryByText(/perfTps/)).not.toBeInTheDocument();
    expect(screen.queryByText(/perfGen/)).not.toBeInTheDocument();
  });

  it("renders concurrency_full evidence in expanded retry and exclusion sections", () => {
    const failoverHistory: FailoverAttempt[] = [
      {
        upstream_id: "up-1",
        upstream_name: "openai-1",
        attempted_at: new Date().toISOString(),
        error_type: "concurrency_full",
        error_message: "capacity reached",
      },
    ];

    render(
      <RoutingDecisionTimeline
        routingDecision={{
          ...baseRoutingDecision,
          excluded: [{ id: "up-3", name: "openai-busy", reason: "concurrency_full" }],
          did_send_upstream: true,
          candidate_upstream_id: "up-2",
          actual_upstream_id: "up-2",
          failure_stage: null,
        }}
        upstreamName="rc"
        routingType="provider_type"
        groupName={null}
        failoverAttempts={1}
        failoverHistory={failoverHistory}
        failoverDurationMs={12}
        statusCode={200}
        compact={false}
      />
    );

    expect(screen.getByText("exclusionReason.concurrency_full")).toBeInTheDocument();
    expect(screen.getByText("[concurrency_full]")).toBeInTheDocument();
    expect(screen.getByText("capacity reached")).toBeInTheDocument();
  });

  it("keeps compact view transfer indicators visible when concurrency_full failover happened", () => {
    render(
      <RoutingDecisionTimeline
        routingDecision={{
          ...baseRoutingDecision,
          excluded: [{ id: "up-3", name: "openai-busy", reason: "concurrency_full" }],
          did_send_upstream: true,
          candidate_upstream_id: "up-2",
          actual_upstream_id: "up-2",
          failure_stage: null,
        }}
        upstreamName="rc"
        routingType="provider_type"
        groupName={null}
        failoverAttempts={1}
      />
    );

    expect(screen.getByTitle("indicatorFailover")).toBeInTheDocument();
    expect(screen.getByTitle("indicatorExcluded")).toBeInTheDocument();
  });
});
