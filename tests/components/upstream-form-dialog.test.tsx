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
const mockRefreshCatalogMutateAsync = vi.fn();
const mockImportCatalogMutateAsync = vi.fn();
const upstreamHookState = {
  createPending: false,
  updatePending: false,
  refreshPending: false,
  importPending: false,
};
const { mockToastError } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: mockToastError,
    success: vi.fn(),
  },
}));

vi.mock("@/hooks/use-upstreams", () => ({
  useCreateUpstream: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: upstreamHookState.createPending,
  }),
  useUpdateUpstream: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: upstreamHookState.updatePending,
  }),
  useRefreshUpstreamCatalog: () => ({
    mutateAsync: mockRefreshCatalogMutateAsync,
    isPending: upstreamHookState.refreshPending,
  }),
  useImportUpstreamCatalogModels: () => ({
    mutateAsync: mockImportCatalogMutateAsync,
    isPending: upstreamHookState.importPending,
  }),
}));

describe("UpstreamFormDialog", () => {
  let queryClient: QueryClient;

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const mockOnOpenChange = vi.fn();

  const ensureAdvancedConfigExpanded = () => {
    expect(screen.getByPlaceholderText("priorityPlaceholder")).toBeInTheDocument();
  };

  const addSpendingRule = () => {
    ensureAdvancedConfigExpanded();
    fireEvent.click(screen.getByText("addSpendingRule"));
  };

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
    model_discovery: {
      mode: "openai_compatible",
      custom_endpoint: null,
      enable_lite_llm_fallback: false,
    },
    model_catalog: [
      { model: "gpt-4.1", source: "native" },
      { model: "gpt-4.1-mini", source: "inferred" },
    ],
    model_catalog_updated_at: new Date().toISOString(),
    model_catalog_last_status: "success",
    model_catalog_last_error: null,
    model_catalog_last_failed_at: null,
    model_rules: [
      {
        type: "exact",
        value: "gpt-4.1",
        target_model: null,
        source: "native",
        display_label: "精确匹配",
      },
    ],
    health_status: null,
    circuit_breaker: null,
    affinity_migration: null,
    billing_input_multiplier: 1,
    billing_output_multiplier: 1,
    spending_rules: null,
    current_concurrency: 0,
    max_concurrency: null,
    official_website_url: null,
    last_used_at: null,
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
    mockCreateMutateAsync.mockReset();
    mockUpdateMutateAsync.mockReset();
    mockRefreshCatalogMutateAsync.mockReset();
    mockImportCatalogMutateAsync.mockReset();
    mockOnOpenChange.mockReset();
    mockToastError.mockReset();
    upstreamHookState.createPending = false;
    upstreamHookState.updatePending = false;
    upstreamHookState.refreshPending = false;
    upstreamHookState.importPending = false;
  });

  describe("Create Mode", () => {
    it("renders create dialog title when no upstream provided", () => {
      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText("createUpstreamTitle")).toBeInTheDocument();
    });

    it("renders basic fields and unified side catalog", () => {
      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByPlaceholderText("upstreamNamePlaceholder")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("baseUrlPlaceholder")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("apiKeyPlaceholder")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("upstreamDescriptionPlaceholder")).toBeInTheDocument();
      expect(
        screen.getAllByPlaceholderText("configSearchPlaceholder").length
      ).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("upstreamName").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("priorityAndWeight").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("configCategoryBasic")).toBeInTheDocument();
      expect(screen.getByText("configCategoryStrategy")).toBeInTheDocument();
      expect(screen.getByText("configCategoryReliability")).toBeInTheDocument();
    });

    it("renders the model discovery workspace instead of legacy routing inputs", () => {
      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText("modelDiscoverySectionTitle")).toBeInTheDocument();
      expect(screen.getByText("modelRulesSectionTitle")).toBeInTheDocument();
      expect(screen.getByText("catalogSectionTitle")).toBeInTheDocument();
      expect(screen.queryByText("allowedModels")).not.toBeInTheDocument();
      expect(screen.queryByText("modelRedirects")).not.toBeInTheDocument();
    });

    it("keeps section order consistent with navigation order", () => {
      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      ensureAdvancedConfigExpanded();

      const orderedSectionIds = [
        "basic-name",
        "basic-profile",
        "basic-route-endpoint",
        "basic-api-key",
        "advanced-priority-weight",
        "advanced-model-routing",
        "advanced-billing-multipliers",
        "advanced-spending-quota",
        "advanced-capacity-control",
        "advanced-circuit-breaker",
        "advanced-affinity-migration",
      ];

      const sectionElements = orderedSectionIds.map((sectionId) => {
        const section = document.getElementById(sectionId);
        expect(section).toBeInTheDocument();
        return section as HTMLElement;
      });

      for (let i = 0; i < sectionElements.length - 1; i += 1) {
        const current = sectionElements[i];
        const next = sectionElements[i + 1];
        expect(
          current.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
      }
    });

    it("reveals advanced fields after expansion", () => {
      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      ensureAdvancedConfigExpanded();
      expect(screen.getByPlaceholderText("priorityPlaceholder")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("maxConcurrencyPlaceholder")).toBeInTheDocument();
    });

    it("renders route capability selector", () => {
      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText("capabilityCodexCliResponses")).toBeInTheDocument();
      expect(screen.getByText("capabilityOpenAIResponses")).toBeInTheDocument();
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

      expect(mockToastError).toHaveBeenCalledWith("formValidationFailed");
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
          spending_rules: null,
          route_capabilities: [],
          model_discovery: {
            mode: "openai_compatible",
            custom_endpoint: null,
            enable_lite_llm_fallback: false,
          },
          model_rules: null,
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

      fireEvent.click(screen.getByText("capabilityCodexCliResponses"));
      fireEvent.click(screen.getByText("capabilityOpenAIChatCompatible"));
      fireEvent.click(screen.getByText("create"));

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            route_capabilities: ["codex_cli_responses", "openai_chat_compatible"],
          })
        );
      });
    });

    it("auto-appends /v1 for codex capability and keeps preview consistent", async () => {
      mockCreateMutateAsync.mockResolvedValueOnce({});

      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      fireEvent.change(screen.getByPlaceholderText("upstreamNamePlaceholder"), {
        target: { value: "Codex Proxy" },
      });
      fireEvent.change(screen.getByPlaceholderText("baseUrlPlaceholder"), {
        target: { value: "https://www.right.codes/codex/" },
      });
      fireEvent.change(screen.getByPlaceholderText("apiKeyPlaceholder"), {
        target: { value: "sk-test-key" },
      });
      fireEvent.click(screen.getByText("capabilityCodexCliResponses"));

      expect(screen.getByText("baseUrlAutoAppendV1Hint")).toBeInTheDocument();
      expect(screen.getByText("https://www.right.codes/codex/v1/responses")).toBeInTheDocument();
      expect(screen.getByText("finalRequestPreviewPath: /responses")).toBeInTheDocument();

      fireEvent.click(screen.getByText("create"));

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            base_url: "https://www.right.codes/codex/v1",
            route_capabilities: ["codex_cli_responses"],
          })
        );
      });
    });

    it("shows duplicate /v1 warning when manual /v1 overlaps with auto append", () => {
      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      fireEvent.change(screen.getByPlaceholderText("baseUrlPlaceholder"), {
        target: { value: "https://www.right.codes/codex/v1" },
      });
      fireEvent.click(screen.getByText("capabilityCodexCliResponses"));

      expect(screen.getByText("baseUrlDuplicateV1Warning")).toBeInTheDocument();
      expect(screen.getByText("https://www.right.codes/codex/v1/responses")).toBeInTheDocument();
    });

    it("submits optional official website and max concurrency fields on create", async () => {
      mockCreateMutateAsync.mockResolvedValueOnce({});

      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      fireEvent.change(screen.getByPlaceholderText("upstreamNamePlaceholder"), {
        target: { value: "Configured Upstream" },
      });
      fireEvent.change(screen.getByPlaceholderText("baseUrlPlaceholder"), {
        target: { value: "https://api.example.com/v1" },
      });
      fireEvent.change(screen.getByPlaceholderText("apiKeyPlaceholder"), {
        target: { value: "sk-test-key" },
      });
      fireEvent.change(screen.getByPlaceholderText("officialWebsiteUrlPlaceholder"), {
        target: { value: "https://www.right.codes" },
      });
      ensureAdvancedConfigExpanded();
      fireEvent.change(screen.getByPlaceholderText("maxConcurrencyPlaceholder"), {
        target: { value: "7" },
      });

      fireEvent.click(screen.getByText("create"));

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            official_website_url: "https://www.right.codes",
            max_concurrency: 7,
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
        route_capabilities: ["codex_cli_responses", "openai_chat_compatible"],
      };

      render(
        <UpstreamFormDialog
          upstream={capabilityUpstream}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: Wrapper }
      );

      expect(screen.getByText("capabilityCodexCliResponses")).toBeInTheDocument();
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
      ensureAdvancedConfigExpanded();
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

    it("blocks catalog refresh when discovery dependencies are edited but not saved", () => {
      render(
        <UpstreamFormDialog upstream={mockUpstream} open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: Wrapper }
      );

      fireEvent.change(screen.getByDisplayValue("https://api.openai.com/v1"), {
        target: { value: "https://gateway.example.com/codex/v1" },
      });

      expect(screen.getByText("catalogSavedConfigHint")).toBeInTheDocument();
      expect(screen.getByText("refreshCatalog")).toBeDisabled();
    });

    it("shows catalog loading state without hiding the rules workspace", () => {
      upstreamHookState.refreshPending = true;

      render(
        <UpstreamFormDialog upstream={mockUpstream} open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: Wrapper }
      );

      expect(screen.getByText("catalogLoading")).toBeInTheDocument();
      expect(screen.getByText("modelRulesSectionTitle")).toBeInTheDocument();
      expect(screen.getByText("refreshCatalog")).toBeDisabled();
    });

    it("shows catalog empty state when an editable upstream has no cached entries", () => {
      const upstreamWithoutCatalog: Upstream = {
        ...mockUpstream,
        model_catalog: null,
        model_catalog_updated_at: null,
        model_catalog_last_status: null,
        model_catalog_last_error: null,
        model_catalog_last_failed_at: null,
      };

      render(
        <UpstreamFormDialog
          upstream={upstreamWithoutCatalog}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: Wrapper }
      );

      expect(screen.getByText("catalogEmptyState")).toBeInTheDocument();
      expect(screen.getByText("modelRulesSectionTitle")).toBeInTheDocument();
      expect(screen.getByText("refreshCatalog")).toBeInTheDocument();
    });

    it("shows catalog failure state with error details and retry action", () => {
      const failedCatalogUpstream: Upstream = {
        ...mockUpstream,
        model_catalog: null,
        model_catalog_last_status: "failed",
        model_catalog_last_error: "gateway timeout",
        model_catalog_last_failed_at: new Date("2026-04-18T12:00:00.000Z").toISOString(),
      };

      render(
        <UpstreamFormDialog
          upstream={failedCatalogUpstream}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: Wrapper }
      );

      expect(screen.getByText("catalogFailureTitle")).toBeInTheDocument();
      expect(screen.getByText("gateway timeout")).toBeInTheDocument();
      expect(screen.getByText("catalogFailedAtLabel")).toBeInTheDocument();
      expect(screen.getByText("refreshCatalog")).toBeEnabled();
    });

    it("keeps the compact status bar ahead of a desktop-secondary workspace", () => {
      render(
        <UpstreamFormDialog upstream={mockUpstream} open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: Wrapper }
      );

      const statusHint = screen.getByText("catalogStatusBarHint");
      const rulesTitle = screen.getByText("modelRulesSectionTitle");
      const catalogTitle = screen.getByText("catalogSectionTitle");

      expect(
        statusHint.compareDocumentPosition(rulesTitle) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(
        rulesTitle.compareDocumentPosition(catalogTitle) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

      const workspaceContainer = Array.from(document.querySelectorAll("div")).find(
        (element) =>
          typeof element.className === "string" &&
          element.className.includes("xl:grid-cols-[minmax(0,1.02fr)_minmax(340px,0.98fr)]")
      );

      expect(workspaceContainer).toBeTruthy();
      expect(workspaceContainer?.className).toContain("grid");
    });

    it("imports selected catalog entries and echoes returned model rules", async () => {
      mockImportCatalogMutateAsync.mockResolvedValueOnce({
        ...mockUpstream,
        model_rules: [
          {
            type: "exact",
            value: "gpt-4.1",
            target_model: null,
            source: "native",
            display_label: "精确匹配",
          },
          {
            type: "exact",
            value: "gpt-4.1-mini",
            target_model: null,
            source: "inferred",
            display_label: "精确匹配",
          },
        ],
      });

      render(
        <UpstreamFormDialog upstream={mockUpstream} open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: Wrapper }
      );

      fireEvent.click(screen.getByText("gpt-4.1-mini"));
      fireEvent.click(screen.getByText("catalogImportScope"));

      await waitFor(() => {
        expect(mockImportCatalogMutateAsync).toHaveBeenCalledWith({
          id: "upstream-1",
          models: ["gpt-4.1-mini"],
        });
      });

      expect(screen.getAllByDisplayValue("gpt-4.1-mini").length).toBeGreaterThanOrEqual(1);
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
            spending_rules: null,
            route_capabilities: [],
            model_discovery: {
              mode: "openai_compatible",
              custom_endpoint: null,
              enable_lite_llm_fallback: false,
            },
            model_rules: [
              {
                type: "exact",
                value: "gpt-4.1",
                target_model: null,
                source: "native",
                display_label: "精确匹配",
              },
            ],
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
            spending_rules: null,
            route_capabilities: [],
            model_discovery: {
              mode: "openai_compatible",
              custom_endpoint: null,
              enable_lite_llm_fallback: false,
            },
            model_rules: [
              {
                type: "exact",
                value: "gpt-4.1",
                target_model: null,
                source: "native",
                display_label: "精确匹配",
              },
            ],
            circuit_breaker_config: null,
            affinity_migration: null,
            // api_key should NOT be included when empty
          },
        });
      });

      // Should successfully submit (edit mode allows empty api_key)
      expect(mockUpdateMutateAsync).toHaveBeenCalled();
    });

    it("supports bulk deleting selected model rules", () => {
      const upstreamWithMultipleRules: Upstream = {
        ...mockUpstream,
        model_rules: [
          {
            type: "exact",
            value: "gpt-4.1",
            target_model: null,
            source: "native",
            display_label: "精确匹配",
          },
          {
            type: "exact",
            value: "gpt-4.1-mini",
            target_model: null,
            source: "manual",
            display_label: "精确匹配",
          },
          {
            type: "alias",
            value: "gpt-4.1-preview",
            target_model: "gpt-4.1",
            source: "manual",
            display_label: "别名改写",
          },
        ],
      };

      render(
        <UpstreamFormDialog
          upstream={upstreamWithMultipleRules}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: Wrapper }
      );

      expect(screen.getAllByDisplayValue("gpt-4.1")).toHaveLength(2);
      fireEvent.click(screen.getByLabelText("selectModelRule 1"));
      fireEvent.click(screen.getByLabelText("selectModelRule 2"));
      fireEvent.click(screen.getByText("deleteSelectedModelRules"));

      expect(screen.getAllByDisplayValue("gpt-4.1")).toHaveLength(1);
      expect(screen.queryByDisplayValue("gpt-4.1-mini")).not.toBeInTheDocument();
      expect(screen.getByDisplayValue("gpt-4.1-preview")).toBeInTheDocument();
      expect(screen.getByDisplayValue("gpt-4.1")).toBeInTheDocument();
    });

    it("filters catalog entries, selects visible models, and clears the selection", () => {
      render(
        <UpstreamFormDialog upstream={mockUpstream} open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: Wrapper }
      );

      const importButton = screen
        .getByText("catalogImportScope")
        .closest("button") as HTMLButtonElement;
      expect(importButton).toBeDisabled();

      fireEvent.change(screen.getByPlaceholderText("catalogSearchPlaceholder"), {
        target: { value: "mini" },
      });
      fireEvent.click(screen.getAllByText("catalogSourceFilterAll")[0]);
      fireEvent.click(screen.getAllByText("modelRuleSource_inferred").slice(-1)[0]);
      fireEvent.click(screen.getByText("catalogSelectVisible"));

      expect(importButton).toBeEnabled();

      fireEvent.click(screen.getByText("catalogClearSelection"));
      expect(importButton).toBeDisabled();
    });

    it("switches a model rule to alias mode and submits manual source updates", async () => {
      mockUpdateMutateAsync.mockResolvedValueOnce({});

      render(
        <UpstreamFormDialog upstream={mockUpstream} open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: Wrapper }
      );

      fireEvent.click(screen.getAllByText("modelRuleTypeLabel_exact")[0]);
      fireEvent.click(screen.getAllByText("modelRuleTypeLabel_alias").slice(-1)[0]);

      fireEvent.change(screen.getByDisplayValue("gpt-4.1"), {
        target: { value: "gpt-4.1-preview" },
      });
      fireEvent.change(screen.getByPlaceholderText("modelRuleTargetPlaceholder"), {
        target: { value: "gpt-4.1" },
      });
      fireEvent.click(screen.getByText("save"));

      await waitFor(() => {
        expect(mockUpdateMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "upstream-1",
            data: expect.objectContaining({
              model_rules: [
                {
                  type: "alias",
                  value: "gpt-4.1-preview",
                  target_model: "gpt-4.1",
                  source: "manual",
                  display_label: null,
                },
              ],
            }),
          })
        );
      });
    });

    it("removes a single model rule from the workspace", () => {
      render(
        <UpstreamFormDialog upstream={mockUpstream} open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: Wrapper }
      );

      fireEvent.click(screen.getByLabelText("removeModelRule"));

      expect(screen.getByText("modelRulesEmpty")).toBeInTheDocument();
      expect(screen.queryByDisplayValue("gpt-4.1")).not.toBeInTheDocument();
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
      ensureAdvancedConfigExpanded();
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

      ensureAdvancedConfigExpanded();
      const priorityInput = screen.getByPlaceholderText("priorityPlaceholder");
      expect(priorityInput).toHaveValue(3);
    });

    it("submits edited upstream with updated priority", async () => {
      mockUpdateMutateAsync.mockResolvedValueOnce({});

      render(
        <UpstreamFormDialog upstream={mockUpstream} open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: Wrapper }
      );

      ensureAdvancedConfigExpanded();
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

    it("keeps advanced numeric inputs editable through empty string and zero", async () => {
      mockCreateMutateAsync.mockResolvedValueOnce({});

      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      fireEvent.change(screen.getByPlaceholderText("upstreamNamePlaceholder"), {
        target: { value: "Numeric Sequence Upstream" },
      });
      fireEvent.change(screen.getByPlaceholderText("baseUrlPlaceholder"), {
        target: { value: "https://api.example.com/v1" },
      });
      fireEvent.change(screen.getByPlaceholderText("apiKeyPlaceholder"), {
        target: { value: "sk-test-key" },
      });

      ensureAdvancedConfigExpanded();

      const priorityInput = screen.getByPlaceholderText("priorityPlaceholder") as HTMLInputElement;
      const weightInput = screen.getByPlaceholderText("weightPlaceholder") as HTMLInputElement;
      const billingInputMultiplier = screen
        .getByText("billingInputMultiplier")
        .parentElement?.querySelector("input") as HTMLInputElement;
      const billingOutputMultiplier = screen
        .getByText("billingOutputMultiplier")
        .parentElement?.querySelector("input") as HTMLInputElement;

      fireEvent.click(screen.getAllByRole("switch")[1]);
      const affinityThresholdInput = screen.getByPlaceholderText("50000") as HTMLInputElement;

      fireEvent.change(priorityInput, { target: { value: "30" } });
      expect(priorityInput.value).toBe("30");
      fireEvent.change(priorityInput, { target: { value: "3" } });
      expect(priorityInput.value).toBe("3");
      fireEvent.change(priorityInput, { target: { value: "" } });
      expect(priorityInput.value).toBe("");
      fireEvent.change(priorityInput, { target: { value: "0" } });
      expect(priorityInput.value).toBe("0");
      fireEvent.change(priorityInput, { target: { value: "5" } });
      expect(priorityInput.value).toBe("5");

      fireEvent.change(weightInput, { target: { value: "30" } });
      expect(weightInput.value).toBe("30");
      fireEvent.change(weightInput, { target: { value: "3" } });
      expect(weightInput.value).toBe("3");
      fireEvent.change(weightInput, { target: { value: "" } });
      expect(weightInput.value).toBe("");
      fireEvent.change(weightInput, { target: { value: "0" } });
      expect(weightInput.value).toBe("0");
      fireEvent.change(weightInput, { target: { value: "5" } });
      expect(weightInput.value).toBe("5");

      fireEvent.change(billingInputMultiplier, { target: { value: "30" } });
      expect(billingInputMultiplier.value).toBe("30");
      fireEvent.change(billingInputMultiplier, { target: { value: "3" } });
      expect(billingInputMultiplier.value).toBe("3");
      fireEvent.change(billingInputMultiplier, { target: { value: "" } });
      expect(billingInputMultiplier.value).toBe("");
      fireEvent.change(billingInputMultiplier, { target: { value: "0" } });
      expect(billingInputMultiplier.value).toBe("0");
      fireEvent.change(billingInputMultiplier, { target: { value: "5" } });
      expect(billingInputMultiplier.value).toBe("5");

      fireEvent.change(billingOutputMultiplier, { target: { value: "30" } });
      expect(billingOutputMultiplier.value).toBe("30");
      fireEvent.change(billingOutputMultiplier, { target: { value: "3" } });
      expect(billingOutputMultiplier.value).toBe("3");
      fireEvent.change(billingOutputMultiplier, { target: { value: "" } });
      expect(billingOutputMultiplier.value).toBe("");
      fireEvent.change(billingOutputMultiplier, { target: { value: "0" } });
      expect(billingOutputMultiplier.value).toBe("0");
      fireEvent.change(billingOutputMultiplier, { target: { value: "5" } });
      expect(billingOutputMultiplier.value).toBe("5");

      fireEvent.change(affinityThresholdInput, { target: { value: "30" } });
      expect(affinityThresholdInput.value).toBe("30");
      fireEvent.change(affinityThresholdInput, { target: { value: "3" } });
      expect(affinityThresholdInput.value).toBe("3");
      fireEvent.change(affinityThresholdInput, { target: { value: "" } });
      expect(affinityThresholdInput.value).toBe("");
      fireEvent.change(affinityThresholdInput, { target: { value: "0" } });
      expect(affinityThresholdInput.value).toBe("0");
      fireEvent.change(affinityThresholdInput, { target: { value: "5" } });
      expect(affinityThresholdInput.value).toBe("5");

      fireEvent.click(screen.getByText("create"));

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            priority: 5,
            weight: 5,
            billing_input_multiplier: 5,
            billing_output_multiplier: 5,
            affinity_migration: {
              enabled: true,
              metric: "tokens",
              threshold: 5,
            },
          })
        );
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

    it("prompts before closing when there are unsaved changes", async () => {
      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      fireEvent.change(screen.getByPlaceholderText("upstreamNamePlaceholder"), {
        target: { value: "Changed but not saved" },
      });

      fireEvent.click(screen.getByText("cancel"));

      expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
      expect(screen.getByText("unsavedChangesTitle")).toBeInTheDocument();
      expect(screen.getByText("unsavedChangesDescription")).toBeInTheDocument();

      fireEvent.click(screen.getByText("discardChanges"));

      await waitFor(() => {
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it("closes without discard prompt after numeric fields are restored to their original values", async () => {
      const upstreamWithAdvancedNumericValues: Upstream = {
        ...mockUpstream,
        billing_input_multiplier: 1,
        spending_rules: [{ period_type: "daily", limit: 100 }],
        affinity_migration: {
          enabled: true,
          metric: "tokens",
          threshold: 50000,
        },
      };

      render(
        <UpstreamFormDialog
          upstream={upstreamWithAdvancedNumericValues}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: Wrapper }
      );

      ensureAdvancedConfigExpanded();

      const billingInputMultiplier = screen
        .getByText("billingInputMultiplier")
        .parentElement?.querySelector("input") as HTMLInputElement;
      const spendingLimitInput = screen.getByPlaceholderText(
        "spendingLimitPlaceholder"
      ) as HTMLInputElement;
      const affinityThresholdInput = screen.getByPlaceholderText("50000") as HTMLInputElement;

      fireEvent.change(billingInputMultiplier, { target: { value: "1.5" } });
      fireEvent.change(billingInputMultiplier, { target: { value: "1" } });

      fireEvent.change(spendingLimitInput, { target: { value: "150" } });
      fireEvent.change(spendingLimitInput, { target: { value: "100" } });

      fireEvent.change(affinityThresholdInput, { target: { value: "60000" } });
      fireEvent.change(affinityThresholdInput, { target: { value: "50000" } });

      fireEvent.click(screen.getByText("cancel"));

      await waitFor(() => {
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
      expect(screen.queryByText("unsavedChangesTitle")).not.toBeInTheDocument();
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
      mockCreateMutateAsync.mockRejectedValue(new Error("Create failed"));

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

  describe("Spending Quota Fields", () => {
    it("renders spending limit field in create mode", () => {
      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      addSpendingRule();
      expect(screen.getByText("spendingLimit")).toBeInTheDocument();
    });

    it("renders spending period type selector", () => {
      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      addSpendingRule();
      expect(screen.getByText("spendingPeriodType")).toBeInTheDocument();
    });

    it("populates spending fields in edit mode", () => {
      const upstreamWithQuota: Upstream = {
        ...mockUpstream,
        spending_rules: [{ period_type: "daily", limit: 100 }],
      };

      render(
        <UpstreamFormDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          upstream={upstreamWithQuota}
        />,
        { wrapper: Wrapper }
      );

      ensureAdvancedConfigExpanded();
      const limitInput = screen.getByPlaceholderText("spendingLimitPlaceholder");
      expect(limitInput).toHaveValue(100);
    });

    it("submits spending quota fields on create", async () => {
      mockCreateMutateAsync.mockResolvedValue({});

      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      const nameInput = screen.getByPlaceholderText("upstreamNamePlaceholder");
      const urlInput = screen.getByPlaceholderText("baseUrlPlaceholder");
      const apiKeyInput = screen.getByPlaceholderText("apiKeyPlaceholder");

      addSpendingRule();
      const limitInput = screen.getByPlaceholderText("spendingLimitPlaceholder");

      fireEvent.change(nameInput, { target: { value: "Quota Upstream" } });
      fireEvent.change(urlInput, { target: { value: "https://api.example.com/v1" } });
      fireEvent.change(apiKeyInput, { target: { value: "sk-test-key" } });
      fireEvent.change(limitInput, { target: { value: "50" } });

      const submitButton = screen.getByText("create");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalled();
      });

      const callArgs = mockCreateMutateAsync.mock.calls[0][0];
      expect(callArgs.spending_rules).toEqual([{ period_type: "daily", limit: 50 }]);
    });

    it("shows localized error when spending limit is not greater than zero", async () => {
      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      const nameInput = screen.getByPlaceholderText("upstreamNamePlaceholder");
      const urlInput = screen.getByPlaceholderText("baseUrlPlaceholder");
      const apiKeyInput = screen.getByPlaceholderText("apiKeyPlaceholder");

      addSpendingRule();
      const limitInput = screen.getByPlaceholderText("spendingLimitPlaceholder");

      fireEvent.change(nameInput, { target: { value: "Invalid Quota Upstream" } });
      fireEvent.change(urlInput, { target: { value: "https://api.example.com/v1" } });
      fireEvent.change(apiKeyInput, { target: { value: "sk-test-key" } });
      fireEvent.change(limitInput, { target: { value: "0" } });

      fireEvent.click(screen.getByText("create"));

      await waitFor(() => {
        expect(mockCreateMutateAsync).not.toHaveBeenCalled();
      });

      expect(screen.getByText("spendingLimitMustBePositive")).toBeInTheDocument();
      expect(mockToastError).toHaveBeenCalledWith("spendingLimitMustBePositive");
    });

    it("auto-fills rolling period_hours with default value", async () => {
      mockCreateMutateAsync.mockResolvedValue({});

      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      const nameInput = screen.getByPlaceholderText("upstreamNamePlaceholder");
      const urlInput = screen.getByPlaceholderText("baseUrlPlaceholder");
      const apiKeyInput = screen.getByPlaceholderText("apiKeyPlaceholder");

      addSpendingRule();
      const limitInput = screen.getByPlaceholderText("spendingLimitPlaceholder");

      fireEvent.change(nameInput, { target: { value: "Rolling Upstream" } });
      fireEvent.change(urlInput, { target: { value: "https://api.example.com/v1" } });
      fireEvent.change(apiKeyInput, { target: { value: "sk-test-key" } });
      fireEvent.change(limitInput, { target: { value: "20" } });

      fireEvent.click(screen.getAllByText("spendingPeriodDaily")[0]);
      fireEvent.click(screen.getAllByText("spendingPeriodRolling").slice(-1)[0]);

      const periodHoursInput = screen.getByPlaceholderText("24");
      expect(periodHoursInput).toHaveValue(24);

      const submitButton = screen.getByText("create");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            spending_rules: [{ period_type: "rolling", limit: 20, period_hours: 24 }],
          })
        );
      });
    });

    it("keeps spending rule inputs editable through empty string and avoids refilling rolling hours", async () => {
      mockCreateMutateAsync.mockResolvedValue({});

      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      fireEvent.change(screen.getByPlaceholderText("upstreamNamePlaceholder"), {
        target: { value: "Quota Sequence Upstream" },
      });
      fireEvent.change(screen.getByPlaceholderText("baseUrlPlaceholder"), {
        target: { value: "https://api.example.com/v1" },
      });
      fireEvent.change(screen.getByPlaceholderText("apiKeyPlaceholder"), {
        target: { value: "sk-test-key" },
      });

      addSpendingRule();
      const limitInput = screen.getByPlaceholderText(
        "spendingLimitPlaceholder"
      ) as HTMLInputElement;

      fireEvent.change(limitInput, { target: { value: "30" } });
      expect(limitInput.value).toBe("30");
      fireEvent.change(limitInput, { target: { value: "3" } });
      expect(limitInput.value).toBe("3");
      fireEvent.change(limitInput, { target: { value: "" } });
      expect(limitInput.value).toBe("");
      fireEvent.change(limitInput, { target: { value: "0" } });
      expect(limitInput.value).toBe("0");
      fireEvent.change(limitInput, { target: { value: "5" } });
      expect(limitInput.value).toBe("5");

      fireEvent.click(screen.getAllByText("spendingPeriodDaily")[0]);
      fireEvent.click(screen.getAllByText("spendingPeriodRolling").slice(-1)[0]);

      const periodHoursInput = screen.getByPlaceholderText("24") as HTMLInputElement;
      expect(periodHoursInput.value).toBe("24");

      fireEvent.change(periodHoursInput, { target: { value: "30" } });
      expect(periodHoursInput.value).toBe("30");
      fireEvent.change(periodHoursInput, { target: { value: "3" } });
      expect(periodHoursInput.value).toBe("3");
      fireEvent.change(periodHoursInput, { target: { value: "" } });
      expect(periodHoursInput.value).toBe("");
      fireEvent.blur(periodHoursInput);
      expect(periodHoursInput.value).toBe("");
      fireEvent.change(periodHoursInput, { target: { value: "0" } });
      expect(periodHoursInput.value).toBe("0");
      fireEvent.change(periodHoursInput, { target: { value: "5" } });
      expect(periodHoursInput.value).toBe("5");

      fireEvent.click(screen.getByText("create"));

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            spending_rules: [{ period_type: "rolling", limit: 5, period_hours: 5 }],
          })
        );
      });
    });
  });

  describe("Catalog Navigation", () => {
    it("expands advanced section and highlights target block when jumping from catalog", () => {
      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      fireEvent.click(screen.getAllByText("priorityAndWeight")[0]);

      expect(screen.getByPlaceholderText("priorityPlaceholder")).toBeInTheDocument();
      expect(document.getElementById("advanced-priority-weight")).toHaveClass(
        "bg-status-info-muted"
      );
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
