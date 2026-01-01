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
    config: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Empty State", () => {
    it("renders empty state when no upstreams provided", () => {
      render(<UpstreamsTable upstreams={[]} onEdit={mockOnEdit} onDelete={mockOnDelete} />);

      expect(screen.getByText("noUpstreams")).toBeInTheDocument();
      expect(screen.getByText("noUpstreamsDesc")).toBeInTheDocument();
    });

    it("shows Server icon in empty state", () => {
      render(<UpstreamsTable upstreams={[]} onEdit={mockOnEdit} onDelete={mockOnDelete} />);

      const emptyContainer = screen.getByText("noUpstreams").closest("div");
      expect(emptyContainer).toBeInTheDocument();
    });
  });

  describe("Table Rendering", () => {
    it("renders table headers", () => {
      render(
        <UpstreamsTable upstreams={[mockUpstream]} onEdit={mockOnEdit} onDelete={mockOnDelete} />
      );

      expect(screen.getByText("name")).toBeInTheDocument();
      expect(screen.getByText("tableProvider")).toBeInTheDocument();
      expect(screen.getByText("tableBaseUrl")).toBeInTheDocument();
      expect(screen.getByText("description")).toBeInTheDocument();
      expect(screen.getByText("createdAt")).toBeInTheDocument();
      expect(screen.getByText("actions")).toBeInTheDocument();
    });

    it("renders upstream data correctly", () => {
      render(
        <UpstreamsTable upstreams={[mockUpstream]} onEdit={mockOnEdit} onDelete={mockOnDelete} />
      );

      expect(screen.getByText("Test Upstream")).toBeInTheDocument();
      expect(screen.getByText("https://api.openai.com/v1")).toBeInTheDocument();
      expect(screen.getByText("Test description")).toBeInTheDocument();
    });
  });

  describe("Provider Badges", () => {
    it("renders OpenAI badge with success variant", () => {
      render(
        <UpstreamsTable upstreams={[mockUpstream]} onEdit={mockOnEdit} onDelete={mockOnDelete} />
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
        />
      );

      const badge = screen.getByText("Anthropic");
      expect(badge).toBeInTheDocument();
    });

    it("renders Azure badge with info variant", () => {
      const azureUpstream = { ...mockUpstream, provider: "azure" };
      render(
        <UpstreamsTable upstreams={[azureUpstream]} onEdit={mockOnEdit} onDelete={mockOnDelete} />
      );

      const badge = screen.getByText("Azure");
      expect(badge).toBeInTheDocument();
    });

    it("renders Gemini badge with warning variant", () => {
      const geminiUpstream = { ...mockUpstream, provider: "gemini" };
      render(
        <UpstreamsTable upstreams={[geminiUpstream]} onEdit={mockOnEdit} onDelete={mockOnDelete} />
      );

      const badge = screen.getByText("Gemini");
      expect(badge).toBeInTheDocument();
    });

    it("renders unknown provider as-is", () => {
      const unknownUpstream = { ...mockUpstream, provider: "custom-provider" };
      render(
        <UpstreamsTable upstreams={[unknownUpstream]} onEdit={mockOnEdit} onDelete={mockOnDelete} />
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
        />
      );

      const badge = screen.getByText("OpenAI");
      expect(badge).toBeInTheDocument();
    });
  });

  describe("Edit Action", () => {
    it("shows edit button for each upstream", () => {
      render(
        <UpstreamsTable upstreams={[mockUpstream]} onEdit={mockOnEdit} onDelete={mockOnDelete} />
      );

      const editButton = screen.getByLabelText("edit: Test Upstream");
      expect(editButton).toBeInTheDocument();
    });

    it("calls onEdit when edit button is clicked", () => {
      render(
        <UpstreamsTable upstreams={[mockUpstream]} onEdit={mockOnEdit} onDelete={mockOnDelete} />
      );

      const editButton = screen.getByLabelText("edit: Test Upstream");
      fireEvent.click(editButton);

      expect(mockOnEdit).toHaveBeenCalledWith(mockUpstream);
    });
  });

  describe("Delete Action", () => {
    it("shows delete button for each upstream", () => {
      render(
        <UpstreamsTable upstreams={[mockUpstream]} onEdit={mockOnEdit} onDelete={mockOnDelete} />
      );

      const deleteButton = screen.getByLabelText("delete: Test Upstream");
      expect(deleteButton).toBeInTheDocument();
    });

    it("calls onDelete when delete button is clicked", () => {
      render(
        <UpstreamsTable upstreams={[mockUpstream]} onEdit={mockOnEdit} onDelete={mockOnDelete} />
      );

      const deleteButton = screen.getByLabelText("delete: Test Upstream");
      fireEvent.click(deleteButton);

      expect(mockOnDelete).toHaveBeenCalledWith(mockUpstream);
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
      render(<UpstreamsTable upstreams={upstreams} onEdit={mockOnEdit} onDelete={mockOnDelete} />);

      expect(screen.getByText("Test Upstream")).toBeInTheDocument();
      expect(screen.getByText("Second Upstream")).toBeInTheDocument();
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
      expect(screen.getByText("Anthropic")).toBeInTheDocument();
    });
  });

  describe("Null Description", () => {
    it("renders dash for null description", () => {
      const upstreamWithNoDesc = { ...mockUpstream, description: null };
      render(
        <UpstreamsTable
          upstreams={[upstreamWithNoDesc]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />
      );

      const dashes = screen.getAllByText("-");
      expect(dashes.length).toBeGreaterThan(0);
    });
  });

  describe("Base URL Display", () => {
    it("displays base URL in code element", () => {
      render(
        <UpstreamsTable upstreams={[mockUpstream]} onEdit={mockOnEdit} onDelete={mockOnDelete} />
      );

      const urlElement = screen.getByText("https://api.openai.com/v1");
      expect(urlElement.tagName).toBe("CODE");
    });
  });

  describe("Action Buttons Accessibility", () => {
    it("has correct aria-labels for edit buttons", () => {
      render(
        <UpstreamsTable upstreams={[mockUpstream]} onEdit={mockOnEdit} onDelete={mockOnDelete} />
      );

      expect(screen.getByLabelText("edit: Test Upstream")).toBeInTheDocument();
    });

    it("has correct aria-labels for delete buttons", () => {
      render(
        <UpstreamsTable upstreams={[mockUpstream]} onEdit={mockOnEdit} onDelete={mockOnDelete} />
      );

      expect(screen.getByLabelText("delete: Test Upstream")).toBeInTheDocument();
    });
  });
});
