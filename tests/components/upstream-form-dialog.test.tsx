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
    base_url: "https://api.openai.com/v1",
    api_key_masked: "sk-***1234",
    description: "Production OpenAI API",
    is_default: false,
    timeout: 60,
    is_active: true,
    weight: 1,
    priority: 0,
    route_capabilities: [],
    allowed_models: null,
    model_redirects: null,
    health_status: null,
    affinity_migration: null,
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

    it("renders route capability selector", () => {
      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText("capabilityCodexResponses")).toBeInTheDocument();
      expect(screen.getByText("capabilityOpenAIChatCompatible")).toBeInTheDocument();
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
        // Form shows validation errors (default Zod messages)
        expect(mockCreateMutateAsync).not.toHaveBeenCalled();
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
        // Form should not submit without api_key in create mode
        expect(mockCreateMutateAsync).not.toHaveBeenCalled();
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
          base_url: "https://api.example.com/v1",
          api_key: "sk-test-key",
          description: null,
          priority: 0,
          weight: 1,
          billing_input_multiplier: 1,
          billing_output_multiplier: 1,
          daily_spending_limit: null,
          monthly_spending_limit: null,
          route_capabilities: [],
          allowed_models: null,
          model_redirects: null,
          circuit_breaker_config: null,
          affinity_migration: null,
        });
      });
    });

    it("submits selected route capabilities in create mode", async () => {
      mockCreateMutateAsync.mockResolvedValueOnce({});

      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      fireEvent.change(screen.getByPlaceholderText("upstreamNamePlaceholder"), {
        target: { value: "CLI Router Upstream" },
      });
      fireEvent.change(screen.getByPlaceholderText("baseUrlPlaceholder"), {
        target: { value: "https://api.example.com/v1" },
      });
      fireEvent.change(screen.getByPlaceholderText("apiKeyPlaceholder"), {
        target: { value: "sk-test-key" },
      });

      fireEvent.click(screen.getByText("capabilityCodexResponses"));
      fireEvent.click(screen.getByText("capabilityOpenAIChatCompatible"));
      fireEvent.click(screen.getByText("create"));

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            route_capabilities: ["codex_responses", "openai_chat_compatible"],
          })
        );
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
    it("echoes selected route capabilities in edit mode", () => {
      const capabilityUpstream: Upstream = {
        ...mockUpstream,
        route_capabilities: ["codex_responses", "openai_chat_compatible"],
      };

      render(
        <UpstreamFormDialog
          upstream={capabilityUpstream}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: Wrapper }
      );

      expect(screen.getByText("capabilityCodexResponses")).toBeInTheDocument();
      expect(screen.getByText("capabilityOpenAIChatCompatible")).toBeInTheDocument();
      expect(screen.getAllByText("selected").length).toBeGreaterThanOrEqual(2);
    });

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

    it("calls updateMutation on valid form submission with new api_key", async () => {
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
            base_url: "https://api.openai.com/v1",
            api_key: "sk-new-key",
            description: "Production OpenAI API",
            priority: 0,
            weight: 1,
            billing_input_multiplier: 1,
            billing_output_multiplier: 1,
            daily_spending_limit: null,
            monthly_spending_limit: null,
            route_capabilities: [],
            allowed_models: null,
            model_redirects: null,
            circuit_breaker_config: null,
            affinity_migration: null,
          },
        });
      });
    });

    it("allows empty api_key in edit mode (keeps existing key)", async () => {
      mockUpdateMutateAsync.mockResolvedValueOnce({});

      render(
        <UpstreamFormDialog upstream={mockUpstream} open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: Wrapper }
      );

      const nameInput = screen.getByDisplayValue("OpenAI Production");
      fireEvent.change(nameInput, { target: { value: "Updated Name" } });
      // Don't fill api key - should be allowed in edit mode

      const submitButton = screen.getByText("save");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
          id: "upstream-1",
          data: {
            name: "Updated Name",
            base_url: "https://api.openai.com/v1",
            description: "Production OpenAI API",
            priority: 0,
            weight: 1,
            billing_input_multiplier: 1,
            billing_output_multiplier: 1,
            daily_spending_limit: null,
            monthly_spending_limit: null,
            route_capabilities: [],
            allowed_models: null,
            model_redirects: null,
            circuit_breaker_config: null,
            affinity_migration: null,
            // api_key should NOT be included when empty
          },
        });
      });

      // Should successfully submit (edit mode allows empty api_key)
      expect(mockUpdateMutateAsync).toHaveBeenCalled();
    });
  });

  describe("Priority Field", () => {
    it("creates upstream with custom priority value", async () => {
      mockCreateMutateAsync.mockResolvedValueOnce({});

      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      const nameInput = screen.getByPlaceholderText("upstreamNamePlaceholder");
      const urlInput = screen.getByPlaceholderText("baseUrlPlaceholder");
      const apiKeyInput = screen.getByPlaceholderText("apiKeyPlaceholder");
      const priorityInput = screen.getByPlaceholderText("priorityPlaceholder");

      fireEvent.change(nameInput, { target: { value: "Fallback Upstream" } });
      fireEvent.change(urlInput, { target: { value: "https://api.example.com/v1" } });
      fireEvent.change(apiKeyInput, { target: { value: "sk-test-key" } });
      fireEvent.change(priorityInput, { target: { value: "2" } });

      const submitButton = screen.getByText("create");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            priority: 2,
          })
        );
      });
    });

    it("pre-fills priority when editing upstream with non-zero priority", () => {
      const highPriorityUpstream: Upstream = {
        ...mockUpstream,
        id: "upstream-fallback",
        name: "Fallback Provider",
        priority: 3,
      };

      render(
        <UpstreamFormDialog
          upstream={highPriorityUpstream}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: Wrapper }
      );

      const priorityInput = screen.getByPlaceholderText("priorityPlaceholder");
      expect(priorityInput).toHaveValue(3);
    });

    it("submits edited upstream with updated priority", async () => {
      mockUpdateMutateAsync.mockResolvedValueOnce({});

      render(
        <UpstreamFormDialog upstream={mockUpstream} open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: Wrapper }
      );

      const priorityInput = screen.getByPlaceholderText("priorityPlaceholder");
      fireEvent.change(priorityInput, { target: { value: "5" } });

      const submitButton = screen.getByText("save");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
          id: "upstream-1",
          data: expect.objectContaining({
            priority: 5,
          }),
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
