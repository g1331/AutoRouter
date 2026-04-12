import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UpstreamFormDialog, CreateUpstreamButton } from "@/components/admin/upstream-form-dialog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Upstream } from "@/types/api";

// Mock next-intl
const translatedLabels: Record<string, string | ((values?: Record<string, unknown>) => string)> = {
  searchModelCatalog: "搜索目录模型名称或来源标签",
  selectFilteredCatalogModels: "全选当前结果",
  deselectFilteredCatalogModels: "取消当前结果",
  filteredCatalogModelsSelected: (values) =>
    `当前结果 ${values?.selected ?? 0}/${values?.total ?? 0} 已选`,
  totalSelectedCatalogModels: (values) => `总计 ${values?.selected ?? 0} 项已选`,
  hiddenSelectedCatalogModels: (values) => `当前筛选外另有 ${values?.count ?? 0} 项已选`,
  importSelectedModels: "导入所选模型",
  modelCatalogResultsRegion: "模型目录结果列表",
  catalogSourceNative: "原生",
  catalogSourceInferred: "推断候选",
  catalogModelCheckboxLabel: (values) =>
    `选择目录模型 ${values?.model ?? ""}（${values?.source ?? ""}）`,
};

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const translated = translatedLabels[key];
    if (typeof translated === "function") {
      return translated(values);
    }

    return translated ?? key;
  },
}));

