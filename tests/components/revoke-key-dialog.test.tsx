import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RevokeKeyDialog } from "@/components/admin/revoke-key-dialog";
import type { APIKey } from "@/types/api";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock the useRevokeAPIKey hook
const mockRevokeMutateAsync = vi.fn();
vi.mock("@/hooks/use-api-keys", () => ({
  useRevokeAPIKey: () => ({
    mutateAsync: mockRevokeMutateAsync,
    isPending: false,
  }),
}));

describe("RevokeKeyDialog", () => {
  const mockApiKey: APIKey = {
    id: "test-key-id",
    key_prefix: "sk-auto-abc123def456",
    name: "Test API Key",
    description: "Test description",
    upstream_ids: ["upstream-1"],
    is_active: true,
    expires_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders nothing when apiKey is null", () => {
      const { container } = render(
        <RevokeKeyDialog apiKey={null} open={true} onClose={mockOnClose} />
      );

      expect(container.firstChild).toBeNull();
    });

    it("renders dialog when open with apiKey", () => {
      render(<RevokeKeyDialog apiKey={mockApiKey} open={true} onClose={mockOnClose} />);

      expect(screen.getByText("revokeKeyTitle")).toBeInTheDocument();
      expect(screen.getByText("revokeKeyDesc")).toBeInTheDocument();
    });

    it("displays API key details", () => {
      render(<RevokeKeyDialog apiKey={mockApiKey} open={true} onClose={mockOnClose} />);

      expect(screen.getByText("Test API Key")).toBeInTheDocument();
      expect(screen.getByText("sk-auto-abc123def456")).toBeInTheDocument();
      expect(screen.getByText("Test description")).toBeInTheDocument();
    });

    it("shows warning message", () => {
      render(<RevokeKeyDialog apiKey={mockApiKey} open={true} onClose={mockOnClose} />);

      expect(screen.getByText("revokeKeyWarning")).toBeInTheDocument();
    });

    it("renders cancel and revoke buttons", () => {
      render(<RevokeKeyDialog apiKey={mockApiKey} open={true} onClose={mockOnClose} />);

      expect(screen.getByText("cancel")).toBeInTheDocument();
      expect(screen.getByText("revoke")).toBeInTheDocument();
    });

    it("handles apiKey without description", () => {
      const keyNoDesc = { ...mockApiKey, description: null };
      render(<RevokeKeyDialog apiKey={keyNoDesc} open={true} onClose={mockOnClose} />);

      expect(screen.getByText("Test API Key")).toBeInTheDocument();
      // Description label should not be rendered
      const descLabels = screen.queryAllByText(/description/i);
      expect(descLabels.length).toBe(0);
    });
  });

  describe("Actions", () => {
    it("calls onClose when cancel button is clicked", () => {
      render(<RevokeKeyDialog apiKey={mockApiKey} open={true} onClose={mockOnClose} />);

      const cancelButton = screen.getByText("cancel");
      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("calls revoke mutation and closes when revoke is clicked", async () => {
      mockRevokeMutateAsync.mockResolvedValueOnce(undefined);

      render(<RevokeKeyDialog apiKey={mockApiKey} open={true} onClose={mockOnClose} />);

      const revokeButton = screen.getByText("revoke");
      fireEvent.click(revokeButton);

      await waitFor(() => {
        expect(mockRevokeMutateAsync).toHaveBeenCalledWith("test-key-id");
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it("handles revoke mutation error gracefully", async () => {
      mockRevokeMutateAsync.mockRejectedValueOnce(new Error("Revoke failed"));

      render(<RevokeKeyDialog apiKey={mockApiKey} open={true} onClose={mockOnClose} />);

      const revokeButton = screen.getByText("revoke");
      fireEvent.click(revokeButton);

      await waitFor(() => {
        expect(mockRevokeMutateAsync).toHaveBeenCalledWith("test-key-id");
      });

      // Should not close on error (error handled by mutation)
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe("Dialog State", () => {
    it("does not render when open is false", () => {
      render(<RevokeKeyDialog apiKey={mockApiKey} open={false} onClose={mockOnClose} />);

      expect(screen.queryByText("revokeKeyTitle")).not.toBeInTheDocument();
    });
  });
});
