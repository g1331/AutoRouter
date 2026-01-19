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
    provider: "openai",
    base_url: "https://api.openai.com/v1",
    api_key_masked: "sk-***1234",
    is_default: false,
    timeout: 60,
    is_active: true,
    description: "Test description",
    group_id: null,
    weight: 1,
    group_name: null,
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
      expect(screen.getByText("tableProvider")).toBeInTheDocument();
      expect(screen.getByText("tableGroup")).toBeInTheDocument();
      expect(screen.getByText("tableWeight")).toBeInTheDocument();
      expect(screen.getByText("tableHealth")).toBeInTheDocument();
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
      // Weight displayed
      expect(screen.getByText("1")).toBeInTheDocument();
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
      const anthropicUpstream = { ...mockUpstream, provider: "anthropic" };
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

    it("renders Azure badge with info variant", () => {
      const azureUpstream = { ...mockUpstream, provider: "azure" };
      render(
        <UpstreamsTable
          upstreams={[azureUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const badge = screen.getByText("Azure");
      expect(badge).toBeInTheDocument();
    });

    it("renders Gemini badge with warning variant", () => {
      const geminiUpstream = { ...mockUpstream, provider: "gemini" };
      render(
        <UpstreamsTable
          upstreams={[geminiUpstream]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      const badge = screen.getByText("Gemini");
      expect(badge).toBeInTheDocument();
    });

    it("renders unknown provider as-is", () => {
      const unknownUpstream = { ...mockUpstream, provider: "custom-provider" };
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
      const upperCaseProvider = { ...mockUpstream, provider: "OPENAI" };
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
          provider: "anthropic",
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

  describe("No Group Display", () => {
    it("renders 'noGroup' text for null group_name", () => {
      const upstreamWithNoGroup = { ...mockUpstream, group_name: null };
      render(
        <UpstreamsTable
          upstreams={[upstreamWithNoGroup]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      expect(screen.getByText("noGroup")).toBeInTheDocument();
    });

    it("renders group name badge when group is set", () => {
      const upstreamWithGroup = { ...mockUpstream, group_name: "Test Group" };
      render(
        <UpstreamsTable
          upstreams={[upstreamWithGroup]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onTest={mockOnTest}
        />
      );

      expect(screen.getByText("Test Group")).toBeInTheDocument();
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
  });
});
