import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UpstreamFormDialog, CreateUpstreamButton } from "@/components/admin/upstream-form-dialog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Upstream } from "@/types/api";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock hooks
const mockCreateMutateAsync = vi.fn();
const mockUpdateMutateAsync = vi.fn();

vi.mock("@/hooks/use-upstreams", () => ({
  useCreateUpstream: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
  }),
  useUpdateUpstream: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  }),
}));

describe("UpstreamFormDialog", () => {
  let queryClient: QueryClient;

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const mockOnOpenChange = vi.fn();

  const mockUpstream: Upstream = {
    id: "upstream-1",
    name: "OpenAI Production",
    provider: "openai",
    base_url: "https://api.openai.com/v1",
    description: "Production OpenAI API",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  describe("Create Mode", () => {
    it("renders create dialog title when no upstream provided", () => {
      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText("createUpstreamTitle")).toBeInTheDocument();
    });

    it("renders all form fields", () => {
      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByPlaceholderText("upstreamNamePlaceholder")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("baseUrlPlaceholder")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("apiKeyPlaceholder")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("upstreamDescriptionPlaceholder")).toBeInTheDocument();
    });

    it("renders provider select with options", () => {
      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      // Provider select trigger should be visible
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    it("renders cancel and create buttons", () => {
      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText("cancel")).toBeInTheDocument();
      expect(screen.getByText("create")).toBeInTheDocument();
    });

    it("shows validation errors when submitting empty form", async () => {
      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      const submitButton = screen.getByText("create");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("upstreamNameRequired")).toBeInTheDocument();
      });
    });

    it("shows validation error when api key is empty", async () => {
      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      const nameInput = screen.getByPlaceholderText("upstreamNamePlaceholder");
      const urlInput = screen.getByPlaceholderText("baseUrlPlaceholder");

      fireEvent.change(nameInput, { target: { value: "Test Upstream" } });
      fireEvent.change(urlInput, { target: { value: "https://api.example.com/v1" } });
      // Don't fill api key

      const submitButton = screen.getByText("create");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("apiKeyRequired")).toBeInTheDocument();
      });
    });

    it("calls createMutation on valid form submission", async () => {
      mockCreateMutateAsync.mockResolvedValueOnce({});

      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      const nameInput = screen.getByPlaceholderText("upstreamNamePlaceholder");
      const urlInput = screen.getByPlaceholderText("baseUrlPlaceholder");
      const apiKeyInput = screen.getByPlaceholderText("apiKeyPlaceholder");

      fireEvent.change(nameInput, { target: { value: "New Upstream" } });
      fireEvent.change(urlInput, { target: { value: "https://api.example.com/v1" } });
      fireEvent.change(apiKeyInput, { target: { value: "sk-test-key" } });

      const submitButton = screen.getByText("create");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalledWith({
          name: "New Upstream",
          provider: "openai",
          base_url: "https://api.example.com/v1",
          api_key: "sk-test-key",
          description: null,
        });
      });
    });

    it("closes dialog on successful creation", async () => {
      mockCreateMutateAsync.mockResolvedValueOnce({});

      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      const nameInput = screen.getByPlaceholderText("upstreamNamePlaceholder");
      const urlInput = screen.getByPlaceholderText("baseUrlPlaceholder");
      const apiKeyInput = screen.getByPlaceholderText("apiKeyPlaceholder");

      fireEvent.change(nameInput, { target: { value: "New Upstream" } });
      fireEvent.change(urlInput, { target: { value: "https://api.example.com/v1" } });
      fireEvent.change(apiKeyInput, { target: { value: "sk-test-key" } });

      const submitButton = screen.getByText("create");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });

  describe("Edit Mode", () => {
    it("renders edit dialog title when upstream provided", () => {
      render(
        <UpstreamFormDialog upstream={mockUpstream} open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: Wrapper }
      );

      expect(screen.getByText("editUpstreamTitle")).toBeInTheDocument();
    });

    it("pre-fills form with upstream data", () => {
      render(
        <UpstreamFormDialog upstream={mockUpstream} open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: Wrapper }
      );

      expect(screen.getByDisplayValue("OpenAI Production")).toBeInTheDocument();
      expect(screen.getByDisplayValue("https://api.openai.com/v1")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Production OpenAI API")).toBeInTheDocument();
    });

    it("renders save button in edit mode", () => {
      render(
        <UpstreamFormDialog upstream={mockUpstream} open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: Wrapper }
      );

      expect(screen.getByText("save")).toBeInTheDocument();
    });

    it("shows api key edit hint in edit mode", () => {
      render(
        <UpstreamFormDialog upstream={mockUpstream} open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: Wrapper }
      );

      expect(screen.getByText("apiKeyEditHint")).toBeInTheDocument();
    });

    it("calls updateMutation on valid form submission", async () => {
      mockUpdateMutateAsync.mockResolvedValueOnce({});

      render(
        <UpstreamFormDialog upstream={mockUpstream} open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: Wrapper }
      );

      const nameInput = screen.getByDisplayValue("OpenAI Production");
      const apiKeyInput = screen.getByPlaceholderText("apiKeyPlaceholder");

      fireEvent.change(nameInput, { target: { value: "Updated Name" } });
      fireEvent.change(apiKeyInput, { target: { value: "sk-new-key" } });

      const submitButton = screen.getByText("save");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
          id: "upstream-1",
          data: {
            name: "Updated Name",
            provider: "openai",
            base_url: "https://api.openai.com/v1",
            api_key: "sk-new-key",
            description: "Production OpenAI API",
          },
        });
      });
    });
  });

  describe("Dialog Actions", () => {
    it("calls onOpenChange when cancel is clicked", () => {
      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      const cancelButton = screen.getByText("cancel");
      fireEvent.click(cancelButton);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it("does not render content when closed", () => {
      render(<UpstreamFormDialog open={false} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      expect(screen.queryByText("createUpstreamTitle")).not.toBeInTheDocument();
    });
  });

  describe("With Trigger", () => {
    it("renders custom trigger", () => {
      render(
        <UpstreamFormDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          trigger={<button>Custom Trigger</button>}
        />,
        { wrapper: Wrapper }
      );

      expect(screen.getByText("Custom Trigger")).toBeInTheDocument();
    });
  });

  describe("Form Reset", () => {
    it("resets form when dialog closes", () => {
      const { rerender } = render(
        <UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: Wrapper }
      );

      const nameInput = screen.getByPlaceholderText("upstreamNamePlaceholder");
      fireEvent.change(nameInput, { target: { value: "Test Name" } });

      expect(screen.getByDisplayValue("Test Name")).toBeInTheDocument();

      rerender(
        <Wrapper>
          <UpstreamFormDialog open={false} onOpenChange={mockOnOpenChange} />
        </Wrapper>
      );

      rerender(
        <Wrapper>
          <UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />
        </Wrapper>
      );

      // After reopening, form should be reset
      expect(screen.queryByDisplayValue("Test Name")).not.toBeInTheDocument();
    });
  });

  describe("Error Handling", () => {
    it("handles create mutation error gracefully", async () => {
      mockCreateMutateAsync.mockRejectedValueOnce(new Error("Create failed"));

      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      const nameInput = screen.getByPlaceholderText("upstreamNamePlaceholder");
      const urlInput = screen.getByPlaceholderText("baseUrlPlaceholder");
      const apiKeyInput = screen.getByPlaceholderText("apiKeyPlaceholder");

      fireEvent.change(nameInput, { target: { value: "New Upstream" } });
      fireEvent.change(urlInput, { target: { value: "https://api.example.com/v1" } });
      fireEvent.change(apiKeyInput, { target: { value: "sk-test-key" } });

      const submitButton = screen.getByText("create");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalled();
      });

      // Dialog should NOT close on error
      expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
    });
  });
});

describe("CreateUpstreamButton", () => {
  let queryClient: QueryClient;

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
  });

  it("renders add upstream button", () => {
    render(<CreateUpstreamButton />, { wrapper: Wrapper });

    expect(screen.getByText("addUpstream")).toBeInTheDocument();
  });

  it("renders Plus icon", () => {
    render(<CreateUpstreamButton />, { wrapper: Wrapper });

    const button = screen.getByRole("button");
    expect(button.querySelector("svg")).toBeInTheDocument();
  });
});
