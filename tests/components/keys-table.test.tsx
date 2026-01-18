import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { KeysTable } from "@/components/admin/keys-table";
import type { APIKey } from "@/types/api";

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

// Mock the useRevealAPIKey hook
const mockRevealKey = vi.fn();
vi.mock("@/hooks/use-api-keys", () => ({
  useRevealAPIKey: () => ({
    mutateAsync: mockRevealKey,
    isPending: false,
  }),
}));

// Mock clipboard
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};
Object.assign(navigator, { clipboard: mockClipboard });

describe("KeysTable", () => {
  // Fixed timestamp for consistent testing
  const FIXED_NOW = new Date("2024-06-15T12:00:00Z").getTime();

  const mockKey: APIKey = {
    id: "test-id-1",
    key_prefix: "sk-auto-abc123def456",
    name: "Test API Key",
    description: "Test description",
    upstream_ids: ["upstream-1", "upstream-2"],
    is_active: true,
    expires_at: null,
    created_at: "2024-06-01T10:00:00Z",
    updated_at: "2024-06-01T10:00:00Z",
  };

  const mockOnRevoke = vi.fn();
  const mockOnEdit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Use fake timers with shouldAdvanceTime for async operations compatibility
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Empty State", () => {
    it("renders empty state when no keys provided", () => {
      render(<KeysTable keys={[]} onRevoke={mockOnRevoke} onEdit={mockOnEdit} />);

      expect(screen.getByText("noKeys")).toBeInTheDocument();
      expect(screen.getByText("noKeysDesc")).toBeInTheDocument();
    });

    it("shows Key icon in empty state", () => {
      render(<KeysTable keys={[]} onRevoke={mockOnRevoke} onEdit={mockOnEdit} />);

      const emptyContainer = screen.getByText("noKeys").closest("div");
      expect(emptyContainer).toBeInTheDocument();
    });
  });

  describe("Table Rendering", () => {
    it("renders table headers", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} onEdit={mockOnEdit} />);

      expect(screen.getByText("name")).toBeInTheDocument();
      expect(screen.getByText("tableKeyPrefix")).toBeInTheDocument();
      expect(screen.getByText("description")).toBeInTheDocument();
      expect(screen.getByText("tableUpstreams")).toBeInTheDocument();
      expect(screen.getByText("tableExpires")).toBeInTheDocument();
      expect(screen.getByText("createdAt")).toBeInTheDocument();
      expect(screen.getByText("actions")).toBeInTheDocument();
    });

    it("renders key data correctly", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} onEdit={mockOnEdit} />);

      expect(screen.getByText("Test API Key")).toBeInTheDocument();
      expect(screen.getByText("Test description")).toBeInTheDocument();
    });

    it("masks long key prefix", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} onEdit={mockOnEdit} />);

      // Key should be masked: first 8 chars + *** + last 4 chars
      expect(screen.getByText("sk-auto-***f456")).toBeInTheDocument();
    });

    it("shows upstream count badge", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} onEdit={mockOnEdit} />);

      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });

  describe("Expiry Formatting", () => {
    it("renders never expires badge for null expiry", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} onEdit={mockOnEdit} />);

      expect(screen.getByText("neverExpires")).toBeInTheDocument();
    });

    it("renders expired badge for past expiry date", () => {
      const expiredKey = {
        ...mockKey,
        expires_at: "2024-06-14T12:00:00Z", // Yesterday relative to FIXED_NOW
      };
      render(<KeysTable keys={[expiredKey]} onRevoke={mockOnRevoke} onEdit={mockOnEdit} />);

      expect(screen.getByText("expired")).toBeInTheDocument();
    });

    it("renders relative time for future expiry date", () => {
      const futureKey = {
        ...mockKey,
        expires_at: "2024-06-22T12:00:00Z", // 7 days from FIXED_NOW
      };
      render(<KeysTable keys={[futureKey]} onRevoke={mockOnRevoke} onEdit={mockOnEdit} />);

      // With fixed time, we can assert specific relative time
      // date-fns formatDistanceToNow should return "7 days" or similar
      const table = screen.getByRole("table");
      expect(table).toBeInTheDocument();
      // Check the expiry cell doesn't show "expired" or "neverExpires"
      expect(screen.queryByText("expired")).not.toBeInTheDocument();
      expect(screen.queryByText("neverExpires")).not.toBeInTheDocument();
    });
  });

  describe("Key Visibility Toggle", () => {
    it("shows eye icon for hidden key", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} onEdit={mockOnEdit} />);

      const revealButton = screen.getByLabelText("revealKey");
      expect(revealButton).toBeInTheDocument();
    });

    it("calls revealKey when toggle is clicked", async () => {
      mockRevealKey.mockResolvedValueOnce({ key_value: "sk-auto-fullkey123" });
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} onEdit={mockOnEdit} />);

      const revealButton = screen.getByLabelText("revealKey");
      fireEvent.click(revealButton);

      await waitFor(() => {
        expect(mockRevealKey).toHaveBeenCalledWith("test-id-1");
      });
    });

    it("shows full key after reveal", async () => {
      mockRevealKey.mockResolvedValueOnce({ key_value: "sk-auto-fullkey123" });
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} onEdit={mockOnEdit} />);

      const revealButton = screen.getByLabelText("revealKey");
      fireEvent.click(revealButton);

      await waitFor(() => {
        expect(screen.getByText("sk-auto-fullkey123")).toBeInTheDocument();
      });
    });
  });

  describe("Copy Key", () => {
    it("shows copy icon", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} onEdit={mockOnEdit} />);

      const copyButton = screen.getByLabelText("copy");
      expect(copyButton).toBeInTheDocument();
    });

    it("calls clipboard writeText when copy is clicked", async () => {
      mockRevealKey.mockResolvedValueOnce({ key_value: "sk-auto-secret" });
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} onEdit={mockOnEdit} />);

      const copyButton = screen.getByLabelText("copy");
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalledWith("sk-auto-secret");
      });
    });
  });

  describe("Revoke Action", () => {
    it("shows delete button for each key", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} onEdit={mockOnEdit} />);

      const deleteButton = screen.getByLabelText("revokeKey: Test API Key");
      expect(deleteButton).toBeInTheDocument();
    });

    it("calls onRevoke when delete button is clicked", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} onEdit={mockOnEdit} />);

      const deleteButton = screen.getByLabelText("revokeKey: Test API Key");
      fireEvent.click(deleteButton);

      expect(mockOnRevoke).toHaveBeenCalledWith(mockKey);
    });
  });

  describe("Multiple Keys", () => {
    it("renders multiple keys correctly", () => {
      const keys = [
        mockKey,
        {
          ...mockKey,
          id: "test-id-2",
          name: "Second API Key",
          key_prefix: "sk-auto-xyz789abc123",
        },
      ];
      render(<KeysTable keys={keys} onRevoke={mockOnRevoke} onEdit={mockOnEdit} />);

      expect(screen.getByText("Test API Key")).toBeInTheDocument();
      expect(screen.getByText("Second API Key")).toBeInTheDocument();
    });
  });

  describe("Null Description", () => {
    it("renders dash for null description", () => {
      const keyWithNoDesc = { ...mockKey, description: null };
      render(<KeysTable keys={[keyWithNoDesc]} onRevoke={mockOnRevoke} onEdit={mockOnEdit} />);

      const dashes = screen.getAllByText("-");
      expect(dashes.length).toBeGreaterThan(0);
    });
  });

  describe("Short Key Prefix", () => {
    it("does not mask short key prefix", () => {
      const shortKey = { ...mockKey, key_prefix: "sk-short" };
      render(<KeysTable keys={[shortKey]} onRevoke={mockOnRevoke} onEdit={mockOnEdit} />);

      // Short keys (< 12 chars) should not be masked
      expect(screen.getByText("sk-short")).toBeInTheDocument();
    });
  });

  describe("Edit Action", () => {
    it("shows edit button for each key", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} onEdit={mockOnEdit} />);

      const editButton = screen.getByLabelText("editKey: Test API Key");
      expect(editButton).toBeInTheDocument();
    });

    it("calls onEdit when edit button is clicked", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} onEdit={mockOnEdit} />);

      const editButton = screen.getByLabelText("editKey: Test API Key");
      fireEvent.click(editButton);

      expect(mockOnEdit).toHaveBeenCalledWith(mockKey);
    });
  });
});
