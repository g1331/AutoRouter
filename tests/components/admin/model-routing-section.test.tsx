import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModelRoutingSection } from "@/components/admin/upstream/sections/model-routing-section";
import { buildModelRoutingPayload } from "@/components/admin/upstream/section-payloads";
import { upstreamSectionSchemas } from "@/components/admin/upstream/section-schemas";
import { modelRoutingDefaults } from "@/components/admin/upstream/form-values";
import type { Upstream, UpstreamModelCatalogEntry } from "@/types/api";

/**
 * Behavior tests for ModelRoutingSection (Phase B2 upstream detail page).
 * Covers: model-rule field array add/remove, the alias-rule target_model
 * required-field validation gate on save, catalog search/source filtering,
 * catalog selection + import-into-rules, the refresh-catalog disabled state,
 * and the exact partial-PUT payload shape sent to useUpdateUpstreamSection.
 */

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${namespace}.${key}:${JSON.stringify(vars)}` : `${namespace}.${key}`,
}));

const { mockMutate, mockPreviewMutateAsync } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockPreviewMutateAsync: vi.fn(),
}));

const hookState = {
  isSaving: false,
  isPreviewing: false,
};

vi.mock("@/hooks/use-upstreams", () => ({
  useUpdateUpstreamSection: () => ({ mutate: mockMutate, isPending: hookState.isSaving }),
  usePreviewUpstreamCatalog: () => ({
    mutateAsync: mockPreviewMutateAsync,
    isPending: hookState.isPreviewing,
  }),
}));

// Radix Select requires real layout/pointer-capture APIs jsdom doesn't provide
// once opened. Replace it with a flat, always-rendered stand-in so SelectItem
// clicks can drive onValueChange directly, matching the idiom already used for
// other Select-heavy tests in this repo (see traffic-recording-page.test.tsx).
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const ValueChangeContext = React.createContext<((value: string) => void) | undefined>(undefined);

  function Select({
    children,
    onValueChange,
  }: {
    children: React.ReactNode;
    onValueChange?: (value: string) => void;
  }) {
    return React.createElement(ValueChangeContext.Provider, { value: onValueChange }, children);
  }
  const SelectTrigger = React.forwardRef(function SelectTrigger(
    props: React.ComponentPropsWithoutRef<"button">,
    ref: React.Ref<HTMLButtonElement>
  ) {
    const { children, ...rest } = props;
    return React.createElement("button", { type: "button", ref, ...rest }, children);
  });
  function SelectValue({ placeholder }: { placeholder?: React.ReactNode }) {
    return React.createElement("span", null, placeholder ?? null);
  }
  function SelectContent({ children }: { children: React.ReactNode }) {
    return React.createElement("div", null, children);
  }
  function SelectItem({ children, value }: { children: React.ReactNode; value: string }) {
    const onValueChange = React.useContext(ValueChangeContext);
    return React.createElement(
      "button",
      { type: "button", onClick: () => onValueChange?.(value) },
      children
    );
  }

  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

beforeEach(() => {
  mockMutate.mockReset();
  mockPreviewMutateAsync.mockReset();
  hookState.isSaving = false;
  hookState.isPreviewing = false;
});

function buildUpstream(overrides: Partial<Upstream> = {}): Upstream {
  return {
    id: "upstream-1",
    name: "Test Upstream",
    base_url: "https://api.example.com/v1",
    official_website_url: null,
    description: null,
    api_key_masked: "sk-***1234",
    is_default: false,
    timeout: 60,
    is_active: true,
    current_concurrency: 0,
    max_concurrency: null,
    queue_policy: null,
    failure_rule_config: null,
    weight: 1,
    priority: 0,
    health_status: null,
    probe_results: [],
    circuit_breaker: null,
    route_capabilities: ["openai_chat_compatible"],
    allowed_models: null,
    model_redirects: null,
    model_discovery: {
      mode: "openai_compatible",
      custom_endpoint: null,
      enable_lite_llm_fallback: false,
      auto_refresh_enabled: false,
    },
    model_catalog: [],
    model_catalog_updated_at: null,
    model_catalog_last_status: null,
    model_catalog_last_error: null,
    model_catalog_last_failed_at: null,
    model_rules: null,
    affinity_migration: null,
    billing_input_multiplier: 1,
    billing_output_multiplier: 1,
    spending_rules: null,
    last_used_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("ModelRoutingSection", () => {
  it("adds and removes a model rule via the field array", () => {
    const upstream = buildUpstream();
    render(<ModelRoutingSection upstream={upstream} />);

    expect(screen.getByText("upstreams.modelRulesEmpty")).toBeInTheDocument();
    const rulesHeading = screen.getByText("upstreams.modelRulesSectionTitle");
    expect(rulesHeading.parentElement).toHaveTextContent("0");

    fireEvent.click(screen.getByRole("button", { name: "upstreams.addModelRule" }));

    expect(screen.queryByText("upstreams.modelRulesEmpty")).not.toBeInTheDocument();
    expect(rulesHeading.parentElement).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: "upstreams.removeModelRule" }));

    expect(screen.getByText("upstreams.modelRulesEmpty")).toBeInTheDocument();
    expect(rulesHeading.parentElement).toHaveTextContent("0");
  });

  it("requires target_model once a rule is switched to alias, blocks submit, then saves with the buildModelRoutingPayload shape", async () => {
    const upstream = buildUpstream();
    render(<ModelRoutingSection upstream={upstream} />);

    fireEvent.click(screen.getByRole("button", { name: "upstreams.addModelRule" }));

    fireEvent.change(screen.getByLabelText("upstreams.modelRuleValue"), {
      target: { value: "custom-alias" },
    });

    fireEvent.click(screen.getByRole("button", { name: "upstreams.modelRuleTypeLabel_alias" }));

    expect(screen.getByLabelText("upstreams.targetModel")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() =>
      expect(screen.getByText("upstreams.modelRuleAliasTargetRequired")).toBeInTheDocument()
    );
    expect(mockMutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("upstreams.targetModel"), {
      target: { value: "gpt-4-target" },
    });

    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    const expectedValues = upstreamSectionSchemas["model-routing"].parse({
      model_discovery: modelRoutingDefaults(upstream).model_discovery,
      model_rules: [
        {
          type: "alias",
          value: "custom-alias",
          target_model: "gpt-4-target",
          source: "manual",
          display_label: null,
        },
      ],
    });
    const expectedPayload = buildModelRoutingPayload(expectedValues);

    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith(
        { id: upstream.id, payload: expectedPayload },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      )
    );
  });

  it("narrows visible catalog entries by search query", () => {
    const catalog: UpstreamModelCatalogEntry[] = [
      { model: "gpt-4o", source: "native" },
      { model: "gpt-4o-mini", source: "native" },
      { model: "claude-3-opus", source: "inferred" },
    ];
    const upstream = buildUpstream({
      model_catalog: catalog,
      model_catalog_updated_at: "2026-01-01T00:00:00.000Z",
      model_catalog_last_status: "success",
    });
    render(<ModelRoutingSection upstream={upstream} />);

    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o-mini")).toBeInTheDocument();
    expect(screen.getByText("claude-3-opus")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("upstreams.catalogSearchPlaceholder"), {
      target: { value: "gpt" },
    });

    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o-mini")).toBeInTheDocument();
    expect(screen.queryByText("claude-3-opus")).not.toBeInTheDocument();
  });

  it("narrows visible catalog entries by source filter", () => {
    const catalog: UpstreamModelCatalogEntry[] = [
      { model: "gpt-4o", source: "native" },
      { model: "gpt-4o-mini", source: "native" },
      { model: "claude-3-opus", source: "inferred" },
    ];
    const upstream = buildUpstream({
      model_catalog: catalog,
      model_catalog_updated_at: "2026-01-01T00:00:00.000Z",
      model_catalog_last_status: "success",
    });
    render(<ModelRoutingSection upstream={upstream} />);

    fireEvent.click(screen.getByRole("button", { name: "upstreams.modelRuleSource_inferred" }));

    expect(screen.queryByText("gpt-4o")).not.toBeInTheDocument();
    expect(screen.queryByText("gpt-4o-mini")).not.toBeInTheDocument();
    expect(screen.getByText("claude-3-opus")).toBeInTheDocument();
  });

  it("selects visible catalog entries, clears the selection, and imports selected models into rules", () => {
    const catalog: UpstreamModelCatalogEntry[] = [
      { model: "gpt-4o", source: "native" },
      { model: "gpt-4o-mini", source: "native" },
    ];
    const upstream = buildUpstream({
      model_catalog: catalog,
      model_catalog_updated_at: "2026-01-01T00:00:00.000Z",
      model_catalog_last_status: "success",
    });
    render(<ModelRoutingSection upstream={upstream} />);

    fireEvent.click(screen.getByRole("button", { name: "upstreams.catalogSelectVisible" }));

    expect(
      screen.getByText('upstreams.catalogSelectionFeedback:{"selected":2,"visible":2}')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "upstreams.catalogClearSelection" }));

    expect(
      screen.getByText('upstreams.catalogSelectionFeedback:{"selected":0,"visible":0}')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "upstreams.catalogSelectVisible" }));
    fireEvent.click(screen.getByRole("button", { name: /upstreams\.catalogImportScope/ }));

    expect(screen.getByDisplayValue("gpt-4o")).toBeInTheDocument();
    expect(screen.getByDisplayValue("gpt-4o-mini")).toBeInTheDocument();
    const rulesHeading = screen.getByText("upstreams.modelRulesSectionTitle");
    expect(rulesHeading.parentElement).toHaveTextContent("2");
    expect(
      screen.getByText('upstreams.catalogSelectionFeedback:{"selected":0,"visible":0}')
    ).toBeInTheDocument();
  });

  it("disables the refresh-catalog button when base_url is empty and enables it otherwise", () => {
    const emptyBaseUrlUpstream = buildUpstream({ base_url: "" });
    const { rerender } = render(<ModelRoutingSection upstream={emptyBaseUrlUpstream} />);
    expect(screen.getByRole("button", { name: "upstreams.refreshCatalog" })).toBeDisabled();

    const withBaseUrlUpstream = buildUpstream({ base_url: "https://api.example.com/v1" });
    rerender(<ModelRoutingSection upstream={withBaseUrlUpstream} />);
    expect(screen.getByRole("button", { name: "upstreams.refreshCatalog" })).toBeEnabled();
  });
});
