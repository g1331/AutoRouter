import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { KeysTable } from "@/components/admin/keys-table";
import type { APIKey } from "@/types/api";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

// The row Edit action navigates to the /keys/[id] detail page via the localized
// Link; render it as a plain anchor so its href can be asserted.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
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

import { toast } from "sonner";
const mockToastError = toast.error as ReturnType<typeof vi.fn>;

// Mock the useRevealAPIKey hook
const mockRevealKey = vi.fn();
const mockToggleKeyActive = vi.fn();
vi.mock("@/hooks/use-api-keys", () => ({
  useRevealAPIKey: () => ({
    mutateAsync: mockRevealKey,
    isPending: false,
  }),
  useToggleAPIKeyActive: () => ({
    mutateAsync: mockToggleKeyActive,
    isPending: false,
    variables: undefined,
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
    access_mode: "restricted",
    upstream_ids: ["upstream-1", "upstream-2"],
    allowed_models: null,
    spending_rules: null,
    spending_rule_statuses: [],
    is_quota_exceeded: false,
    is_active: true,
    expires_at: null,
    created_at: "2024-06-01T10:00:00Z",
    updated_at: "2024-06-01T10:00:00Z",
  };

  const mockOnRevoke = vi.fn();

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
      render(<KeysTable keys={[]} onRevoke={mockOnRevoke} />);

      expect(screen.getByText("noKeys")).toBeInTheDocument();
      expect(screen.getByText("noKeysDesc")).toBeInTheDocument();
    });

    it("shows Key icon in empty state", () => {
      render(<KeysTable keys={[]} onRevoke={mockOnRevoke} />);

      const emptyContainer = screen.getByText("noKeys").closest("div");
      expect(emptyContainer).toBeInTheDocument();
    });
  });

  describe("Table Rendering", () => {
    it("renders table headers", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} />);

      expect(screen.getByText("name")).toBeInTheDocument();
      expect(screen.getByText("tableKeyPrefix")).toBeInTheDocument();
      expect(screen.getByText("description")).toBeInTheDocument();
      expect(screen.getByText("tableUpstreams")).toBeInTheDocument();
      expect(screen.getByText("tableExpires")).toBeInTheDocument();
      expect(screen.getByText("createdAt")).toBeInTheDocument();
      expect(screen.getByText("actions")).toBeInTheDocument();
    });

    it("keeps key prefix column width fixed to avoid table jitter", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} />);

      const keyPrefixHeader = screen.getByText("tableKeyPrefix").closest("th");
      expect(keyPrefixHeader?.className).toContain("w-[22rem]");
      expect(keyPrefixHeader?.className).toContain("max-w-[22rem]");
    });

    it("renders key data correctly", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} />);

      expect(screen.getByText("Test API Key")).toBeInTheDocument();
      expect(screen.getByText("Test description")).toBeInTheDocument();
    });

    it("shows enabled badge for active key", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} />);

      expect(screen.getAllByText("enabled").length).toBeGreaterThan(0);
    });

    it("masks long key prefix", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} />);

      // Key should be masked: first 8 chars + *** + last 4 chars
      expect(screen.getByText("sk-auto-***f456")).toBeInTheDocument();
    });

    it("shows restricted access badge", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} />);

      expect(screen.getByText("restrictedAccessCount")).toBeInTheDocument();
    });

    it("shows unrestricted badge when key can access all upstreams", () => {
      render(
        <KeysTable
          keys={[{ ...mockKey, access_mode: "unrestricted", upstream_ids: [], allowed_models: [] }]}
          onRevoke={mockOnRevoke}
        />
      );

      expect(screen.getByText("unrestrictedAccess")).toBeInTheDocument();
    });

    it("renders rule-level quota status when spending data is present", () => {
      render(
        <KeysTable
          keys={[
            {
              ...mockKey,
              spending_rules: [{ period_type: "rolling", limit: 20, period_hours: 6 }],
              spending_rule_statuses: [
                {
                  period_type: "rolling",
                  period_hours: 6,
                  current_spending: 22,
                  spending_limit: 20,
                  percent_used: 110,
                  is_exceeded: true,
                  resets_at: null,
                  estimated_recovery_at: "2024-06-15T18:00:00Z",
                },
              ],
              is_quota_exceeded: true,
            },
          ]}
          onRevoke={mockOnRevoke}
        />
      );

      // quotaExceeded badge shown in collapsed row
      expect(screen.getAllByText("quotaExceeded").length).toBeGreaterThan(0);

      // Click to expand the quota details
      const nameCell = screen.getByText("Test API Key").closest("td")!;
      fireEvent.click(nameCell);

      expect(screen.getByText("110.0%")).toBeInTheDocument();
      expect(screen.getByText("quotaRecoveryTime")).toBeInTheDocument();
    });
  });

  describe("Expiry Formatting", () => {
    it("renders never expires badge for null expiry", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} />);

      expect(screen.getByText("neverExpires")).toBeInTheDocument();
    });

    it("renders expired badge for past expiry date", () => {
      const expiredKey = {
        ...mockKey,
        expires_at: "2024-06-14T12:00:00Z", // Yesterday relative to FIXED_NOW
      };
      render(<KeysTable keys={[expiredKey]} onRevoke={mockOnRevoke} />);

      expect(screen.getByText("expired")).toBeInTheDocument();
    });

    it("renders relative time for future expiry date", () => {
      const futureKey = {
        ...mockKey,
        expires_at: "2024-06-22T12:00:00Z", // 7 days from FIXED_NOW
      };
      render(<KeysTable keys={[futureKey]} onRevoke={mockOnRevoke} />);

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
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} />);

      const revealButton = screen.getByLabelText("revealKey");
      expect(revealButton).toBeInTheDocument();
    });

    it("calls revealKey when toggle is clicked", async () => {
      mockRevealKey.mockResolvedValueOnce({ key_value: "sk-auto-fullkey123" });
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} />);

      const revealButton = screen.getByLabelText("revealKey");
      fireEvent.click(revealButton);

      await waitFor(() => {
        expect(mockRevealKey).toHaveBeenCalledWith("test-id-1");
      });
    });

    it("shows full key after reveal", async () => {
      mockRevealKey.mockResolvedValueOnce({ key_value: "sk-auto-fullkey123" });
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} />);

      const revealButton = screen.getByLabelText("revealKey");
      fireEvent.click(revealButton);

      await waitFor(() => {
        expect(screen.getByText("sk-auto-fullkey123")).toBeInTheDocument();
      });

      const revealedCode = screen.getByText("sk-auto-fullkey123").closest("code");
      expect(revealedCode?.className).toContain("whitespace-nowrap");
      expect(revealedCode?.className).toContain("overflow-x-auto");
      expect(revealedCode?.className).not.toContain("break-all");
      expect(revealedCode?.className).not.toContain("truncate");
    });

    it("hides revealed key when toggled again without re-fetching", async () => {
      mockRevealKey.mockResolvedValueOnce({ key_value: "sk-auto-fullkey123" });
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} />);

      const revealButton = screen.getByLabelText("revealKey");
      fireEvent.click(revealButton);

      await waitFor(() => {
        expect(screen.getByText("sk-auto-fullkey123")).toBeInTheDocument();
      });
      expect(mockRevealKey).toHaveBeenCalledTimes(1);

      const hideButton = screen.getByLabelText("hideKey");
      fireEvent.click(hideButton);

      await waitFor(() => {
        expect(screen.queryByText("sk-auto-fullkey123")).not.toBeInTheDocument();
      });
      expect(screen.getByText("sk-auto-***f456")).toBeInTheDocument();
      expect(mockRevealKey).toHaveBeenCalledTimes(1);
    });
  });

  describe("Copy Key", () => {
    it("shows copy icon", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} />);

      const copyButton = screen.getByLabelText("copy");
      expect(copyButton).toBeInTheDocument();
    });

    it("calls clipboard writeText when copy is clicked", async () => {
      mockRevealKey.mockResolvedValueOnce({ key_value: "sk-auto-secret" });
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} />);

      const copyButton = screen.getByLabelText("copy");
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalledWith("sk-auto-secret");
      });
    });

    it("shows error toast when clipboard writeText fails (without re-revealing)", async () => {
      mockRevealKey.mockResolvedValueOnce({ key_value: "sk-auto-secret" });
      mockClipboard.writeText.mockRejectedValueOnce(new Error("Clipboard denied"));

      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} />);

      fireEvent.click(screen.getByLabelText("revealKey"));

      await waitFor(() => {
        expect(screen.getByText("sk-auto-secret")).toBeInTheDocument();
      });
      expect(mockRevealKey).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByLabelText("copy"));

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith("error");
      });

      // Copy should use cached revealed key value, not call revealKey again.
      expect(mockRevealKey).toHaveBeenCalledTimes(1);
      expect(mockClipboard.writeText).toHaveBeenCalledWith("sk-auto-secret");
    });
  });

  describe("Revoke Action", () => {
    it("shows delete button for each key", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} />);

      const deleteButton = screen.getByLabelText("revokeKey: Test API Key");
      expect(deleteButton).toBeInTheDocument();
    });

    it("calls onRevoke when delete button is clicked", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} />);

      const deleteButton = screen.getByLabelText("revokeKey: Test API Key");
      fireEvent.click(deleteButton);

      expect(mockOnRevoke).toHaveBeenCalledWith(mockKey, expect.any(HTMLElement));
      // 容器变形动画需要源元素：表格行须带 data-morph-source 供按钮 closest 取到。
      const source = mockOnRevoke.mock.calls[0][1] as HTMLElement;
      expect(source.hasAttribute("data-morph-source")).toBe(true);
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
      render(<KeysTable keys={keys} onRevoke={mockOnRevoke} />);

      expect(screen.getByText("Test API Key")).toBeInTheDocument();
      expect(screen.getByText("Second API Key")).toBeInTheDocument();
    });
  });

  describe("Null Description", () => {
    it("renders dash for null description", () => {
      const keyWithNoDesc = { ...mockKey, description: null };
      render(<KeysTable keys={[keyWithNoDesc]} onRevoke={mockOnRevoke} />);

      const dashes = screen.getAllByText("-");
      expect(dashes.length).toBeGreaterThan(0);
    });
  });

  describe("Short Key Prefix", () => {
    it("does not mask short key prefix", () => {
      const shortKey = { ...mockKey, key_prefix: "sk-short" };
      render(<KeysTable keys={[shortKey]} onRevoke={mockOnRevoke} />);

      // Short keys (< 12 chars) should not be masked
      expect(screen.getByText("sk-short")).toBeInTheDocument();
    });
  });

  describe("Edit Action", () => {
    it("shows edit link for each key", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} />);

      const editLink = screen.getByLabelText("editKey: Test API Key");
      expect(editLink).toBeInTheDocument();
    });

    it("navigates to the key detail page instead of opening a dialog", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} />);

      const editLink = screen.getByLabelText("editKey: Test API Key");
      expect(editLink.tagName).toBe("A");
      expect(editLink).toHaveAttribute("href", `/keys/${mockKey.id}`);
    });
  });

  describe("Search Functionality", () => {
    const mockKeys: APIKey[] = [
      {
        id: "key-1",
        key_prefix: "sk-auto-abc123def456",
        name: "Production API Key",
        description: "Production environment",
        access_mode: "restricted",
        upstream_ids: ["upstream-1"],
        allowed_models: null,
        is_active: true,
        expires_at: null,
        created_at: "2024-06-01T10:00:00Z",
        updated_at: "2024-06-01T10:00:00Z",
      },
      {
        id: "key-2",
        key_prefix: "sk-auto-xyz789ghi012",
        name: "Development API Key",
        description: "Development environment",
        access_mode: "restricted",
        upstream_ids: ["upstream-2"],
        allowed_models: null,
        is_active: true,
        expires_at: null,
        created_at: "2024-06-02T10:00:00Z",
        updated_at: "2024-06-02T10:00:00Z",
      },
      {
        id: "key-3",
        key_prefix: "sk-auto-jkl345mno678",
        name: "Testing Key",
        description: "For testing purposes",
        access_mode: "restricted",
        upstream_ids: ["upstream-3"],
        allowed_models: null,
        is_active: true,
        expires_at: null,
        created_at: "2024-06-03T10:00:00Z",
        updated_at: "2024-06-03T10:00:00Z",
      },
    ];

    it("renders search input field", () => {
      render(<KeysTable keys={mockKeys} onRevoke={mockOnRevoke} />);

      const searchInput = screen.getByPlaceholderText("searchKeys");
      expect(searchInput).toBeInTheDocument();
      expect(searchInput).toHaveAttribute("type", "text");
    });

    it("renders all provided keys regardless of local input (filtering is server-side)", () => {
      render(<KeysTable keys={mockKeys} onRevoke={mockOnRevoke} />);

      const searchInput = screen.getByPlaceholderText("searchKeys");
      fireEvent.change(searchInput, { target: { value: "production" } });

      // The table shows whatever page the server returned; typing alone
      // must not narrow it locally.
      expect(screen.getByText("Production API Key")).toBeInTheDocument();
      expect(screen.getByText("Development API Key")).toBeInTheDocument();
      expect(screen.getByText("Testing Key")).toBeInTheDocument();
    });

    it("debounces typed input up to onSearchQueryChange", async () => {
      const onSearchQueryChange = vi.fn();
      render(
        <KeysTable
          keys={mockKeys}
          onRevoke={mockOnRevoke}
          onSearchQueryChange={onSearchQueryChange}
        />
      );

      const searchInput = screen.getByPlaceholderText("searchKeys");
      fireEvent.change(searchInput, { target: { value: "p" } });
      fireEvent.change(searchInput, { target: { value: "pr" } });
      fireEvent.change(searchInput, { target: { value: " prod " } });

      // Debounced: not called synchronously.
      expect(onSearchQueryChange).not.toHaveBeenCalled();

      await waitFor(() => expect(onSearchQueryChange).toHaveBeenCalledWith("prod"));
      // Intermediate keystrokes are coalesced into the final value.
      expect(onSearchQueryChange).toHaveBeenCalledTimes(1);
    });

    it("shows no results state when the server returns no matches for a search", () => {
      render(<KeysTable keys={[]} onRevoke={mockOnRevoke} searchQuery="nonexistent" />);

      // Should show no results message
      expect(screen.getByText("noKeysFound")).toBeInTheDocument();
      expect(screen.getByText("noKeysFoundDesc")).toBeInTheDocument();

      // Should not show any keys
      expect(screen.queryByText("Production API Key")).not.toBeInTheDocument();
    });

    it("maintains search input when showing no results", () => {
      render(<KeysTable keys={[]} onRevoke={mockOnRevoke} searchQuery="nonexistent" />);

      // Search input should still be visible and contain the search query
      const searchInput = screen.getByPlaceholderText("searchKeys");
      expect(searchInput).toBeInTheDocument();
      expect(searchInput).toHaveValue("nonexistent");
    });

    it("search input has correct styling class", () => {
      render(<KeysTable keys={mockKeys} onRevoke={mockOnRevoke} />);

      const searchInput = screen.getByPlaceholderText("searchKeys");
      expect(searchInput).toHaveClass("max-w-sm");
    });
  });

  describe("Owner Scope", () => {
    it("renders no scope switch when the parent does not handle scope changes", () => {
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} />);

      expect(screen.queryByRole("group", { name: "ownerScopeLabel" })).not.toBeInTheDocument();
    });

    it("marks the active scope and reports a switch to all keys", () => {
      const onOwnerScopeChange = vi.fn();
      render(
        <KeysTable
          keys={[mockKey]}
          onRevoke={mockOnRevoke}
          ownerScope="unowned"
          onOwnerScopeChange={onOwnerScopeChange}
        />
      );

      expect(screen.getByRole("button", { name: "ownerScopeUnowned" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );

      fireEvent.click(screen.getByRole("button", { name: "ownerScopeAll" }));
      expect(onOwnerScopeChange).toHaveBeenCalledWith("all");
    });

    it("labels the owner of a member-owned key and leaves unowned keys unlabeled", () => {
      const { rerender } = render(
        <KeysTable
          keys={[{ ...mockKey, user_id: "user-1", user_name: "Alice" }]}
          onRevoke={mockOnRevoke}
        />
      );

      expect(screen.getByText("Alice")).toBeInTheDocument();

      rerender(
        <KeysTable
          keys={[{ ...mockKey, user_id: null, user_name: null }]}
          onRevoke={mockOnRevoke}
        />
      );
      expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    });
  });

  describe("Active Toggle", () => {
    it("calls toggle mutation when toggle button is clicked", async () => {
      mockToggleKeyActive.mockResolvedValueOnce(undefined);
      render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} />);

      const toggleButton = screen.getByLabelText("quickDisable: Test API Key");
      fireEvent.click(toggleButton);

      await waitFor(() => {
        expect(mockToggleKeyActive).toHaveBeenCalledWith({ id: "test-id-1", nextActive: false });
      });
    });
  });

  describe("Mobile Layout", () => {
    it("renders mobile cards when matchMedia matches and cleans up listener", async () => {
      const originalMatchMedia = window.matchMedia;

      const addListener = vi.fn();
      const removeListener = vi.fn();
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: () => ({
          matches: true,
          addEventListener: addListener,
          removeEventListener: removeListener,
        }),
      });

      mockToggleKeyActive.mockResolvedValueOnce(undefined);

      const { unmount } = render(<KeysTable keys={[mockKey]} onRevoke={mockOnRevoke} />);

      // Mobile layout should not render a table, and should include mobile-labeled actions.
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(screen.getByLabelText("revealKey (mobile)")).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText("quickDisable: Test API Key (mobile)"));

      await waitFor(() => {
        expect(mockToggleKeyActive).toHaveBeenCalledWith({ id: "test-id-1", nextActive: false });
      });

      unmount();
      expect(addListener).toHaveBeenCalled();
      expect(removeListener).toHaveBeenCalled();

      Object.defineProperty(window, "matchMedia", { writable: true, value: originalMatchMedia });
    });
  });
});
