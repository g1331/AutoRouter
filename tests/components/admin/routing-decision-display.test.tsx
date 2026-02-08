import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoutingDecisionDisplay } from "@/components/admin/routing-decision-display";
import type { RoutingDecisionLog } from "@/types/api";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      routingAuto: "Auto",
      routingDirect: "Direct",
      routingGroup: "Group",
      routingDefault: "Default",
      routingNone: "None",
      routingProviderType: "Provider",
      indicatorRedirect: "Model redirect applied",
      indicatorFailover: "Failover occurred",
      indicatorExcluded: "Some upstreams excluded",
      indicatorLowCandidates: "Low candidate count",
      tooltipModelResolution: "Model Resolution",
      tooltipCandidates: "Candidates",
      tooltipExcluded: "Excluded",
      tooltipStrategy: "Strategy",
      noRoutingDecision: "No routing decision data",
      failoverTime: "Failover Time",
      failoverDuration: "Failover Duration",
      more: "more",
      "exclusionReason.circuit_open": "Circuit breaker open",
      "exclusionReason.model_not_allowed": "Model not allowed",
      "exclusionReason.unhealthy": "Unhealthy",
      "circuitState.closed": "Normal",
      "circuitState.open": "Open",
      "circuitState.half_open": "Recovering",
    };
    return translations[key] || key;
  },
}));

// Mock Badge component
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span data-testid="badge" className={className}>
      {children}
    </span>
  ),
}));

