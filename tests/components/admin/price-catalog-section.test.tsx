import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRef, useState } from "react";

import { PriceCatalogSection } from "@/components/admin/billing/price-catalog-section";
import type { useResetBillingManualOverrides } from "@/hooks/use-billing";
import type { BillingManualOverride, BillingModelPrice, BillingTierRule } from "@/types/api";

// PaginationControls (rendered when total_pages > 1) calls next-intl's useTranslations
// directly rather than accepting a `t` prop, so it needs the standard repo-wide mock idiom
// even though PriceCatalogSection itself takes `t`/`tCommon` as props.
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

const mockUseBillingManualOverrides = vi.fn();
const mockUseBillingModelPrices = vi.fn();
const mockUseBillingTierRules = vi.fn();
const mockCreateTierRule = { mutateAsync: vi.fn(), isPending: false };
const mockDeleteTierRule = { mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false };
const mockUpdateTierRule = { mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false };
const mockUpdateOverride = { mutateAsync: vi.fn(), isPending: false };
const mockCreateInlineOverride = { mutateAsync: vi.fn(), isPending: false };

vi.mock("@/hooks/use-billing", () => ({
  useBillingManualOverrides: (...args: unknown[]) => mockUseBillingManualOverrides(...args),
  useBillingModelPrices: (...args: unknown[]) => mockUseBillingModelPrices(...args),
  useBillingTierRules: (...args: unknown[]) => mockUseBillingTierRules(...args),
  useCreateBillingTierRule: () => mockCreateTierRule,
  useDeleteBillingTierRule: () => mockDeleteTierRule,
  useUpdateBillingTierRule: () => mockUpdateTierRule,
  useUpdateBillingManualOverride: () => mockUpdateOverride,
  useCreateBillingManualOverride: () => mockCreateInlineOverride,
}));

const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key;
const tCommon = (key: string) => key;

function makeSyncedItem(overrides: Partial<BillingModelPrice> = {}): BillingModelPrice {
  return {
    id: "price-1",
    model: "gpt-4.1",
    input_price_per_million: 2,
    output_price_per_million: 8,
    cache_read_input_price_per_million: 0.5,
    cache_write_input_price_per_million: 1,
    max_input_tokens: 128000,
    max_output_tokens: 16000,
    synced_tier_rules: [],
    source: "litellm",
    is_active: true,
    synced_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-02T00:00:00Z",
    ...overrides,
  };
}

