import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShowKeyDialog } from "@/components/admin/show-key-dialog";
import type { APIKeyCreateResponse } from "@/types/api";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock sonner toast
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (msg: string) => mockToastSuccess(msg),
    error: (msg: string) => mockToastError(msg),
  },
}));

// Mock clipboard
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};
Object.assign(navigator, { clipboard: mockClipboard });

describe("ShowKeyDialog", () => {
  const mockApiKey: APIKeyCreateResponse = {
    id: "test-key-id",
    key_value: "sk-auto-fullkeyfullkeyfullkey123456789012",
    key_prefix: "sk-auto-full",
    name: "New API Key",
    description: "This is a test key",
    upstream_ids: ["upstream-1"],
    is_active: true,
    expires_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Rendering", () => {
    it("renders dialog when open", () => {
      render(<ShowKeyDialog apiKey={mockApiKey} open={true} onClose={mockOnClose} />);

      expect(screen.getByText("keyCreated")).toBeInTheDocument();
      // keyCreatedDesc appears in both description and warning
      expect(screen.getAllByText("keyCreatedDesc").length).toBeGreaterThanOrEqual(1);
    });

    it("displays full API key value", () => {
      render(<ShowKeyDialog apiKey={mockApiKey} open={true} onClose={mockOnClose} />);

      expect(screen.getByText("sk-auto-fullkeyfullkeyfullkey123456789012")).toBeInTheDocument();
    });

    it("displays key name and prefix", () => {
      render(<ShowKeyDialog apiKey={mockApiKey} open={true} onClose={mockOnClose} />);

      expect(screen.getByText("New API Key")).toBeInTheDocument();
      expect(screen.getByText("sk-auto-full")).toBeInTheDocument();
    });

    it("displays description when present", () => {
      render(<ShowKeyDialog apiKey={mockApiKey} open={true} onClose={mockOnClose} />);

      expect(screen.getByText("This is a test key")).toBeInTheDocument();
    });

    it("hides description section when not present", () => {
      const keyNoDesc = { ...mockApiKey, description: null };
      render(<ShowKeyDialog apiKey={keyNoDesc} open={true} onClose={mockOnClose} />);

      expect(screen.queryByText("This is a test key")).not.toBeInTheDocument();
    });

    it("renders copy button", () => {
      render(<ShowKeyDialog apiKey={mockApiKey} open={true} onClose={mockOnClose} />);

      // Copy button should be present (icon button)
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });

    it("renders close button", () => {
      render(<ShowKeyDialog apiKey={mockApiKey} open={true} onClose={mockOnClose} />);

      expect(screen.getByText("close")).toBeInTheDocument();
    });

    it("shows warning message", () => {
      render(<ShowKeyDialog apiKey={mockApiKey} open={true} onClose={mockOnClose} />);

      // Warning shows keyCreatedDesc message
      const warnings = screen.getAllByText("keyCreatedDesc");
      expect(warnings.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Copy Functionality", () => {
    it("copies key to clipboard when copy button clicked", async () => {
      render(<ShowKeyDialog apiKey={mockApiKey} open={true} onClose={mockOnClose} />);

      // Copy button now has aria-label for accessibility
      const copyButton = screen.getByRole("button", { name: "copyKey" });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalledWith(
          "sk-auto-fullkeyfullkeyfullkey123456789012"
        );
      });
    });

    it("shows success toast after copy", async () => {
      render(<ShowKeyDialog apiKey={mockApiKey} open={true} onClose={mockOnClose} />);

      const copyButton = screen.getByRole("button", { name: "copyKey" });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith("keyCopied");
      });
    });

    it("shows error toast when copy fails", async () => {
      mockClipboard.writeText.mockRejectedValueOnce(new Error("Copy failed"));

      render(<ShowKeyDialog apiKey={mockApiKey} open={true} onClose={mockOnClose} />);

      const copyButton = screen.getByRole("button", { name: "copyKey" });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith("error");
      });
    });
  });

  describe("Actions", () => {
    it("calls onClose when close button is clicked", () => {
      render(<ShowKeyDialog apiKey={mockApiKey} open={true} onClose={mockOnClose} />);

      const closeButton = screen.getByText("close");
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("Dialog State", () => {
    it("does not render when open is false", () => {
      render(<ShowKeyDialog apiKey={mockApiKey} open={false} onClose={mockOnClose} />);

      expect(screen.queryByText("keyCreated")).not.toBeInTheDocument();
    });
  });
});
