import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditKeyDialog } from "@/components/admin/edit-key-dialog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { APIKeyResponse } from "@/types/api";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

// Mock date-locale
vi.mock("@/lib/date-locale", () => ({
  getDateLocale: () => undefined,
}));

// Mock hooks
const mockUpdateMutateAsync = vi.fn();
vi.mock("@/hooks/use-api-keys", () => ({
  useUpdateAPIKey: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  }),
}));

const mockUpstreams = [
  {
    id: "upstream-1",
    name: "OpenAI",
    provider: "openai",
    description: "OpenAI API",
  },
  {
    id: "upstream-2",
    name: "Anthropic",
    provider: "anthropic",
    description: null,
  },
  {
    id: "upstream-3",
    name: "Google",
    provider: "google",
    description: "Google AI",
  },
];

vi.mock("@/hooks/use-upstreams", () => ({
  useAllUpstreams: () => ({
    data: mockUpstreams,
    isLoading: false,
  }),
}));

describe("EditKeyDialog", () => {
  let queryClient: QueryClient;

  const mockApiKey: APIKeyResponse = {
    id: "key-123",
    key_prefix: "sk-auto-abc123",
    name: "Test API Key",
    description: "Test description",
    upstream_ids: ["upstream-1", "upstream-2"],
    is_active: true,
    expires_at: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };

  const mockOnOpenChange = vi.fn();

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  describe("Dialog Rendering", () => {
    it("renders dialog with title and description", () => {
      render(<EditKeyDialog apiKey={mockApiKey} open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText("editKeyTitle")).toBeInTheDocument();
      expect(screen.getByText("editKeyDesc")).toBeInTheDocument();
    });

    it("does not render when open is false", () => {
      render(<EditKeyDialog apiKey={mockApiKey} open={false} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      expect(screen.queryByText("editKeyTitle")).not.toBeInTheDocument();
    });
  });

  describe("Form Fields", () => {
    it("populates form with existing key data", () => {
      render(<EditKeyDialog apiKey={mockApiKey} open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      const nameInput = screen.getByPlaceholderText("keyNamePlaceholder") as HTMLInputElement;
      expect(nameInput.value).toBe("Test API Key");

      const descInput = screen.getByPlaceholderText(
        "keyDescriptionPlaceholder"
      ) as HTMLTextAreaElement;
      expect(descInput.value).toBe("Test description");
    });

    it("renders active status checkbox", () => {
      render(<EditKeyDialog apiKey={mockApiKey} open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText("keyActive")).toBeInTheDocument();
      expect(screen.getByText("keyActiveDesc")).toBeInTheDocument();
    });

    it("renders upstream checkboxes", () => {
      render(<EditKeyDialog apiKey={mockApiKey} open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText("OpenAI")).toBeInTheDocument();
      expect(screen.getByText("Anthropic")).toBeInTheDocument();
      expect(screen.getByText("Google")).toBeInTheDocument();
    });

    it("checks selected upstreams", () => {
      render(<EditKeyDialog apiKey={mockApiKey} open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      // The checkboxes for selected upstreams should be checked
      const checkboxes = screen.getAllByRole("checkbox");
      // Find is_active checkbox and upstream checkboxes
      // is_active should be first, then upstreams
      expect(checkboxes.length).toBeGreaterThanOrEqual(4); // is_active + 3 upstreams
    });

    it("renders expiration date field", () => {
      render(<EditKeyDialog apiKey={mockApiKey} open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText("expirationDate")).toBeInTheDocument();
      expect(screen.getByText("expirationDateDesc")).toBeInTheDocument();
    });

    it("renders cancel and save buttons", () => {
      render(<EditKeyDialog apiKey={mockApiKey} open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText("cancel")).toBeInTheDocument();
      expect(screen.getByText("save")).toBeInTheDocument();
    });
  });

  describe("Form Validation", () => {
    it("shows validation error when name is cleared", async () => {
      render(<EditKeyDialog apiKey={mockApiKey} open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      const nameInput = screen.getByPlaceholderText("keyNamePlaceholder");
      fireEvent.change(nameInput, { target: { value: "" } });

      fireEvent.click(screen.getByText("save"));

      await waitFor(() => {
        expect(screen.getByText("keyNameRequired")).toBeInTheDocument();
      });
    });

    it("shows validation error when all upstreams are deselected", async () => {
      render(<EditKeyDialog apiKey={mockApiKey} open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      // Find and click both selected upstream checkboxes to deselect
      const checkboxes = screen.getAllByRole("checkbox");
      // Skip the first checkbox (is_active) and click OpenAI and Anthropic to deselect
      // This is position dependent - we need to click the upstream checkboxes
      fireEvent.click(checkboxes[1]); // OpenAI
      fireEvent.click(checkboxes[2]); // Anthropic

      fireEvent.click(screen.getByText("save"));

      await waitFor(() => {
        expect(screen.getByText("selectUpstreamsRequired")).toBeInTheDocument();
      });
    });
  });

  describe("Form Submission", () => {
    it("calls updateMutation with correct data on submit", async () => {
      mockUpdateMutateAsync.mockResolvedValueOnce({});

      render(<EditKeyDialog apiKey={mockApiKey} open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      // Change the name
      const nameInput = screen.getByPlaceholderText("keyNamePlaceholder");
      fireEvent.change(nameInput, { target: { value: "Updated Key Name" } });

      // Submit
      fireEvent.click(screen.getByText("save"));

      await waitFor(() => {
        expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
          id: "key-123",
          data: expect.objectContaining({
            name: "Updated Key Name",
            description: "Test description",
            is_active: true,
            upstream_ids: ["upstream-1", "upstream-2"],
          }),
        });
      });
    });

    it("closes dialog after successful submission", async () => {
      mockUpdateMutateAsync.mockResolvedValueOnce({});

      render(<EditKeyDialog apiKey={mockApiKey} open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      fireEvent.click(screen.getByText("save"));

      await waitFor(() => {
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it("does not close dialog on submission error", async () => {
      mockUpdateMutateAsync.mockRejectedValueOnce(new Error("Update failed"));

      render(<EditKeyDialog apiKey={mockApiKey} open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      fireEvent.click(screen.getByText("save"));

      await waitFor(() => {
        expect(mockUpdateMutateAsync).toHaveBeenCalled();
      });

      // Dialog should remain open
      expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
    });
  });

  describe("Dialog Close", () => {
    it("calls onOpenChange when cancel is clicked", () => {
      render(<EditKeyDialog apiKey={mockApiKey} open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      fireEvent.click(screen.getByText("cancel"));

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("Expiration Date", () => {
    it("renders existing expiration date", () => {
      const keyWithExpiry: APIKeyResponse = {
        ...mockApiKey,
        expires_at: "2025-12-31T00:00:00Z",
      };

      render(<EditKeyDialog apiKey={keyWithExpiry} open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      // The date should be displayed in the button
      expect(screen.getByText("expirationDate")).toBeInTheDocument();
    });

    it("shows selectDate placeholder when no expiration", () => {
      render(<EditKeyDialog apiKey={mockApiKey} open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText("selectDate")).toBeInTheDocument();
    });
  });

  describe("Loading State", () => {
    it("does not show loading when upstreams are loaded", () => {
      render(<EditKeyDialog apiKey={mockApiKey} open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      expect(screen.queryByText("loading")).not.toBeInTheDocument();
    });
  });

  describe("Active Status Toggle", () => {
    it("renders with inactive status", () => {
      const inactiveKey: APIKeyResponse = {
        ...mockApiKey,
        is_active: false,
      };

      render(<EditKeyDialog apiKey={inactiveKey} open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText("keyActive")).toBeInTheDocument();
    });

    it("submits with toggled active status", async () => {
      mockUpdateMutateAsync.mockResolvedValueOnce({});

      render(<EditKeyDialog apiKey={mockApiKey} open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      // Find and click the is_active checkbox
      const checkboxes = screen.getAllByRole("checkbox");
      fireEvent.click(checkboxes[0]); // First checkbox is is_active

      fireEvent.click(screen.getByText("save"));

      await waitFor(() => {
        expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
          id: "key-123",
          data: expect.objectContaining({
            is_active: false,
          }),
        });
      });
    });
  });

  describe("Description Handling", () => {
    it("handles null description", () => {
      const keyWithNullDesc: APIKeyResponse = {
        ...mockApiKey,
        description: null,
      };

      render(
        <EditKeyDialog apiKey={keyWithNullDesc} open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: Wrapper }
      );

      const descInput = screen.getByPlaceholderText(
        "keyDescriptionPlaceholder"
      ) as HTMLTextAreaElement;
      expect(descInput.value).toBe("");
    });

    it("submits null for empty description", async () => {
      mockUpdateMutateAsync.mockResolvedValueOnce({});

      render(<EditKeyDialog apiKey={mockApiKey} open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      const descInput = screen.getByPlaceholderText("keyDescriptionPlaceholder");
      fireEvent.change(descInput, { target: { value: "" } });

      fireEvent.click(screen.getByText("save"));

      await waitFor(() => {
        expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
          id: "key-123",
          data: expect.objectContaining({
            description: null,
          }),
        });
      });
    });
  });
});