describe("RoutingDecisionDisplay", () => {
  const mockRoutingDecision: RoutingDecisionLog = {
    original_model: "gpt-4",
    resolved_model: "gpt-4-turbo",
    model_redirect_applied: true,
    provider_type: "openai",
    routing_type: "provider_type",
    candidates: [
      {
        id: "upstream-1",
        name: "openai-primary",
        weight: 100,
        circuit_state: "closed",
      },
      {
        id: "upstream-2",
        name: "openai-secondary",
        weight: 50,
        circuit_state: "closed",
      },
    ],
    excluded: [
      {
        id: "upstream-3",
        name: "openai-backup",
        reason: "circuit_open",
      },
    ],
    candidate_count: 3,
    final_candidate_count: 2,
    selected_upstream_id: "upstream-1",
    selection_strategy: "round_robin",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("compact view", () => {
    it("should render upstream name", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="auto"
          routingDecision={mockRoutingDecision}
          groupName={null}
          failoverAttempts={0}
          compact={true}
        />
      );

      // Multiple elements may contain "openai-primary" (upstream name and candidates list)
      expect(screen.getAllByText("openai-primary").length).toBeGreaterThan(0);
    });

    it("should render routing type badge with Provider label", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="auto"
          routingDecision={mockRoutingDecision}
          groupName={null}
          failoverAttempts={0}
          compact={true}
        />
      );

      // The routing_type is "provider_type" which maps to "Provider"
      expect(screen.getByText("Provider")).toBeInTheDocument();
    });

    it("should render candidate count", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="auto"
          routingDecision={mockRoutingDecision}
          groupName={null}
          failoverAttempts={0}
          compact={true}
        />
      );

      expect(screen.getByText("2/3")).toBeInTheDocument();
    });

    it("should render redirect indicator when model redirect applied", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="auto"
          routingDecision={mockRoutingDecision}
          groupName={null}
          failoverAttempts={0}
          compact={true}
        />
      );

      expect(screen.getByTitle("Model redirect applied")).toBeInTheDocument();
    });

    it("should render excluded indicator when upstreams are excluded", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="auto"
          routingDecision={mockRoutingDecision}
          groupName={null}
          failoverAttempts={0}
          compact={true}
        />
      );

      expect(screen.getByTitle("Some upstreams excluded")).toBeInTheDocument();
    });

    it("should render failover indicator when failover attempts > 0", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="auto"
          routingDecision={mockRoutingDecision}
          groupName={null}
          failoverAttempts={1}
          compact={true}
        />
      );

      expect(screen.getByTitle("Failover occurred")).toBeInTheDocument();
    });

    it("should render low candidates indicator when final count is 1", () => {
      const lowCandidateDecision: RoutingDecisionLog = {
        ...mockRoutingDecision,
        final_candidate_count: 1,
      };

      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="auto"
          routingDecision={lowCandidateDecision}
          groupName={null}
          failoverAttempts={0}
          compact={true}
        />
      );

      expect(screen.getByTitle("Low candidate count")).toBeInTheDocument();
    });

    it("should render group name when provided", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="group"
          routingDecision={mockRoutingDecision}
          groupName="openai-group"
          failoverAttempts={0}
          compact={true}
        />
      );

      expect(screen.getByText("openai-group")).toBeInTheDocument();
    });
  });

  describe("graceful degradation", () => {
    it("should render without routing decision", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="direct"
          routingDecision={null}
          groupName={null}
          failoverAttempts={0}
          compact={true}
        />
      );

      expect(screen.getByText("openai-primary")).toBeInTheDocument();
      expect(screen.getByText("Direct")).toBeInTheDocument();
    });

    it("should render with null upstream name", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName={null}
          routingType="auto"
          routingDecision={mockRoutingDecision}
          groupName={null}
          failoverAttempts={0}
          compact={true}
        />
      );

      expect(screen.getByText("-")).toBeInTheDocument();
    });

    it("should render with null routing type", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType={null}
          routingDecision={null}
          groupName={null}
          failoverAttempts={0}
          compact={true}
        />
      );

      expect(screen.getByText("openai-primary")).toBeInTheDocument();
    });
  });

  describe("routing type badges (fallback without routing decision)", () => {
    it("should render auto routing badge", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName="test"
          routingType="auto"
          routingDecision={null}
          groupName={null}
          failoverAttempts={0}
          compact={true}
        />
      );

      expect(screen.getByText("Auto")).toBeInTheDocument();
    });

    it("should render direct routing badge", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName="test"
          routingType="direct"
          routingDecision={null}
          groupName={null}
          failoverAttempts={0}
          compact={true}
        />
      );

      expect(screen.getByText("Direct")).toBeInTheDocument();
    });

    it("should render group routing badge", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName="test"
          routingType="group"
          routingDecision={null}
          groupName={null}
          failoverAttempts={0}
          compact={true}
        />
      );

      expect(screen.getByText("Group")).toBeInTheDocument();
    });

    it("should render default routing badge", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName="test"
          routingType="default"
          routingDecision={null}
          groupName={null}
          failoverAttempts={0}
          compact={true}
        />
      );

      expect(screen.getByText("Default")).toBeInTheDocument();
    });
  });

  describe("expanded view (compact=false)", () => {
    it("should render expanded content when compact is false", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="auto"
          routingDecision={mockRoutingDecision}
          groupName={null}
          failoverAttempts={0}
          compact={false}
        />
      );

      // Should show model resolution section
      expect(screen.getByText("Model Resolution")).toBeInTheDocument();
    });

    it("should show model redirect info in expanded view", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="auto"
          routingDecision={mockRoutingDecision}
          groupName={null}
          failoverAttempts={0}
          compact={false}
        />
      );

      expect(screen.getByText("gpt-4")).toBeInTheDocument();
      expect(screen.getByText("gpt-4-turbo")).toBeInTheDocument();
    });

    it("should show candidates in expanded view", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="auto"
          routingDecision={mockRoutingDecision}
          groupName={null}
          failoverAttempts={0}
          compact={false}
        />
      );

      expect(screen.getByText(/Candidates/)).toBeInTheDocument();
      expect(screen.getByText("openai-primary")).toBeInTheDocument();
      expect(screen.getByText("openai-secondary")).toBeInTheDocument();
    });

    it("should show excluded upstreams in expanded view", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="auto"
          routingDecision={mockRoutingDecision}
          groupName={null}
          failoverAttempts={0}
          compact={false}
        />
      );

      expect(screen.getByText(/Excluded/)).toBeInTheDocument();
      expect(screen.getByText("openai-backup")).toBeInTheDocument();
    });

    it("should show no routing decision message when data is null", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="direct"
          routingDecision={null}
          groupName={null}
          failoverAttempts={0}
          compact={false}
        />
      );

      expect(screen.getByText("No routing decision data")).toBeInTheDocument();
    });

    it("should not show failover time when no failover happened", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="auto"
          routingDecision={mockRoutingDecision}
          groupName={null}
          failoverAttempts={0}
          compact={false}
        />
      );

      expect(screen.queryByText(/Failover Time:/)).not.toBeInTheDocument();
    });

    it("should show provided failover time without at-prefix", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="auto"
          routingDecision={mockRoutingDecision}
          groupName={null}
          failoverAttempts={1}
          failoverDuration="420ms"
          compact={false}
        />
      );

      expect(screen.getByText(/Failover Duration: 420ms/)).toBeInTheDocument();
    });
  });

  describe("exclusion reasons", () => {
    it("should display circuit_open reason", () => {
      const decisionWithCircuitOpen: RoutingDecisionLog = {
        ...mockRoutingDecision,
        excluded: [
          {
            id: "upstream-3",
            name: "openai-backup",
            reason: "circuit_open",
          },
        ],
      };

      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="auto"
          routingDecision={decisionWithCircuitOpen}
          groupName={null}
          failoverAttempts={0}
          compact={false}
        />
      );

      expect(screen.getByText("Circuit breaker open")).toBeInTheDocument();
    });

    it("should display model_not_allowed reason", () => {
      const decisionWithModelNotAllowed: RoutingDecisionLog = {
        ...mockRoutingDecision,
        excluded: [
          {
            id: "upstream-3",
            name: "openai-backup",
            reason: "model_not_allowed",
          },
        ],
      };

      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="auto"
          routingDecision={decisionWithModelNotAllowed}
          groupName={null}
          failoverAttempts={0}
          compact={false}
        />
      );

      expect(screen.getByText("Model not allowed")).toBeInTheDocument();
    });

    it("should display unhealthy reason", () => {
      const decisionWithUnhealthy: RoutingDecisionLog = {
        ...mockRoutingDecision,
        excluded: [
          {
            id: "upstream-3",
            name: "openai-backup",
            reason: "unhealthy",
          },
        ],
      };

      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="auto"
          routingDecision={decisionWithUnhealthy}
          groupName={null}
          failoverAttempts={0}
          compact={false}
        />
      );

      expect(screen.getByText("Unhealthy")).toBeInTheDocument();
    });
  });

  describe("circuit states in expanded view", () => {
    it("should display closed circuit state text", () => {
      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="auto"
          routingDecision={mockRoutingDecision}
          groupName={null}
          failoverAttempts={0}
          compact={false}
        />
      );

      // In expanded view, circuit state is shown as text
      expect(screen.getAllByText("closed").length).toBeGreaterThan(0);
    });

    it("should display open circuit state text", () => {
      const decisionWithOpenCircuit: RoutingDecisionLog = {
        ...mockRoutingDecision,
        candidates: [
          {
            id: "upstream-1",
            name: "openai-primary",
            weight: 100,
            circuit_state: "open",
          },
        ],
      };

      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="auto"
          routingDecision={decisionWithOpenCircuit}
          groupName={null}
          failoverAttempts={0}
          compact={false}
        />
      );

      expect(screen.getByText("open")).toBeInTheDocument();
    });

    it("should display half_open circuit state text", () => {
      const decisionWithHalfOpenCircuit: RoutingDecisionLog = {
        ...mockRoutingDecision,
        candidates: [
          {
            id: "upstream-1",
            name: "openai-primary",
            weight: 100,
            circuit_state: "half_open",
          },
        ],
      };

      render(
        <RoutingDecisionDisplay
          upstreamName="openai-primary"
          routingType="auto"
          routingDecision={decisionWithHalfOpenCircuit}
          groupName={null}
          failoverAttempts={0}
          compact={false}
        />
      );

      expect(screen.getByText("half_open")).toBeInTheDocument();
    });
  });
});
