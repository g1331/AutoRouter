import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeleteUpstreamDialog } from "@/components/admin/delete-upstream-dialog";
import type { Upstream } from "@/types/api";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock the useDeleteUpstream hook
const mockDeleteMutateAsync = vi.fn();
vi.mock("@/hooks/use-upstreams", () => ({
  useDeleteUpstream: () => ({
    mutateAsync: mockDeleteMutateAsync,
    isPending: false,
  }),
}));

describe("DeleteUpstreamDialog", () => {
  const mockUpstream: Upstream = {
    id: "test-upstream-id",
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

  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders nothing when upstream is null", () => {
      const { container } = render(
        <DeleteUpstreamDialog upstream={null} open={true} onClose={mockOnClose} />
      );

      expect(container.firstChild).toBeNull();
    });

    it("renders dialog when open with upstream", () => {
      render(<DeleteUpstreamDialog upstream={mockUpstream} open={true} onClose={mockOnClose} />);

      expect(screen.getByText("deleteUpstreamTitle")).toBeInTheDocument();
      expect(screen.getByText("deleteUpstreamDesc")).toBeInTheDocument();
    });

    it("displays upstream details", () => {
      render(<DeleteUpstreamDialog upstream={mockUpstream} open={true} onClose={mockOnClose} />);

      expect(screen.getByText("Test Upstream")).toBeInTheDocument();
      expect(screen.getByText("openai")).toBeInTheDocument();
      expect(screen.getByText("https://api.openai.com/v1")).toBeInTheDocument();
      expect(screen.getByText("Test description")).toBeInTheDocument();
    });

    it("shows warning message", () => {
      render(<DeleteUpstreamDialog upstream={mockUpstream} open={true} onClose={mockOnClose} />);

      expect(screen.getByText("deleteUpstreamWarning")).toBeInTheDocument();
    });

    it("renders cancel and delete buttons", () => {
      render(<DeleteUpstreamDialog upstream={mockUpstream} open={true} onClose={mockOnClose} />);

      expect(screen.getByText("cancel")).toBeInTheDocument();
      expect(screen.getByText("delete")).toBeInTheDocument();
    });

    it("handles upstream without description", () => {
      const upstreamNoDesc = { ...mockUpstream, description: null };
      render(<DeleteUpstreamDialog upstream={upstreamNoDesc} open={true} onClose={mockOnClose} />);

      expect(screen.getByText("Test Upstream")).toBeInTheDocument();
      expect(screen.queryByText("description:")).not.toBeInTheDocument();
    });
  });

  describe("Actions", () => {
    it("calls onClose when cancel button is clicked", () => {
      render(<DeleteUpstreamDialog upstream={mockUpstream} open={true} onClose={mockOnClose} />);

      const cancelButton = screen.getByText("cancel");
      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("calls delete mutation and closes when delete is clicked", async () => {
      mockDeleteMutateAsync.mockResolvedValueOnce(undefined);

      render(<DeleteUpstreamDialog upstream={mockUpstream} open={true} onClose={mockOnClose} />);

      const deleteButton = screen.getByText("delete");
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(mockDeleteMutateAsync).toHaveBeenCalledWith("test-upstream-id");
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it("handles delete mutation error gracefully", async () => {
      mockDeleteMutateAsync.mockRejectedValueOnce(new Error("Delete failed"));

      render(<DeleteUpstreamDialog upstream={mockUpstream} open={true} onClose={mockOnClose} />);

      const deleteButton = screen.getByText("delete");
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(mockDeleteMutateAsync).toHaveBeenCalledWith("test-upstream-id");
      });

      // Should not close on error (error handled by mutation)
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe("Dialog State", () => {
    it("does not render when open is false", () => {
      render(<DeleteUpstreamDialog upstream={mockUpstream} open={false} onClose={mockOnClose} />);

      expect(screen.queryByText("deleteUpstreamTitle")).not.toBeInTheDocument();
    });
  });
});