// Mock hooks
const mockCreateMutateAsync = vi.fn();
const mockUpdateMutateAsync = vi.fn();
const mockRefreshCatalogMutateAsync = vi.fn();
const mockImportCatalogMutateAsync = vi.fn();
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
    isPending: false,
  }),
  useUpdateUpstream: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  }),
  useRefreshUpstreamCatalog: () => ({
    mutateAsync: mockRefreshCatalogMutateAsync,
    isPending: false,
  }),
  useImportUpstreamCatalog: () => ({
    mutateAsync: mockImportCatalogMutateAsync,
    isPending: false,
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
    model_catalog_last_failed_at: null,
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
    mockCreateMutateAsync.mockReset();
    mockUpdateMutateAsync.mockReset();
    mockRefreshCatalogMutateAsync.mockReset();
    mockImportCatalogMutateAsync.mockReset();
    mockOnOpenChange.mockReset();
    mockToastError.mockReset();
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

    it("shows save-first discovery actions in create mode", () => {
      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      ensureAdvancedConfigExpanded();

      expect(screen.getByText("modelDiscovery")).toBeInTheDocument();
      expect(screen.getByText("modelRules")).toBeInTheDocument();
      expect(screen.getAllByText("saveUpstreamFirstForCatalogActions").length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: "refreshModelCatalog" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "导入所选模型" })).toBeDisabled();
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
            enable_lite_llm_fallback: true,
          },
          model_rules: null,
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

    it("preserves valid versioned API roots without appending an extra /v1", async () => {
      mockCreateMutateAsync.mockResolvedValueOnce({});

      render(<UpstreamFormDialog open={true} onOpenChange={mockOnOpenChange} />, {
        wrapper: Wrapper,
      });

      fireEvent.change(screen.getByPlaceholderText("upstreamNamePlaceholder"), {
        target: { value: "Gemini OpenAI Proxy" },
      });
      fireEvent.change(screen.getByPlaceholderText("baseUrlPlaceholder"), {
        target: { value: "https://generativelanguage.googleapis.com/v1beta/openai" },
      });
      fireEvent.change(screen.getByPlaceholderText("apiKeyPlaceholder"), {
        target: { value: "sk-test-key" },
      });
      fireEvent.click(screen.getByText("capabilityOpenAIChatCompatible"));

      expect(screen.queryByText("baseUrlAutoAppendV1Hint")).not.toBeInTheDocument();
      expect(
        screen.getByText("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions")
      ).toBeInTheDocument();
      expect(screen.getByText("finalRequestPreviewPath: /chat/completions")).toBeInTheDocument();

      fireEvent.click(screen.getByText("create"));

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
            route_capabilities: ["openai_chat_compatible"],
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

    it("separates discovery status from rule authoring and shows fetched metadata", () => {
      const modelAwareUpstream: Upstream = {
        ...mockUpstream,
        model_discovery: {
          mode: "openai_compatible",
          enable_lite_llm_fallback: true,
        },
        model_catalog: [
          { model: "gpt-4.1", source: "native" },
          { model: "claude-3.7-sonnet", source: "inferred" },
        ],
        model_catalog_last_status: "failure",
        model_catalog_last_error: "Discovery timeout",
        model_catalog_updated_at: "2026-04-11T00:00:00Z",
        model_catalog_last_failed_at: "2026-04-11T01:00:00Z",
        model_rules: [
          { type: "exact", model: "gpt-4.1", source: "native" },
          { type: "regex", pattern: "^gpt-4\\..*$", source: "manual" },
          {
            type: "alias",
            alias: "chat-prod",
            target_model: "gpt-4.1",
            source: "manual",
          },
        ],
      };

      render(
        <UpstreamFormDialog
          upstream={modelAwareUpstream}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: Wrapper }
      );

      ensureAdvancedConfigExpanded();

      expect(screen.getByText("modelDiscovery")).toBeInTheDocument();
      expect(screen.getByText("modelRules")).toBeInTheDocument();
      expect(screen.getByText("modelDiscoveryMode")).toBeInTheDocument();
      expect(screen.getByText("modelDiscoveryCustomEndpointDescription")).toBeInTheDocument();
      expect(screen.getByText("modelCatalogFallback")).toBeInTheDocument();
      expect(screen.getByText("modelCatalogLastStatusFailure")).toBeInTheDocument();
      expect(screen.getByText(/modelCatalogLastError:/)).toBeInTheDocument();
      expect(screen.getByText(/modelCatalogUpdatedAt:/)).toBeInTheDocument();
      expect(screen.getByText(/modelCatalogLastFailedAt:/)).toBeInTheDocument();
      expect(screen.getByText("原生")).toBeInTheDocument();
      expect(screen.getByText("推断候选")).toBeInTheDocument();
      expect(screen.getAllByDisplayValue("gpt-4.1").length).toBeGreaterThan(0);
      expect(screen.getByDisplayValue("^gpt-4\\..*$")).toBeInTheDocument();
      expect(screen.getByDisplayValue("chat-prod")).toBeInTheDocument();
    });

    it("keeps the custom discovery endpoint semantics visible even outside custom mode", () => {
      render(
        <UpstreamFormDialog upstream={mockUpstream} open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: Wrapper }
      );

      ensureAdvancedConfigExpanded();

      expect(screen.getByText("modelDiscoveryCustomEndpoint")).toBeInTheDocument();
      expect(screen.getByText("modelDiscoveryCustomEndpointDescription")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("modelDiscoveryCustomEndpointPlaceholder")
      ).toBeInTheDocument();
    });

    it("stacks the catalog browser below model rules and keeps bounded catalog selection behavior", () => {
      const searchableCatalogUpstream: Upstream = {
        ...mockUpstream,
        model_discovery: {
          mode: "openai_compatible",
          enable_lite_llm_fallback: true,
        },
        model_catalog: [
          { model: "gpt-4.1", source: "native" },
          { model: "gpt-4o-mini", source: "native" },
          { model: "claude-3.7-sonnet", source: "inferred" },
        ],
        model_rules: [],
      };

      render(
        <UpstreamFormDialog
          upstream={searchableCatalogUpstream}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: Wrapper }
      );

      ensureAdvancedConfigExpanded();

      const searchInput = screen.getByLabelText("搜索目录模型名称或来源标签");
      fireEvent.change(searchInput, { target: { value: "claude" } });

      expect(screen.getByText("claude-3.7-sonnet")).toBeInTheDocument();
      expect(screen.queryByText("gpt-4.1")).not.toBeInTheDocument();
      expect(screen.queryByText("gpt-4o-mini")).not.toBeInTheDocument();
      expect(screen.getByTestId("catalog-selection-summary")).toHaveTextContent(
        "当前结果 0/1 已选"
      );
      expect(screen.getByText("总计 0 项已选")).toBeInTheDocument();

      const modelRulesSection = screen.getByText("modelRules").closest("section");
      const catalogBrowserSection = screen.getByText("modelCatalogBrowser").closest("section");

      expect(modelRulesSection).toBeInTheDocument();
      expect(catalogBrowserSection).toBeInTheDocument();
      expect(modelRulesSection?.parentElement).toBe(catalogBrowserSection?.parentElement);
      expect(modelRulesSection?.parentElement).toHaveClass("flex", "flex-col");
      expect(modelRulesSection?.parentElement).not.toHaveClass(
        "xl:grid",
        "xl:grid-cols-[minmax(0,1.12fr)_minmax(360px,1fr)]",
        "xl:items-start",
        "xl:flex-row"
      );
      expect(modelRulesSection?.compareDocumentPosition(catalogBrowserSection as Node)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      );
      expect(catalogBrowserSection).not.toHaveClass("xl:sticky");

      const stickyLayoutNode = [
        catalogBrowserSection,
        ...Array.from(catalogBrowserSection?.querySelectorAll("*") ?? []),
      ].find((element) => {
        const className = element?.getAttribute("class") ?? "";
        return ["sticky", "xl:sticky", "top-4", "xl:top-4"].some((token) =>
          className.split(/\s+/).includes(token)
        );
      });
      expect(stickyLayoutNode).toBeUndefined();

      const catalogResultsRegion = screen.getByLabelText("模型目录结果列表");
      expect(catalogResultsRegion).toHaveClass("max-h-80", "overflow-y-auto");

      fireEvent.click(screen.getByRole("button", { name: "全选当前结果" }));
      expect(
        screen.getByRole("checkbox", {
          name: "选择目录模型 claude-3.7-sonnet（推断候选）",
        })
      ).toBeChecked();

      fireEvent.click(screen.getByRole("button", { name: "取消当前结果" }));
      expect(
        screen.getByRole("checkbox", {
          name: "选择目录模型 claude-3.7-sonnet（推断候选）",
        })
      ).not.toBeChecked();
    });

    it("keeps hidden selections visible in the summary and import behavior", async () => {
      const importableUpstream: Upstream = {
        ...mockUpstream,
        model_discovery: {
          mode: "openai_compatible",
          enable_lite_llm_fallback: true,
        },
        model_catalog: [
          { model: "gpt-4.1", source: "native" },
          { model: "gpt-4o-mini", source: "native" },
          { model: "claude-3.7-sonnet", source: "inferred" },
        ],
        model_catalog_last_status: "success",
        model_catalog_last_error: null,
        model_catalog_updated_at: "2026-04-11T00:00:00Z",
        model_rules: [],
      };

      mockImportCatalogMutateAsync.mockResolvedValueOnce({
        ...importableUpstream,
        model_rules: [{ type: "exact", model: "claude-3.7-sonnet", source: "inferred" }],
      });

      render(
        <UpstreamFormDialog
          upstream={importableUpstream}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: Wrapper }
      );

      ensureAdvancedConfigExpanded();

      fireEvent.change(screen.getByLabelText("搜索目录模型名称或来源标签"), {
        target: { value: "claude" },
      });
      fireEvent.click(screen.getByRole("button", { name: "全选当前结果" }));

      expect(screen.getByTestId("catalog-selection-summary")).toHaveTextContent(
        "当前结果 1/1 已选"
      );
      expect(screen.getByText("总计 1 项已选")).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("搜索目录模型名称或来源标签"), {
        target: { value: "gpt" },
      });

      expect(screen.getByTestId("catalog-selection-summary")).toHaveTextContent(
        "当前结果 0/2 已选"
      );
      expect(screen.getByText("总计 1 项已选")).toBeInTheDocument();
      expect(screen.getByText("当前筛选外另有 1 项已选")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "导入所选模型" }));

      await waitFor(() => {
        expect(mockImportCatalogMutateAsync).toHaveBeenCalledWith({
          id: "upstream-1",
          models: ["claude-3.7-sonnet"],
        });
      });

      expect(screen.getAllByDisplayValue("claude-3.7-sonnet").length).toBeGreaterThan(0);
    });

    it("imports selected catalog entries into exact rules", async () => {
      const importableUpstream: Upstream = {
        ...mockUpstream,
        model_discovery: {
          mode: "openai_compatible",
          enable_lite_llm_fallback: true,
        },
        model_catalog: [
          { model: "gpt-4.1", source: "native" },
          { model: "claude-3.7-sonnet", source: "inferred" },
        ],
        model_catalog_last_status: "success",
        model_catalog_last_error: null,
        model_catalog_updated_at: "2026-04-11T00:00:00Z",
        model_rules: [],
      };

      mockImportCatalogMutateAsync.mockResolvedValueOnce({
        ...importableUpstream,
        model_rules: [
          { type: "exact", model: "gpt-4.1", source: "native" },
          { type: "exact", model: "claude-3.7-sonnet", source: "inferred" },
        ],
      });

      render(
        <UpstreamFormDialog
          upstream={importableUpstream}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: Wrapper }
      );

      ensureAdvancedConfigExpanded();

      fireEvent.click(
        screen.getByRole("checkbox", {
          name: "选择目录模型 gpt-4.1（原生）",
        })
      );
      fireEvent.click(
        screen.getByRole("checkbox", {
          name: "选择目录模型 claude-3.7-sonnet（推断候选）",
        })
      );
      fireEvent.click(screen.getByRole("button", { name: "导入所选模型" }));

      await waitFor(() => {
        expect(mockImportCatalogMutateAsync).toHaveBeenCalledWith({
          id: "upstream-1",
          models: ["gpt-4.1", "claude-3.7-sonnet"],
        });
      });

      expect(screen.getAllByDisplayValue("gpt-4.1").length).toBeGreaterThan(0);
      expect(screen.getAllByDisplayValue("claude-3.7-sonnet").length).toBeGreaterThan(0);
    });

    it("keeps same-name native and inferred catalog entries independently selectable", async () => {
      const duplicateCatalogUpstream: Upstream = {
        ...mockUpstream,
        model_discovery: {
          mode: "openai_compatible",
          enable_lite_llm_fallback: true,
        },
        model_catalog: [
          { model: "gpt-4.1", source: "native" },
          { model: "gpt-4.1", source: "inferred" },
        ],
        model_catalog_last_status: "success",
        model_catalog_last_error: null,
        model_catalog_updated_at: "2026-04-11T00:00:00Z",
        model_rules: [],
      };

      mockImportCatalogMutateAsync.mockResolvedValueOnce({
        ...duplicateCatalogUpstream,
        model_rules: [{ type: "exact", model: "gpt-4.1", source: "native" }],
      });

      render(
        <UpstreamFormDialog
          upstream={duplicateCatalogUpstream}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: Wrapper }
      );

      ensureAdvancedConfigExpanded();

      const nativeCheckbox = screen.getByRole("checkbox", {
        name: "选择目录模型 gpt-4.1（原生）",
      });
      const inferredCheckbox = screen.getByRole("checkbox", {
        name: "选择目录模型 gpt-4.1（推断候选）",
      });

      fireEvent.click(nativeCheckbox);
      expect(nativeCheckbox).toBeChecked();
      expect(inferredCheckbox).not.toBeChecked();

      fireEvent.click(inferredCheckbox);
      expect(nativeCheckbox).toBeChecked();
      expect(inferredCheckbox).toBeChecked();

      fireEvent.click(screen.getByRole("button", { name: "导入所选模型" }));

      await waitFor(() => {
        expect(mockImportCatalogMutateAsync).toHaveBeenCalledWith({
          id: "upstream-1",
          models: ["gpt-4.1"],
        });
      });
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
            spending_rules: null,
            route_capabilities: [],
            model_discovery: {
              mode: "openai_compatible",
              custom_endpoint: null,
              enable_lite_llm_fallback: true,
            },
            model_rules: null,
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
            spending_rules: null,
            route_capabilities: [],
            model_discovery: {
              mode: "openai_compatible",
              custom_endpoint: null,
              enable_lite_llm_fallback: true,
            },
            model_rules: null,
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
