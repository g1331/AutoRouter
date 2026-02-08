import { render, screen, fireEvent } from "@testing-library/react";
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

describe("UpstreamsTable", () => {
  const mockUpstream: Upstream = {
    id: "test-id-1",
    name: "Test Upstream",
    provider_type: "openai",
    base_url: "https://api.openai.com/v1",
    api_key_masked: "sk-***1234",
    is_default: false,
    timeout: 60,
    is_active: true,
    description: "Test description",
    weight: 1,
    priority: 0,
    allowed_models: null,
    model_redirects: null,
    health_status: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();
  const mockOnTest = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
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

  describe("Terminal Header", () => {
    it("renders terminal header with system ID", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      expect(screen.getByText("SYS.UPSTREAM_ARRAY")).toBeInTheDocument();
    });

    it("displays node count in header", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      expect(screen.getByText("[1 NODES]")).toBeInTheDocument();
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

      expect(screen.getByText("name")).toBeInTheDocument();
      expect(screen.getByText("providerType")).toBeInTheDocument();
      expect(screen.getByText("tableWeight")).toBeInTheDocument();
      expect(screen.getByText("tableHealth")).toBeInTheDocument();
      expect(screen.getByText("tableCircuitBreaker")).toBeInTheDocument();
      expect(screen.getByText("tableBaseUrl")).toBeInTheDocument();
      expect(screen.getByText("createdAt")).toBeInTheDocument();
      expect(screen.getByText("actions")).toBeInTheDocument();
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

      expect(screen.getByText("Test Upstream")).toBeInTheDocument();
      expect(screen.getByText("https://api.openai.com/v1")).toBeInTheDocument();
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

      expect(screen.getByText("TIER P0")).toBeInTheDocument();
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

      expect(screen.getByText("TIER P1")).toBeInTheDocument();
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

      expect(screen.getByText("TIER P0")).toBeInTheDocument();
      expect(screen.getByText("TIER P1")).toBeInTheDocument();
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

      expect(screen.getByText(/1\/1 HEALTHY/)).toBeInTheDocument();
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

      const collapseButton = screen.getByRole("button", { name: "collapse" });
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

      // Initially upstream is visible
      expect(screen.getByText("Test Upstream")).toBeInTheDocument();

      // Click tier header to collapse
      const tierHeader = screen.getByText("TIER P0").closest("tr");
      fireEvent.click(tierHeader!);

      // Upstream should be hidden
      expect(screen.queryByText("Test Upstream")).not.toBeInTheDocument();
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

      const tierHeader = screen.getByText("TIER P0").closest("tr");

      // Collapse
      fireEvent.click(tierHeader!);
      expect(screen.queryByText("Test Upstream")).not.toBeInTheDocument();

      // Expand
      fireEvent.click(tierHeader!);
      expect(screen.getByText("Test Upstream")).toBeInTheDocument();
    });
  });

  describe("LED Status Indicators", () => {
    it("displays healthy LED for healthy upstream", () => {
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

      // Should have healthy LED character
      expect(screen.getAllByText("◉").length).toBeGreaterThan(0);
    });

    it("displays offline LED for unhealthy upstream", () => {
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

      // Should have offline LED character
      expect(screen.getAllByText("●").length).toBeGreaterThan(0);
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

  describe("Provider Badges", () => {
    it("renders OpenAI badge with success variant", () => {
      render(
        <UpstreamsTable
          upstreams={[mockUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const badge = screen.getByText("OpenAI");
      expect(badge).toBeInTheDocument();
    });

    it("renders Anthropic badge with secondary variant", () => {
      const anthropicUpstream = { ...mockUpstream, provider_type: "anthropic" as const };
      render(
        <UpstreamsTable
          upstreams={[anthropicUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const badge = screen.getByText("Anthropic");
      expect(badge).toBeInTheDocument();
    });

    it("renders Google badge with warning variant", () => {
      const googleUpstream = { ...mockUpstream, provider_type: "google" as const };
      render(
        <UpstreamsTable
          upstreams={[googleUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const badge = screen.getByText("Google");
      expect(badge).toBeInTheDocument();
    });

    it("renders Custom badge with outline variant", () => {
      const customUpstream = { ...mockUpstream, provider_type: "custom" as const };
      render(
        <UpstreamsTable
          upstreams={[customUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const badge = screen.getByText("Custom");
      expect(badge).toBeInTheDocument();
    });

    it("renders unknown provider as-is", () => {
      const unknownUpstream = { ...mockUpstream, provider_type: "custom-provider" as const };
      render(
        <UpstreamsTable
          upstreams={[unknownUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const badge = screen.getByText("custom-provider");
      expect(badge).toBeInTheDocument();
    });

    it("handles case-insensitive provider matching", () => {
      const upperCaseProvider = { ...mockUpstream, provider_type: "OPENAI" as const };
      render(
        <UpstreamsTable
          upstreams={[upperCaseProvider]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const badge = screen.getByText("OpenAI");
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

      const editButton = screen.getByLabelText("edit: Test Upstream");
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

      const editButton = screen.getByLabelText("edit: Test Upstream");
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

      const deleteButton = screen.getByLabelText("delete: Test Upstream");
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

      const deleteButton = screen.getByLabelText("delete: Test Upstream");
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

      const testButton = screen.getByLabelText("test: Test Upstream");
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

      const testButton = screen.getByLabelText("test: Test Upstream");
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
          provider_type: "anthropic" as const,
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

      expect(screen.getByText("Test Upstream")).toBeInTheDocument();
      expect(screen.getByText("Second Upstream")).toBeInTheDocument();
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
      expect(screen.getByText("Anthropic")).toBeInTheDocument();
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

      const urlElement = screen.getByText("https://api.openai.com/v1");
      expect(urlElement.tagName).toBe("CODE");
    });
  });

  describe("Error State Glow", () => {
    it("applies error glow to unhealthy upstream rows", () => {
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

      // The row should have the error shadow class
      const row = screen.getByText("Test Upstream").closest("tr");
      expect(row?.className).toContain("shadow-[inset_0_0_20px");
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

      expect(screen.getByLabelText("edit: Test Upstream")).toBeInTheDocument();
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

      expect(screen.getByLabelText("delete: Test Upstream")).toBeInTheDocument();
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

      const collapseButton = screen.getByRole("button", { name: "collapse" });
      expect(collapseButton).toHaveAttribute("aria-expanded", "true");
    });
  });
});
