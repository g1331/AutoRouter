import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { BillingPriceRow } from "@/components/admin/billing/billing-price-row";
import type { BillingPriceRowEditApi } from "@/components/admin/billing/use-billing-price-row-edit";
import type {
  useDeleteBillingTierRule,
  useResetBillingManualOverrides,
  useUpdateBillingTierRule,
} from "@/hooks/use-billing";
import type { BillingManualOverride, BillingModelPrice, BillingTierRule } from "@/types/api";

// BillingPriceRow returns a <TableRow>/<TableCell> pair (plus an optional expanded
// row), so it must always be mounted inside a real <table><tbody> — React will warn
// (and some assertions on td/tr roles would be meaningless) otherwise.
function renderRow(ui: React.ReactElement) {
  return render(
    <table>
      <tbody>{ui}</tbody>
    </table>
  );
}

const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key;

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

function makeEditApi(overrides: Partial<BillingPriceRowEditApi> = {}): BillingPriceRowEditApi {
  return {
    editTarget: null,
    setEditTarget: vi.fn(),
    editDraft: { input: "", output: "", cacheRead: "", cacheWrite: "", note: "" },
    setDraftField: vi.fn(),
    cancelEditing: vi.fn(),
    editKeyDown: vi.fn(),
    startEditingPrice: vi.fn(),
    startEditingTierRule: vi.fn(),
    startEditingTierOverride: vi.fn(),
    saveEdit: vi.fn().mockResolvedValue(undefined),
    isEditingPrice: vi.fn().mockReturnValue(false),
    isEditingTierRule: vi.fn().mockReturnValue(false),
    isEditingTierOverride: vi.fn().mockReturnValue(false),
    editIsSaving: false,
    ...overrides,
  };
}

function makeMutation() {
  return { mutateAsync: vi.fn().mockResolvedValue(undefined), mutate: vi.fn(), isPending: false };
}

