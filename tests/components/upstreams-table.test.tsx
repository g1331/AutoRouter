import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UpstreamsTable } from "@/components/admin/upstreams-table";
import type { Upstream } from "@/types/api";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

// Mock date-locale
vi.mock("@/lib/date-locale", () => ({
  getDateLocale: () => undefined,
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockToggleUpstreamActive = vi.fn();
let mockUpstreamQuotaData: unknown = undefined;
vi.mock("@/hooks/use-upstreams", () => ({
  useToggleUpstreamActive: () => ({
    mutateAsync: mockToggleUpstreamActive,
    isPending: false,
    variables: undefined,
  }),
  useUpstreamQuota: () => ({
    data: mockUpstreamQuotaData,
    isLoading: false,
  }),
}));

const mockForceCircuitBreaker = vi.fn();
vi.mock("@/hooks/use-circuit-breaker", () => ({
  useForceCircuitBreaker: () => ({
    mutateAsync: mockForceCircuitBreaker,
    isPending: false,
    variables: undefined,
  }),
}));

function getDesktopLayout() {
  const root = document.querySelector("div.hidden.lg\\:block");
  if (!root) {
    throw new Error("Desktop layout root not found");
  }
  return within(root as HTMLElement);
}

describe("UpstreamsTable", () => {
  const mockUpstream: Upstream = {
    id: "test-id-1",
    name: "Test Upstream",
    base_url: "https://api.openai.com/v1",
    api_key_masked: "sk-***1234",
    is_default: false,
    timeout: 60,
    is_active: true,
    description: "Test description",
    weight: 1,
    priority: 0,
    route_capabilities: ["openai_chat_compatible"],
    allowed_models: null,
    model_redirects: null,
    health_status: null,
    affinity_migration: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();
  const mockOnTest = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpstreamQuotaData = undefined;
  });

  describe("Empty State", () => {
    it("renders empty state when no upstreams provided", () => {
      render(
        <UpstreamsTable
          upstreams={[]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      expect(screen.getByText("noUpstreams")).toBeInTheDocument();
      expect(screen.getByText("noUpstreamsDesc")).toBeInTheDocument();
    });

    it("shows Server icon in empty state", () => {
      render(
        <UpstreamsTable
          upstreams={[]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const emptyContainer = screen.getByText("noUpstreams").closest("div");
      expect(emptyContainer).toBeInTheDocument();
    });
  });

  describe("Deprecated Header", () => {
    it("does not render deprecated terminal header", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      expect(screen.queryByText("SYS.UPSTREAM_ARRAY")).not.toBeInTheDocument();
      expect(screen.queryByText("[1 NODES]")).not.toBeInTheDocument();
    });
  });

  describe("Table Rendering", () => {
    it("renders table headers", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();

      expect(desktop.getByText("name")).toBeInTheDocument();
      expect(desktop.getByText("routeCapabilities")).toBeInTheDocument();
      expect(desktop.getByText("tableWeight")).toBeInTheDocument();
      expect(desktop.getByText("tableHealth")).toBeInTheDocument();
      expect(desktop.getByText("tableCircuitBreaker")).toBeInTheDocument();
      expect(desktop.getByText("tableBaseUrl")).toBeInTheDocument();
      expect(desktop.getByText("createdAt")).toBeInTheDocument();
      expect(desktop.getByText("actions")).toBeInTheDocument();
    });

    it("renders upstream data correctly", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();

      expect(desktop.getByText("Test Upstream")).toBeInTheDocument();
      expect(desktop.getByText("https://api.openai.com/v1")).toBeInTheDocument();
    });

    it("shows active badge for active upstream", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();
      expect(desktop.getAllByText("active").length).toBeGreaterThan(0);
    });

    it("renders quota exceeded badge and timing hints when quota data is available", () => {
      mockUpstreamQuotaData = {
        items: [
          {
            upstream_id: "test-id-1",
            upstream_name: "Test Upstream",
            is_exceeded: true,
            rules: [
              {
                period_type: "daily",
                period_hours: null,
                current_spending: 10,
                spending_limit: 10,
                percent_used: 100,
                is_exceeded: true,
                resets_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                estimated_recovery_at: null,
              },
              {
                period_type: "rolling",
                period_hours: 24,
                current_spending: 20,
                spending_limit: 10,
                percent_used: 200,
                is_exceeded: true,
                resets_at: null,
                estimated_recovery_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
              },
            ],
          },
        ],
      };

      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();

      expect(desktop.getByText("quotaExceeded")).toBeInTheDocument();
      expect(desktop.getByText(/quotaResets:/)).toBeInTheDocument();
      expect(desktop.getByText(/quotaRecovery:/)).toBeInTheDocument();
    });
  });

  describe("Quick Actions", () => {
    it("calls toggle mutation when toggle button is clicked", async () => {
      mockToggleUpstreamActive.mockResolvedValueOnce(undefined);
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();

      const toggleButton = desktop.getByLabelText("quickDisable: Test Upstream");
      fireEvent.click(toggleButton);

      await waitFor(() => {
        expect(mockToggleUpstreamActive).toHaveBeenCalledWith({
          id: "test-id-1",
          nextActive: false,
        });
      });
    });

    it("shows recover button when circuit breaker is open and calls force-close", async () => {
      mockForceCircuitBreaker.mockResolvedValueOnce(undefined);

      const upstreamWithOpenCircuit: Upstream = {
        ...mockUpstream,
        circuit_breaker: {
          state: "open",
          failure_count: 5,
          success_count: 0,
          last_failure_at: null,
          opened_at: null,
          config: null,
        },
      };

      render(
        <UpstreamsTable
          upstreams={[upstreamWithOpenCircuit]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();

      const recoverButton = desktop.getByLabelText("recoverCircuitBreaker: Test Upstream");
      fireEvent.click(recoverButton);

      await waitFor(() => {
        expect(mockForceCircuitBreaker).toHaveBeenCalledWith({
          upstreamId: "test-id-1",
          action: "close",
        });
      });
    });
  });

  describe("Priority Tier Organization", () => {
    it("displays TIER P0 section for upstreams with default priority", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();
      expect(desktop.getByText("TIER P0")).toBeInTheDocument();
    });

    it("displays tier section for upstreams with specific priority", () => {
      const priorityUpstream = { ...mockUpstream, priority: 1 };
      render(
        <UpstreamsTable
          upstreams={[priorityUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();
      expect(desktop.getByText("TIER P1")).toBeInTheDocument();
    });

    it("groups upstreams by priority", () => {
      const upstreams = [
        { ...mockUpstream, id: "1", name: "Upstream 1", priority: 0 },
        { ...mockUpstream, id: "2", name: "Upstream 2", priority: 0 },
        {
          ...mockUpstream,
          id: "3",
          name: "Upstream 3",
          priority: 1,
        },
      ];
      render(
        <UpstreamsTable
          upstreams={upstreams}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();
      expect(desktop.getByText("TIER P0")).toBeInTheDocument();
      expect(desktop.getByText("TIER P1")).toBeInTheDocument();
    });

    it("displays health summary in tier header", () => {
      const healthyUpstream = {
        ...mockUpstream,
        priority: 0,
        health_status: { is_healthy: true, last_check: new Date().toISOString() },
      };
      render(
        <UpstreamsTable
          upstreams={[healthyUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();
      expect(desktop.getByText(/1\/1 HEALTHY/)).toBeInTheDocument();
    });
  });

  describe("Collapsible Tiers", () => {
    it("shows expand/collapse button in tier header", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();
      const collapseButton = desktop.getByRole("button", { name: "collapse" });
      expect(collapseButton).toBeInTheDocument();
    });

    it("collapses tier when header is clicked", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();

      // Initially upstream is visible
      expect(desktop.getByText("Test Upstream")).toBeInTheDocument();

      // Click tier header to collapse
      const tierHeader = desktop.getByText("TIER P0").closest("tr");
      fireEvent.click(tierHeader!);

      // Upstream should be hidden
      expect(desktop.queryByText("Test Upstream")).not.toBeInTheDocument();
    });

    it("expands tier when collapsed header is clicked", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();

      const tierHeader = desktop.getByText("TIER P0").closest("tr");

      // Collapse
      fireEvent.click(tierHeader!);
      expect(desktop.queryByText("Test Upstream")).not.toBeInTheDocument();

      // Expand
      fireEvent.click(tierHeader!);
      expect(desktop.getByText("Test Upstream")).toBeInTheDocument();
    });
  });

  describe("Status Indicators", () => {
    it("displays healthy status label for healthy upstream", () => {
      const healthyUpstream = {
        ...mockUpstream,
        health_status: { is_healthy: true, last_check: new Date().toISOString() },
      };
      render(
        <UpstreamsTable
          upstreams={[healthyUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      expect(screen.getAllByText("OK").length).toBeGreaterThan(0);
    });

    it("displays offline status label for unhealthy upstream", () => {
      const unhealthyUpstream = {
        ...mockUpstream,
        health_status: {
          is_healthy: false,
          last_check: new Date().toISOString(),
        },
      };
      render(
        <UpstreamsTable
          upstreams={[unhealthyUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      expect(screen.getAllByText("DOWN").length).toBeGreaterThan(0);
    });
  });

  describe("ASCII Progress Bar for Weight", () => {
    it("displays weight as ASCII progress bar", () => {
      const upstream = { ...mockUpstream, weight: 5 };
      render(
        <UpstreamsTable
          upstreams={[upstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      // Should have progress bar characters (multiple: one for weight, one for circuit summary)
      const progressbars = screen.getAllByRole("progressbar");
      expect(progressbars.length).toBeGreaterThan(0);
      // Find the one with weight value "5"
      const weightProgressbar = progressbars.find((pb) => pb.textContent?.includes("5"));
      expect(weightProgressbar).toBeInTheDocument();
    });
  });

  describe("Route Capability Badges", () => {
    it("renders OpenAI-compatible capability badge", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();
      const badge = desktop.getByText("capabilityOpenAIChatCompatible");
      expect(badge).toBeInTheDocument();
    });

    it("renders Anthropic capability badge", () => {
      const anthropicUpstream = {
        ...mockUpstream,
        route_capabilities: ["anthropic_messages"],
      };
      render(
        <UpstreamsTable
          upstreams={[anthropicUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();
      const badge = desktop.getByText("capabilityAnthropicMessages");
      expect(badge).toBeInTheDocument();
    });

    it("renders Gemini capability badge", () => {
      const googleUpstream = {
        ...mockUpstream,
        route_capabilities: ["gemini_native_generate"],
      };
      render(
        <UpstreamsTable
          upstreams={[googleUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();
      const badge = desktop.getByText("capabilityGeminiNativeGenerate");
      expect(badge).toBeInTheDocument();
    });
  });

  describe("Edit Action", () => {
    it("shows edit button for each upstream", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();
      const editButton = desktop.getByLabelText("edit: Test Upstream");
      expect(editButton).toBeInTheDocument();
    });

    it("calls onEdit when edit button is clicked", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();
      const editButton = desktop.getByLabelText("edit: Test Upstream");
      fireEvent.click(editButton);

      expect(mockOnEdit).toHaveBeenCalledWith(mockUpstream);
    });
  });

  describe("Delete Action", () => {
    it("shows delete button for each upstream", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();
      const deleteButton = desktop.getByLabelText("delete: Test Upstream");
      expect(deleteButton).toBeInTheDocument();
    });

    it("calls onDelete when delete button is clicked", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();
      const deleteButton = desktop.getByLabelText("delete: Test Upstream");
      fireEvent.click(deleteButton);

      expect(mockOnDelete).toHaveBeenCalledWith(mockUpstream);
    });
  });

  describe("Test Action", () => {
    it("shows test button for each upstream", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();
      const testButton = desktop.getByLabelText("test: Test Upstream");
      expect(testButton).toBeInTheDocument();
    });

    it("calls onTest when test button is clicked", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();
      const testButton = desktop.getByLabelText("test: Test Upstream");
      fireEvent.click(testButton);

      expect(mockOnTest).toHaveBeenCalledWith(mockUpstream);
    });
  });

  describe("Multiple Upstreams", () => {
    it("renders multiple upstreams correctly", () => {
      const upstreams = [
        mockUpstream,
        {
          ...mockUpstream,
          id: "test-id-2",
          name: "Second Upstream",
          route_capabilities: ["anthropic_messages"],
          base_url: "https://api.anthropic.com/v1",
        },
      ];
      render(
        <UpstreamsTable
          upstreams={upstreams}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();
      expect(desktop.getByText("Test Upstream")).toBeInTheDocument();
      expect(desktop.getByText("Second Upstream")).toBeInTheDocument();
      expect(desktop.getByText("capabilityOpenAIChatCompatible")).toBeInTheDocument();
      expect(desktop.getByText("capabilityAnthropicMessages")).toBeInTheDocument();
    });
  });

  describe("Base URL Display", () => {
    it("displays base URL in code element", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();
      const urlElement = desktop.getByText("https://api.openai.com/v1");
      expect(urlElement.tagName).toBe("CODE");
    });
  });

  describe("Error State Styling", () => {
    it("does not render red glow background on unhealthy upstream rows", () => {
      const unhealthyUpstream = {
        ...mockUpstream,
        health_status: {
          is_healthy: false,
          last_check: new Date().toISOString(),
        },
      };
      render(
        <UpstreamsTable
          upstreams={[unhealthyUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();

      const row = desktop.getByText("Test Upstream").closest("tr");
      expect(row?.className ?? "").not.toContain("shadow-[inset_0_0_20px");
    });
  });

  describe("Action Buttons Accessibility", () => {
    it("has correct aria-labels for edit buttons", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();
      expect(desktop.getByLabelText("edit: Test Upstream")).toBeInTheDocument();
    });

    it("has correct aria-labels for delete buttons", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();
      expect(desktop.getByLabelText("delete: Test Upstream")).toBeInTheDocument();
    });

    it("has aria-expanded on collapse button", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const desktop = getDesktopLayout();
      const collapseButton = desktop.getByRole("button", { name: "collapse" });
      expect(collapseButton).toHaveAttribute("aria-expanded", "true");
    });
  });
});
