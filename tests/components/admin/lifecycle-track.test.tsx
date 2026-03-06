import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LifecycleTrack } from "@/components/admin/lifecycle-track";
import type { RequestStageTimings, UpstreamErrorSummary } from "@/types/api";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const baseTimings: RequestStageTimings = {
  total_ms: 500,
  decision_ms: 50,
  upstream_response_ms: 400,
  first_token_ms: null,
  generation_ms: null,
  gateway_processing_ms: null,
};

describe("LifecycleTrack", () => {
  describe("Four-stage track", () => {
    it("renders all four stage labels", () => {
      render(
        <LifecycleTrack statusCode={200} isStream={false} lifecycleStatus="completed_success" />
      );

      expect(screen.getByText("lifecycleDecision")).toBeInTheDocument();
      expect(screen.getByText("lifecycleRequest")).toBeInTheDocument();
      expect(screen.getByText("lifecycleResponse")).toBeInTheDocument();
      expect(screen.getByText("lifecycleComplete")).toBeInTheDocument();
    });

    it("shows decision timing when stage_timings_ms is provided", () => {
      render(
        <LifecycleTrack
          statusCode={200}
          isStream={false}
          lifecycleStatus="completed_success"
          stageTimings={baseTimings}
        />
      );

      expect(screen.getByText(/50ms \(\+50ms\)/)).toBeInTheDocument();
    });

    it("shows upstream response timing", () => {
      render(
        <LifecycleTrack
          statusCode={200}
          isStream={false}
          lifecycleStatus="completed_success"
          stageTimings={baseTimings}
        />
      );

      expect(screen.getByText(/500ms \(\+400ms\)/)).toBeInTheDocument();
    });

    it("shows status code in complete segment with success color", () => {
      render(
        <LifecycleTrack statusCode={200} isStream={false} lifecycleStatus="completed_success" />
      );

      const statusEl = screen.getByText("200");
      expect(statusEl).toBeInTheDocument();
      expect(statusEl.className).toContain("text-status-success");
    });
  });

  describe("Streaming response sub-timings (task 4.2)", () => {
    it("shows TTFT and GEN in response segment for streaming requests", () => {
      render(
        <LifecycleTrack
          statusCode={200}
          isStream={true}
          lifecycleStatus="completed_success"
          stageTimings={{
            total_ms: 1200,
            decision_ms: 80,
            upstream_response_ms: 1100,
            first_token_ms: 320,
            generation_ms: 780,
            gateway_processing_ms: null,
          }}
        />
      );

      expect(screen.getByText(/journeyFirstOutput 400ms \(\+320ms\)/)).toBeInTheDocument();
      expect(screen.getByText(/1\.2s \(\+780ms\)/)).toBeInTheDocument();
      expect(screen.queryByText("1.1s")).not.toBeInTheDocument();
    });

    it("does not show streaming sub-timings for non-streaming requests", () => {
      render(
        <LifecycleTrack
          statusCode={200}
          isStream={false}
          lifecycleStatus="completed_success"
          stageTimings={{
            ...baseTimings,
            first_token_ms: 320,
            generation_ms: 780,
          }}
        />
      );

      // first_token_ms and generation_ms exist but isStream=false so they shouldn't show
      const perfTtft = screen.queryByText(/perfTtft/);
      expect(perfTtft).not.toBeInTheDocument();
    });
  });

  describe("Failure error summary (task 4.3)", () => {
    const errorSummary: UpstreamErrorSummary = {
      status_code: 429,
      error_type: "rate_limit",
      error_message: "Rate limit exceeded",
      response_body_excerpt: null,
    };

    it("shows error type and message in failing request segment", () => {
      render(
        <LifecycleTrack
          statusCode={429}
          isStream={false}
          lifecycleStatus="completed_failed"
          upstreamError={errorSummary}
          failureStage="upstream_response"
        />
      );

      // error_type appears in sub-text of the failing segment
      expect(screen.getByText(/rate_limit/)).toBeInTheDocument();
      // Multiple "429" exist: one in sub-text, one as status code in complete segment
      expect(screen.getAllByText(/429/).length).toBeGreaterThan(0);
    });

    it("shows error summary when failure stage is upstream_response", () => {
      render(
        <LifecycleTrack
          statusCode={503}
          isStream={false}
          lifecycleStatus="completed_failed"
          upstreamError={errorSummary}
          failureStage="upstream_response"
        />
      );

      // Error shown in request segment (not downstream_streaming)
      const errText = screen.getByText(/rate_limit/);
      expect(errText).toBeInTheDocument();
      expect(screen.getAllByText(/rate_limit/).length).toBeGreaterThan(0);
    });

    it("shows error summary in response segment for downstream_streaming failure", () => {
      render(
        <LifecycleTrack
          statusCode={500}
          isStream={true}
          lifecycleStatus="completed_failed"
          upstreamError={errorSummary}
          failureStage="downstream_streaming"
        />
      );

      const errText = screen.getByText(/rate_limit/);
      expect(errText).toBeInTheDocument();
    });

    it("shows failed status code with error color in complete segment", () => {
      render(
        <LifecycleTrack
          statusCode={503}
          isStream={false}
          lifecycleStatus="completed_failed"
          upstreamError={errorSummary}
          failureStage="upstream_request"
        />
      );

      const statusEl = screen.getByText("503");
      expect(statusEl.className).toContain("text-status-error");
    });

    it("truncates long error messages", () => {
      const longError: UpstreamErrorSummary = {
        status_code: 429,
        error_type: "rate_limit",
        error_message: "A".repeat(50),
        response_body_excerpt: null,
      };

      render(
        <LifecycleTrack
          statusCode={429}
          isStream={false}
          lifecycleStatus="completed_failed"
          upstreamError={longError}
          failureStage="upstream_response"
        />
      );

      expect(screen.getByText(/…/)).toBeInTheDocument();
    });
  });

  describe("In-progress states", () => {
    it("shows decision stage as active when lifecycle is decision", () => {
      render(<LifecycleTrack statusCode={null} isStream={false} lifecycleStatus="decision" />);

      const decisionEl = screen.getByText("lifecycleDecision");
      expect(decisionEl).toBeInTheDocument();
      expect(document.querySelector('[class*="-translate-y-0.5"]')).not.toBeNull();
    });

    it("shows pending stages when request is in-progress", () => {
      render(<LifecycleTrack statusCode={null} isStream={false} lifecycleStatus="requesting" />);

      // All 4 labels present
      expect(screen.getByText("lifecycleDecision")).toBeInTheDocument();
      expect(screen.getByText("lifecycleComplete")).toBeInTheDocument();
    });
  });

  describe("Compact mode (task 4.4)", () => {
    it("renders compact view without all 4 stages", () => {
      render(
        <LifecycleTrack
          statusCode={200}
          isStream={false}
          lifecycleStatus="completed_success"
          compact
        />
      );

      // Compact shows primary segment + complete, not necessarily all 4
      expect(screen.getByText("lifecycleComplete")).toBeInTheDocument();
    });

    it("shows status code in compact mode", () => {
      render(
        <LifecycleTrack
          statusCode={200}
          isStream={false}
          lifecycleStatus="completed_success"
          compact
        />
      );

      expect(screen.getByText("200")).toBeInTheDocument();
    });

    it("prefers response summary in compact mode for completed streaming requests", () => {
      render(
        <LifecycleTrack
          statusCode={200}
          isStream={true}
          lifecycleStatus="completed_success"
          stageTimings={{
            total_ms: 1650,
            decision_ms: 300,
            upstream_response_ms: 950,
            first_token_ms: 900,
            generation_ms: 400,
            gateway_processing_ms: null,
          }}
          compact
        />
      );

      expect(screen.getByText("lifecycleResponse")).toBeInTheDocument();
      expect(screen.getByText(/journeyFirstOutput 1\.2s \(\+900ms\)/)).toBeInTheDocument();
      expect(screen.getByText(/200 · 1\.6s/)).toBeInTheDocument();
    });

    it("shows failed status code with error color in compact mode", () => {
      render(
        <LifecycleTrack
          statusCode={429}
          isStream={false}
          lifecycleStatus="completed_failed"
          compact
        />
      );

      const statusEl = screen.getByText("429");
      expect(statusEl.className).toContain("text-status-error");
    });
  });

  describe("Legacy data fallback", () => {
    it("derives completed_success from 2xx status code when lifecycle_status is missing", () => {
      render(<LifecycleTrack statusCode={200} isStream={false} />);

      const statusEl = screen.getByText("200");
      expect(statusEl.className).toContain("text-status-success");
    });

    it("derives completed_failed from 4xx status code when lifecycle_status is missing", () => {
      render(<LifecycleTrack statusCode={404} isStream={false} />);

      const statusEl = screen.getByText("404");
      expect(statusEl.className).toContain("text-status-error");
    });
  });
});