describe("BillingPriceRow", () => {
  let toggleSelectedResetModel: ReturnType<typeof vi.fn>;
  let togglePriceRow: ReturnType<typeof vi.fn>;
  let openResetDialog: ReturnType<typeof vi.fn>;
  let resetOverrides: ReturnType<typeof makeMutation>;
  let updateTierRule: ReturnType<typeof makeMutation>;
  let deleteTierRule: ReturnType<typeof makeMutation>;

  beforeEach(() => {
    toggleSelectedResetModel = vi.fn();
    togglePriceRow = vi.fn();
    openResetDialog = vi.fn();
    resetOverrides = makeMutation();
    updateTierRule = makeMutation();
    deleteTierRule = makeMutation();
  });

  function renderBillingPriceRow(
    params: {
      item?: BillingModelPrice;
      manualOverrideMap?: Map<string, BillingManualOverride>;
      tierRulePreviewMap?: Map<string, BillingTierRule>;
      tierRuleThresholdMap?: Map<string, string>;
      allTierRulesMap?: Map<string, BillingTierRule[]>;
      selectedResetModels?: string[];
      recentlySavedModel?: string | null;
      expandedPriceRows?: Set<string>;
      edit?: BillingPriceRowEditApi;
    } = {}
  ) {
    const item = params.item ?? makeSyncedItem();
    const edit = params.edit ?? makeEditApi();
    const renderResult = renderRow(
      <BillingPriceRow
        item={item}
        manualOverrideMap={params.manualOverrideMap ?? new Map()}
        tierRulePreviewMap={params.tierRulePreviewMap ?? new Map()}
        tierRuleThresholdMap={params.tierRuleThresholdMap ?? new Map()}
        allTierRulesMap={params.allTierRulesMap ?? new Map()}
        selectedResetModels={params.selectedResetModels ?? []}
        toggleSelectedResetModel={toggleSelectedResetModel}
        recentlySavedModel={params.recentlySavedModel ?? null}
        expandedPriceRows={params.expandedPriceRows ?? new Set()}
        togglePriceRow={togglePriceRow}
        openResetDialog={openResetDialog}
        resetOverrides={
          resetOverrides as unknown as ReturnType<typeof useResetBillingManualOverrides>
        }
        edit={edit}
        updateTierRule={updateTierRule as unknown as ReturnType<typeof useUpdateBillingTierRule>}
        deleteTierRule={deleteTierRule as unknown as ReturnType<typeof useDeleteBillingTierRule>}
        t={t}
        locale="en"
      />
    );
    return { item, edit, ...renderResult };
  }

  describe("display mode", () => {
    it("renders the model name and the synced badge when there is no manual override", () => {
      renderBillingPriceRow();

      expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
      expect(screen.getByText("priceCatalogEffectiveSynced")).toBeInTheDocument();
      expect(screen.getByText("litellm")).toBeInTheDocument();
      // No override -> only the effective (synced) number is shown, no "litellm:" sub-line.
      expect(screen.getByText("2.0000")).toBeInTheDocument();
      expect(screen.queryByText(/litellm: 2\.0000/)).not.toBeInTheDocument();
    });

    it("renders the manual-override badge and shows both the effective and the underlying synced price", () => {
      const override = makeOverride();
      renderBillingPriceRow({ manualOverrideMap: new Map([["gpt-4.1", override]]) });

      expect(screen.getByText("priceCatalogEffectiveManual")).toBeInTheDocument();
      // Effective (override) input price.
      expect(screen.getByText("3.0000")).toBeInTheDocument();
      // Secondary line showing the synced value being overridden.
      expect(screen.getByText("litellm: 2.0000")).toBeInTheDocument();
    });

    it("renders a dash when the effective value is null", () => {
      renderBillingPriceRow({
        item: makeSyncedItem({
          cache_read_input_price_per_million: null,
          cache_write_input_price_per_million: null,
        }),
      });

      const dashes = screen.getAllByText("-");
      expect(dashes.length).toBeGreaterThan(0);
    });

    it("clicking the price cell starts editing with the model and existing override", () => {
      const override = makeOverride();
      const edit = makeEditApi();
      renderBillingPriceRow({
        manualOverrideMap: new Map([["gpt-4.1", override]]),
        edit,
      });

      fireEvent.click(screen.getByText("3.0000"));

      expect(edit.startEditingPrice).toHaveBeenCalledWith("gpt-4.1", override);
    });

    it("does not show the reset-to-official button when there is no manual override", () => {
      renderBillingPriceRow();
      expect(screen.queryByTitle("priceCatalogResetToOfficial")).not.toBeInTheDocument();
    });

    it("shows and wires the reset-to-official button when a manual override exists", () => {
      const override = makeOverride();
      renderBillingPriceRow({ manualOverrideMap: new Map([["gpt-4.1", override]]) });

      const resetButton = screen.getByTitle("priceCatalogResetToOfficial");
      fireEvent.click(resetButton);

      expect(openResetDialog).toHaveBeenCalledWith(["gpt-4.1"], expect.any(HTMLElement));
    });

    it("disables the reset button while resetOverrides is pending", () => {
      resetOverrides.isPending = true;
      const override = makeOverride();
      renderBillingPriceRow({ manualOverrideMap: new Map([["gpt-4.1", override]]) });

      expect(screen.getByTitle("priceCatalogResetToOfficial")).toBeDisabled();
    });

    it("shows the checkbox only when a manual override exists, and toggling it reports the model", () => {
      const override = makeOverride();
      renderBillingPriceRow({ manualOverrideMap: new Map([["gpt-4.1", override]]) });

      const checkbox = screen.getByRole("checkbox", {
        name: 'priceCatalogSelectModel:{"model":"gpt-4.1"}',
      });
      fireEvent.click(checkbox);

      expect(toggleSelectedResetModel).toHaveBeenCalledWith("gpt-4.1", true);
    });

    it("does not render a selection checkbox when there is no manual override", () => {
      renderBillingPriceRow();
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });
  });

  describe("tier expand chevron", () => {
    it("does not render an expand chevron when allTierRulesMap has no entries for the model", () => {
      renderBillingPriceRow();
      expect(screen.queryByTitle("priceCatalogExpandTiers")).not.toBeInTheDocument();
    });

    it("renders the expand chevron when allTierRulesMap has entries for the model, and toggles on click", () => {
      const rule = makeTierRule();
      renderBillingPriceRow({ allTierRulesMap: new Map([["gpt-4.1", [rule]]]) });

      const chevron = screen.getByTitle("priceCatalogExpandTiers");
      fireEvent.click(chevron);

      expect(togglePriceRow).toHaveBeenCalledWith("gpt-4.1");
    });

    it("renders the tier sub-table with the threshold row once expanded", () => {
      const rule = makeTierRule({ threshold_input_tokens: 128000 });
      renderBillingPriceRow({
        allTierRulesMap: new Map([["gpt-4.1", [rule]]]),
        expandedPriceRows: new Set(["gpt-4.1"]),
      });

      // BillingTierSubTable renders "tierRulesTitle (<count>)" and the formatted threshold label.
      expect(screen.getByText("tierRulesTitle (1)")).toBeInTheDocument();
      expect(screen.getByText('tierRulesThresholdTokens:{"count":128}')).toBeInTheDocument();
    });
  });

  describe("editing mode", () => {
    it("renders bound input fields and calls setDraftField on change", () => {
      const edit = makeEditApi({
        isEditingPrice: vi.fn().mockReturnValue(true),
        editDraft: { input: "2", output: "8", cacheRead: "0.5", cacheWrite: "1", note: "hi" },
      });
      renderBillingPriceRow({ edit });

      const inputField = screen.getByDisplayValue("2");
      fireEvent.change(inputField, { target: { value: "5" } });

      expect(edit.setDraftField).toHaveBeenCalledWith("input", "5");
    });

    it("disables the confirm (check) button while editIsSaving is true, so clicking it does not call saveEdit", () => {
      const edit = makeEditApi({
        isEditingPrice: vi.fn().mockReturnValue(true),
        editIsSaving: true,
      });
      const { container } = renderBillingPriceRow({ edit });

      const saveButton = container.querySelector("button.text-status-success") as HTMLButtonElement;
      expect(saveButton).toBeDisabled();

      fireEvent.click(saveButton);
      expect(edit.saveEdit).not.toHaveBeenCalled();
    });

    it("calls saveEdit when enabled and cancelEditing on the cancel button", () => {
      const edit = makeEditApi({ isEditingPrice: vi.fn().mockReturnValue(true) });
      const { container } = renderBillingPriceRow({ edit });

      const saveButton = container.querySelector("button.text-status-success") as HTMLButtonElement;
      fireEvent.click(saveButton);
      expect(edit.saveEdit).toHaveBeenCalledTimes(1);

      const buttons = container.querySelectorAll("button");
      const cancelButton = Array.from(buttons).find(
        (b) => b !== saveButton && b.querySelector("svg")
      ) as HTMLButtonElement;
      fireEvent.click(cancelButton);
      expect(edit.cancelEditing).toHaveBeenCalledTimes(1);
    });
  });

  describe("recently saved highlight", () => {
    // The base TableRow classes already contain a "data-[state=selected]:bg-amber-500/10"
    // *variant* token, which is a substring match for a naive `.toContain("bg-amber-500/10")`
    // check even when the row is not highlighted. Use classList.contains for an exact,
    // whitespace-delimited token match instead.
    it("applies the highlight class to the row when recentlySavedModel matches", () => {
      const { container } = renderBillingPriceRow({ recentlySavedModel: "gpt-4.1" });
      const row = container.querySelector("tr");
      expect(row?.classList.contains("bg-amber-500/10")).toBe(true);
    });

    it("does not apply the highlight class when recentlySavedModel does not match", () => {
      const { container } = renderBillingPriceRow({ recentlySavedModel: "other-model" });
      const row = container.querySelector("tr");
      expect(row?.classList.contains("bg-amber-500/10")).toBe(false);
    });
  });
});