function makeOverride(overrides: Partial<BillingManualOverride> = {}): BillingManualOverride {
  return {
    id: "override-1",
    model: "gpt-4.1",
    input_price_per_million: 3,
    output_price_per_million: 9,
    cache_read_input_price_per_million: 0.6,
    cache_write_input_price_per_million: 1.2,
    note: "manual note",
    has_official_price: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeTierRule(overrides: Partial<BillingTierRule> = {}): BillingTierRule {
  return {
    id: "tier-1",
    model: "gpt-4.1",
    source: "manual",
    threshold_input_tokens: 200000,
    display_label: null,
    input_price_per_million: 4,
    output_price_per_million: 12,
    cache_read_input_price_per_million: 1,
    cache_write_input_price_per_million: 2,
    note: "tier note",
    is_active: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function modelPricesResult(
  items: BillingModelPrice[],
  overrides: Partial<{
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    isFetching: boolean;
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  }> = {}
) {
  return {
    isLoading: overrides.isLoading ?? false,
    isError: overrides.isError ?? false,
    error: overrides.error ?? null,
    isFetching: overrides.isFetching ?? false,
    data: {
      items,
      page: overrides.page ?? 1,
      page_size: overrides.page_size ?? 20,
      total: overrides.total ?? items.length,
      total_pages: overrides.total_pages ?? 1,
    },
  };
}

// PriceCatalogSection is only handed `selectedResetModels`/`recentlySavedModel` as controlled
// props — it does not own that state itself. This harness mirrors how the real billing page
// wires it, so selection/highlight behavior can be observed end-to-end.
function Harness(props: {
  openResetDialog?: ReturnType<typeof vi.fn>;
  resetOverrides?: { isPending: boolean; mutateAsync: ReturnType<typeof vi.fn> };
  initialSelected?: string[];
}) {
  const [selectedResetModels, setSelectedResetModels] = useState<string[]>(
    props.initialSelected ?? []
  );
  const [recentlySavedModel, setRecentlySavedModel] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  return (
    <PriceCatalogSection
      t={t}
      tCommon={tCommon}
      locale="en"
      priceCatalogRef={ref}
      recentlySavedModel={recentlySavedModel}
      setRecentlySavedModel={setRecentlySavedModel}
      selectedResetModels={selectedResetModels}
      setSelectedResetModels={setSelectedResetModels}
      openResetDialog={props.openResetDialog ?? vi.fn()}
      resetOverrides={
        (props.resetOverrides ?? {
          isPending: false,
          mutateAsync: vi.fn(),
        }) as unknown as ReturnType<typeof useResetBillingManualOverrides>
      }
    />
  );
}

// The mobile card list and the desktop table both render unconditionally in jsdom (the
// "hidden"/"lg:block" Tailwind classes that pick one or the other are not computed by
// jsdom's layout-less environment), so every row's text/controls exist twice in the DOM.
// Row-scoped queries must be scoped to one of the two renderings — the desktop <table> — to
// avoid "multiple elements found" errors and to assert against a single, real element.
function getDesktopTable(): HTMLElement {
  return screen.getByText("priceCatalogModel").closest("table") as HTMLElement;
}

describe("PriceCatalogSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBillingManualOverrides.mockReturnValue({ data: { items: [], total: 0 } });
    mockUseBillingModelPrices.mockReturnValue(modelPricesResult([]));
    mockUseBillingTierRules.mockReturnValue({ data: { items: [] } });
    mockCreateTierRule.mutateAsync.mockResolvedValue(undefined);
    mockCreateTierRule.isPending = false;
    mockUpdateOverride.mutateAsync.mockResolvedValue(undefined);
    mockCreateInlineOverride.mutateAsync.mockResolvedValue(undefined);
  });

  describe("query states", () => {
    it("renders the title/description and shows the loading indicator", () => {
      mockUseBillingModelPrices.mockReturnValue(modelPricesResult([], { isLoading: true }));
      render(<Harness />);

      expect(screen.getByText("priceCatalogTitle")).toBeInTheDocument();
      expect(screen.getByText("priceCatalogDesc")).toBeInTheDocument();
      expect(screen.getByText("loading")).toBeInTheDocument();
    });

    it("shows the error message when the model-prices query fails", () => {
      mockUseBillingModelPrices.mockReturnValue(
        modelPricesResult([], { isError: true, error: new Error("boom") })
      );
      render(<Harness />);

      expect(screen.getByText("Error: boom")).toBeInTheDocument();
    });

    it("shows the empty state when there are no synced items, overrides, or tier-only models", () => {
      render(<Harness />);
      expect(screen.getByText("priceCatalogEmpty")).toBeInTheDocument();
    });
  });

  describe("search debounce", () => {
    it("only re-queries model prices 300ms after the user stops typing", () => {
      vi.useFakeTimers();
      try {
        render(<Harness />);
        mockUseBillingModelPrices.mockClear();

        const input = screen.getByPlaceholderText("priceCatalogSearchPlaceholder");
        fireEvent.change(input, { target: { value: "gpt" } });

        // Immediately after typing, no new query should have fired yet.
        act(() => {
          vi.advanceTimersByTime(200);
        });
        expect(mockUseBillingModelPrices).not.toHaveBeenCalledWith(1, 20, "gpt");

        // After the full 300ms debounce window, the trimmed query and reset page fire.
        act(() => {
          vi.advanceTimersByTime(150);
        });
        expect(mockUseBillingModelPrices).toHaveBeenCalledWith(1, 20, "gpt");
      } finally {
        vi.useRealTimers();
      }
    });

    it("trims whitespace from the debounced query", () => {
      vi.useFakeTimers();
      try {
        render(<Harness />);
        const input = screen.getByPlaceholderText("priceCatalogSearchPlaceholder");
        fireEvent.change(input, { target: { value: "  gpt-4.1  " } });
        act(() => {
          vi.advanceTimersByTime(300);
        });

        expect(mockUseBillingModelPrices).toHaveBeenCalledWith(1, 20, "gpt-4.1");
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("only-manual toggle", () => {
    it("filters the synced rows down to those with a manual override once enabled", () => {
      const withOverride = makeSyncedItem({ id: "p1", model: "has-override" });
      const withoutOverride = makeSyncedItem({ id: "p2", model: "no-override" });
      mockUseBillingModelPrices.mockReturnValue(modelPricesResult([withOverride, withoutOverride]));
      mockUseBillingManualOverrides.mockReturnValue({
        data: { items: [makeOverride({ model: "has-override" })], total: 1 },
      });

      render(<Harness />);

      expect(screen.getAllByText("has-override").length).toBeGreaterThan(0);
      expect(screen.getAllByText("no-override").length).toBeGreaterThan(0);

      const toggle = screen.getByRole("switch", { name: "priceCatalogOnlyManual" });
      fireEvent.click(toggle);

      expect(screen.getAllByText("has-override").length).toBeGreaterThan(0);
      expect(screen.queryByText("no-override")).not.toBeInTheDocument();
    });
  });

  describe("tier-rule create form", () => {
    it("is collapsed by default and expands when the add button is clicked", () => {
      render(<Harness />);

      expect(screen.queryByTestId("billing-tier-rule-create-form")).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId("billing-tier-rule-add-button"));
      expect(screen.getByTestId("billing-tier-rule-create-form")).toBeInTheDocument();
    });

    it("blocks submission when required fields are empty", () => {
      render(<Harness />);
      fireEvent.click(screen.getByTestId("billing-tier-rule-add-button"));

      // Only the model is filled; threshold/input/output are left empty.
      fireEvent.change(screen.getByTestId("billing-tier-rule-model-input"), {
        target: { value: "claude-3" },
      });
      fireEvent.click(screen.getByTestId("billing-tier-rule-save-button"));

      expect(mockCreateTierRule.mutateAsync).not.toHaveBeenCalled();
      // The form stays open on validation failure.
      expect(screen.getByTestId("billing-tier-rule-create-form")).toBeInTheDocument();
    });

    it("submits the create payload with parsed numeric fields and closes the form on success", async () => {
      render(<Harness />);
      fireEvent.click(screen.getByTestId("billing-tier-rule-add-button"));

      fireEvent.change(screen.getByTestId("billing-tier-rule-model-input"), {
        target: { value: "claude-3" },
      });
      fireEvent.change(screen.getByTestId("billing-tier-rule-threshold-input"), {
        target: { value: "128000" },
      });
      fireEvent.change(screen.getByTestId("billing-tier-rule-input-price-input"), {
        target: { value: "1.5" },
      });
      fireEvent.change(screen.getByTestId("billing-tier-rule-output-price-input"), {
        target: { value: "6" },
      });
      fireEvent.change(screen.getByTestId("billing-tier-rule-cache-read-input"), {
        target: { value: "0.3" },
      });
      fireEvent.change(screen.getByTestId("billing-tier-rule-note-input"), {
        target: { value: "seeded" },
      });

      await fireEvent.click(screen.getByTestId("billing-tier-rule-save-button"));

      expect(mockCreateTierRule.mutateAsync).toHaveBeenCalledWith({
        model: "claude-3",
        threshold_input_tokens: 128000,
        input_price_per_million: 1.5,
        output_price_per_million: 6,
        cache_read_input_price_per_million: 0.3,
        cache_write_input_price_per_million: null,
        note: "seeded",
      });
    });

    it("cancel closes the form, resets the draft, and does not submit", () => {
      render(<Harness />);
      fireEvent.click(screen.getByTestId("billing-tier-rule-add-button"));
      fireEvent.change(screen.getByTestId("billing-tier-rule-model-input"), {
        target: { value: "claude-3" },
      });

      fireEvent.click(screen.getByTestId("billing-tier-rule-cancel-button"));

      expect(screen.queryByTestId("billing-tier-rule-create-form")).not.toBeInTheDocument();
      expect(mockCreateTierRule.mutateAsync).not.toHaveBeenCalled();

      // Reopening shows a blank draft again (state was reset, not just hidden).
      fireEvent.click(screen.getByTestId("billing-tier-rule-add-button"));
      expect((screen.getByTestId("billing-tier-rule-model-input") as HTMLInputElement).value).toBe(
        ""
      );
    });
  });

  describe("bulk selection", () => {
    it("selecting the header checkbox selects every overridable model on screen", () => {
      const withOverride1 = makeSyncedItem({ id: "p1", model: "model-a" });
      const withOverride2 = makeSyncedItem({ id: "p2", model: "model-b" });
      mockUseBillingModelPrices.mockReturnValue(modelPricesResult([withOverride1, withOverride2]));
      mockUseBillingManualOverrides.mockReturnValue({
        data: {
          items: [makeOverride({ model: "model-a" }), makeOverride({ model: "model-b" })],
          total: 2,
        },
      });

      render(<Harness />);

      // "priceCatalogSelectAll" is used by both the mobile bulk-select-all row and the
      // desktop table header checkbox; scope to the desktop table for a single match.
      const headerCheckbox = within(getDesktopTable()).getByRole("checkbox", {
        name: "priceCatalogSelectAll",
      });
      fireEvent.click(headerCheckbox);

      expect(screen.getByText('priceCatalogSelectedHint:{"count":2}')).toBeInTheDocument();
    });

    it("clicking the bulk-reset button calls openResetDialog with the selected models", () => {
      const withOverride = makeSyncedItem({ id: "p1", model: "model-a" });
      mockUseBillingModelPrices.mockReturnValue(modelPricesResult([withOverride]));
      mockUseBillingManualOverrides.mockReturnValue({
        data: { items: [makeOverride({ model: "model-a" })], total: 1 },
      });
      const openResetDialog = vi.fn();

      render(<Harness openResetDialog={openResetDialog} initialSelected={["model-a"]} />);

      fireEvent.click(screen.getByText("priceCatalogBulkReset"));

      expect(openResetDialog).toHaveBeenCalledWith(["model-a"]);
    });

    it("clear-selection empties the selected list and hides the bulk-action bar", () => {
      const withOverride = makeSyncedItem({ id: "p1", model: "model-a" });
      mockUseBillingModelPrices.mockReturnValue(modelPricesResult([withOverride]));
      mockUseBillingManualOverrides.mockReturnValue({
        data: { items: [makeOverride({ model: "model-a" })], total: 1 },
      });

      render(<Harness initialSelected={["model-a"]} />);

      expect(screen.getByText("priceCatalogClearSelection")).toBeInTheDocument();
      fireEvent.click(screen.getByText("priceCatalogClearSelection"));

      expect(screen.queryByText("priceCatalogClearSelection")).not.toBeInTheDocument();
    });

    it("toggling an individual row checkbox adds only that model to the selection", () => {
      const withOverride1 = makeSyncedItem({ id: "p1", model: "model-a" });
      const withOverride2 = makeSyncedItem({ id: "p2", model: "model-b" });
      mockUseBillingModelPrices.mockReturnValue(modelPricesResult([withOverride1, withOverride2]));
      mockUseBillingManualOverrides.mockReturnValue({
        data: {
          items: [makeOverride({ model: "model-a" }), makeOverride({ model: "model-b" })],
          total: 2,
        },
      });

      render(<Harness />);

      const checkbox = within(getDesktopTable()).getByRole("checkbox", {
        name: 'priceCatalogSelectModel:{"model":"model-a"}',
      });
      fireEvent.click(checkbox);

      expect(screen.getByText('priceCatalogSelectedHint:{"count":1}')).toBeInTheDocument();
    });
  });

  describe("inline price editing", () => {
    it("editing and saving a synced row without an override creates an inline override with only price/note fields", () => {
      const synced = makeSyncedItem({ id: "p1", model: "model-a" });
      mockUseBillingModelPrices.mockReturnValue(modelPricesResult([synced]));

      render(<Harness />);

      // "2.0000" and the input fields it turns into on click render in both the mobile
      // card and the desktop row (both mount unconditionally in jsdom); scope to the
      // desktop table so each query resolves to exactly one element.
      const desktopTable = getDesktopTable();
      fireEvent.click(within(desktopTable).getByText("2.0000"));

      const inputCell = within(desktopTable).getByDisplayValue("2");
      fireEvent.change(inputCell, { target: { value: "5" } });

      const saveButton = within(desktopTable)
        .getAllByRole("button")
        .find((btn) => btn.className.includes("text-status-success")) as HTMLButtonElement;
      fireEvent.click(saveButton);

      // useBillingPriceRowEdit.saveEdit() sends `editDraft.note.trim() || null`, so an
      // untouched (empty) note draft is submitted as `null`, not `""`.
      expect(mockCreateInlineOverride.mutateAsync).toHaveBeenCalledWith({
        model: "model-a",
        input_price_per_million: 5,
        output_price_per_million: 8,
        cache_read_input_price_per_million: 0.5,
        cache_write_input_price_per_million: 1,
        note: null,
      });
    });

    it("editing and saving a row with an existing override updates it by id", () => {
      const synced = makeSyncedItem({ id: "p1", model: "model-a" });
      const override = makeOverride({ id: "override-77", model: "model-a" });
      mockUseBillingModelPrices.mockReturnValue(modelPricesResult([synced]));
      mockUseBillingManualOverrides.mockReturnValue({ data: { items: [override], total: 1 } });

      render(<Harness />);

      const desktopTable = getDesktopTable();
      fireEvent.click(within(desktopTable).getByText("3.0000"));
      const noteInput = within(desktopTable).getByDisplayValue("manual note");
      fireEvent.change(noteInput, { target: { value: "updated note" } });

      const saveButton = within(desktopTable)
        .getAllByRole("button")
        .find((btn) => btn.className.includes("text-status-success")) as HTMLButtonElement;
      fireEvent.click(saveButton);

      expect(mockUpdateOverride.mutateAsync).toHaveBeenCalledWith({
        id: "override-77",
        data: {
          input_price_per_million: 3,
          output_price_per_million: 9,
          cache_read_input_price_per_million: 0.6,
          cache_write_input_price_per_million: 1.2,
          note: "updated note",
        },
      });
    });
  });

  describe("extra manual-override and tier-only rows", () => {
    it("renders a manual override for a model not present in the synced catalog as an extra row once 'only manual' is enabled", () => {
      // By component design, a manual override outside the synced catalog only surfaces
      // once the user either searches or flips "only manual" — with an empty query and
      // the toggle off, `manualOverrideMatches` is intentionally empty (see
      // priceCatalogSection's useMemo) to avoid flooding the default paginated view.
      mockUseBillingModelPrices.mockReturnValue(modelPricesResult([]));
      mockUseBillingManualOverrides.mockReturnValue({
        data: { items: [makeOverride({ model: "manual-only-model" })], total: 1 },
      });

      render(<Harness />);
      expect(screen.queryByText("manual-only-model")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("switch", { name: "priceCatalogOnlyManual" }));

      expect(screen.getAllByText("manual-only-model").length).toBeGreaterThan(0);
      expect(screen.getByText('priceCatalogManualOverridesHint:{"count":1}')).toBeInTheDocument();
    });

    it("renders a tier-only model (manual tier rule with no price row) with the tier badge", () => {
      mockUseBillingModelPrices.mockReturnValue(modelPricesResult([]));
      mockUseBillingTierRules.mockReturnValue({
        data: { items: [makeTierRule({ model: "tier-only-model", source: "manual" })] },
      });

      render(<Harness />);

      expect(screen.getAllByText("tier-only-model").length).toBeGreaterThan(0);
      expect(screen.getAllByText("tierRulesTitle").length).toBeGreaterThan(0);
    });

    it("expands the tier sub-table for a tier-only model when its chevron is clicked", () => {
      mockUseBillingModelPrices.mockReturnValue(modelPricesResult([]));
      mockUseBillingTierRules.mockReturnValue({
        data: {
          items: [
            makeTierRule({
              model: "tier-only-model",
              source: "manual",
              threshold_input_tokens: 64000,
            }),
          ],
        },
      });

      render(<Harness />);

      const desktopTable = getDesktopTable();
      const expandButton = within(desktopTable).getByTitle("priceCatalogExpandTiers");
      fireEvent.click(expandButton);

      // The mobile card list renders the same tier-only model unconditionally too (sharing
      // the same `expandedPriceRows` state), and the desktop row's own collapsed "threshold"
      // column also renders this same translated string — so scope the assertion to the
      // nested `BillingTierSubTable` (the only <table> nested inside the desktop table).
      const subTable = within(desktopTable).getByRole("table");
      expect(
        within(subTable).getByText('tierRulesThresholdTokens:{"count":64}')
      ).toBeInTheDocument();
    });
  });
});
