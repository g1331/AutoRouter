import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useBillingPriceRowEdit } from "@/components/admin/billing/use-billing-price-row-edit";
import type { BillingManualOverride, BillingModelPrice, BillingTierRule } from "@/types/api";

// use-billing-price-row-edit.ts 只消费已构造好的 mutation 对象（useMutation 的返回值），
// 不自己调用 useAuth / useQuery，因此测试里直接传入形状兼容的桩对象即可，
// 无需 QueryClientProvider 或 mock @/providers/auth-provider。
function makeMutation() {
  return {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  };
}

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
    updated_at: "2024-01-01T00:00:00Z",
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

describe("useBillingPriceRowEdit", () => {
  let updateOverride: ReturnType<typeof makeMutation>;
  let createInlineOverride: ReturnType<typeof makeMutation>;
  let updateTierRule: ReturnType<typeof makeMutation>;
  let createTierRule: ReturnType<typeof makeMutation>;
  let setRecentlySavedModel: ReturnType<typeof vi.fn>;

  function setup(
    params: {
      manualOverrideMap?: Map<string, BillingManualOverride>;
      priceCatalogSyncedItems?: BillingModelPrice[];
      allTierRulesMap?: Map<string, BillingTierRule[]>;
    } = {}
  ) {
    return renderHook(() =>
      useBillingPriceRowEdit({
        manualOverrideMap: params.manualOverrideMap ?? new Map(),
        priceCatalogSyncedItems: params.priceCatalogSyncedItems ?? [],
        allTierRulesMap: params.allTierRulesMap ?? new Map(),
        // The hook only reads `.mutateAsync` / `.isPending` from these — cast keeps the
        // fixtures free of the rest of TanStack Query's UseMutationResult surface.
        updateOverride: updateOverride as unknown as Parameters<
          typeof useBillingPriceRowEdit
        >[0]["updateOverride"],
        createInlineOverride: createInlineOverride as unknown as Parameters<
          typeof useBillingPriceRowEdit
        >[0]["createInlineOverride"],
        updateTierRule: updateTierRule as unknown as Parameters<
          typeof useBillingPriceRowEdit
        >[0]["updateTierRule"],
        createTierRule: createTierRule as unknown as Parameters<
          typeof useBillingPriceRowEdit
        >[0]["createTierRule"],
        setRecentlySavedModel,
      })
    );
  }

  beforeEach(() => {
    updateOverride = makeMutation();
    createInlineOverride = makeMutation();
    updateTierRule = makeMutation();
    createTierRule = makeMutation();
    setRecentlySavedModel = vi.fn();
  });

  describe("begin edit", () => {
    it("startEditingPrice without an existing override seeds the draft from the synced item", () => {
      const synced = makeSyncedItem();
      const { result } = setup({ priceCatalogSyncedItems: [synced] });

      act(() => result.current.startEditingPrice("gpt-4.1", null));

      expect(result.current.editTarget).toEqual({ kind: "price", model: "gpt-4.1" });
      expect(result.current.editDraft).toEqual({
        input: "2",
        output: "8",
        cacheRead: "0.5",
        cacheWrite: "1",
        note: "",
      });
      expect(result.current.isEditingPrice("gpt-4.1")).toBe(true);
      expect(result.current.isEditingPrice("other-model")).toBe(false);
    });

    it("startEditingPrice with an existing override seeds the draft from the override", () => {
      const override = makeOverride();
      const { result } = setup();

      act(() => result.current.startEditingPrice("gpt-4.1", override));

      expect(result.current.editDraft).toEqual({
        input: "3",
        output: "9",
        cacheRead: "0.6",
        cacheWrite: "1.2",
        note: "manual note",
      });
    });

    it("startEditingTierRule seeds the draft from the manual rule", () => {
      const rule = makeTierRule({ id: "tier-9", model: "claude-3" });
      const { result } = setup();

      act(() => result.current.startEditingTierRule(rule));

      expect(result.current.editTarget).toEqual({
        kind: "tierRule",
        ruleId: "tier-9",
        model: "claude-3",
      });
      expect(result.current.isEditingTierRule("tier-9")).toBe(true);
      expect(result.current.editDraft.input).toBe("4");
    });

    it("startEditingTierOverride seeds the draft from the litellm tier rule", () => {
      const rule = makeTierRule({ source: "litellm", threshold_input_tokens: 500000 });
      const { result } = setup();

      act(() => result.current.startEditingTierOverride("gpt-4.1", rule));

      expect(result.current.editTarget).toEqual({
        kind: "tierOverride",
        model: "gpt-4.1",
        threshold: 500000,
      });
      expect(result.current.isEditingTierOverride("gpt-4.1", 500000)).toBe(true);
    });
  });

  describe("draft updates", () => {
    it("setDraftField only updates the targeted field", () => {
      const { result } = setup();
      act(() => result.current.startEditingPrice("gpt-4.1", null));

      act(() => result.current.setDraftField("input", "12.5"));

      expect(result.current.editDraft.input).toBe("12.5");
      expect(result.current.editDraft.output).toBe("");
    });
  });

  describe("validate failure keeps editing", () => {
    it("does not call any mutation and stays in edit mode when the required price is invalid", async () => {
      const { result } = setup();
      act(() => result.current.startEditingPrice("gpt-4.1", null));
      act(() => result.current.setDraftField("input", "not-a-number"));
      act(() => result.current.setDraftField("output", "8"));

      await act(async () => {
        await result.current.saveEdit();
      });

      expect(createInlineOverride.mutateAsync).not.toHaveBeenCalled();
      expect(updateOverride.mutateAsync).not.toHaveBeenCalled();
      expect(result.current.editTarget).toEqual({ kind: "price", model: "gpt-4.1" });
    });

    it("does not save when an optional cache price is invalid", async () => {
      const { result } = setup();
      act(() => result.current.startEditingPrice("gpt-4.1", null));
      act(() => result.current.setDraftField("input", "2"));
      act(() => result.current.setDraftField("output", "8"));
      act(() => result.current.setDraftField("cacheRead", "-1"));

      await act(async () => {
        await result.current.saveEdit();
      });

      expect(createInlineOverride.mutateAsync).not.toHaveBeenCalled();
      expect(result.current.editTarget).not.toBeNull();
    });
  });

  describe("save calls the passed mutation with correct payload", () => {
    it("price kind without an existing override creates an inline override and marks it recently saved", async () => {
      const { result } = setup();
      act(() => result.current.startEditingPrice("gpt-4.1", null));
      act(() => {
        result.current.setDraftField("input", "2");
        result.current.setDraftField("output", "8");
        result.current.setDraftField("note", "hello");
      });

      await act(async () => {
        await result.current.saveEdit();
      });

      expect(createInlineOverride.mutateAsync).toHaveBeenCalledWith({
        model: "gpt-4.1",
        input_price_per_million: 2,
        output_price_per_million: 8,
        cache_read_input_price_per_million: null,
        cache_write_input_price_per_million: null,
        note: "hello",
      });
      expect(updateOverride.mutateAsync).not.toHaveBeenCalled();
      expect(setRecentlySavedModel).toHaveBeenCalledWith("gpt-4.1");
      // cancelEditing runs after a successful save.
      expect(result.current.editTarget).toBeNull();
    });

    it("price kind with an existing override updates it by id", async () => {
      const override = makeOverride({ id: "override-42" });
      const manualOverrideMap = new Map([["gpt-4.1", override]]);
      const { result } = setup({ manualOverrideMap });
      act(() => result.current.startEditingPrice("gpt-4.1", override));
      act(() => result.current.setDraftField("input", "5"));

      await act(async () => {
        await result.current.saveEdit();
      });

      expect(updateOverride.mutateAsync).toHaveBeenCalledWith({
        id: "override-42",
        data: {
          input_price_per_million: 5,
          output_price_per_million: 9,
          cache_read_input_price_per_million: 0.6,
          cache_write_input_price_per_million: 1.2,
          note: "manual note",
        },
      });
      expect(createInlineOverride.mutateAsync).not.toHaveBeenCalled();
    });

    it("tierRule kind updates the manual rule by its id", async () => {
      const rule = makeTierRule({ id: "tier-7" });
      const { result } = setup();
      act(() => result.current.startEditingTierRule(rule));
      act(() => result.current.setDraftField("output", "20"));

      await act(async () => {
        await result.current.saveEdit();
      });

      expect(updateTierRule.mutateAsync).toHaveBeenCalledWith({
        id: "tier-7",
        data: {
          input_price_per_million: 4,
          output_price_per_million: 20,
          cache_read_input_price_per_million: 1,
          cache_write_input_price_per_million: 2,
          note: "tier note",
        },
      });
    });

    it("tierOverride kind without a matching manual rule creates a new manual tier rule", async () => {
      const litellmRule = makeTierRule({ source: "litellm", threshold_input_tokens: 300000 });
      const { result } = setup();
      act(() => result.current.startEditingTierOverride("gpt-4.1", litellmRule));
      act(() => result.current.setDraftField("input", "6"));

      await act(async () => {
        await result.current.saveEdit();
      });

      expect(createTierRule.mutateAsync).toHaveBeenCalledWith({
        model: "gpt-4.1",
        threshold_input_tokens: 300000,
        input_price_per_million: 6,
        output_price_per_million: 12,
        cache_read_input_price_per_million: 1,
        cache_write_input_price_per_million: 2,
        note: "tier note",
      });
      expect(updateTierRule.mutateAsync).not.toHaveBeenCalled();
    });

    it("tierOverride kind with an existing manual override at the same threshold updates it instead", async () => {
      const litellmRule = makeTierRule({ source: "litellm", threshold_input_tokens: 300000 });
      const existingManualRule = makeTierRule({
        id: "manual-existing",
        source: "manual",
        threshold_input_tokens: 300000,
      });
      const allTierRulesMap = new Map([["gpt-4.1", [litellmRule, existingManualRule]]]);
      const { result } = setup({ allTierRulesMap });
      act(() => result.current.startEditingTierOverride("gpt-4.1", litellmRule));

      await act(async () => {
        await result.current.saveEdit();
      });

      expect(updateTierRule.mutateAsync).toHaveBeenCalledWith({
        id: "manual-existing",
        data: expect.objectContaining({ input_price_per_million: 4 }),
      });
      expect(createTierRule.mutateAsync).not.toHaveBeenCalled();
    });

    it("keeps editing when the mutation rejects", async () => {
      createInlineOverride.mutateAsync.mockRejectedValueOnce(new Error("network error"));
      const { result } = setup();
      act(() => result.current.startEditingPrice("gpt-4.1", null));
      act(() => {
        result.current.setDraftField("input", "2");
        result.current.setDraftField("output", "8");
      });

      await act(async () => {
        await result.current.saveEdit();
      });

      expect(result.current.editTarget).toEqual({ kind: "price", model: "gpt-4.1" });
      expect(setRecentlySavedModel).not.toHaveBeenCalled();
    });
  });

  describe("cancel resets", () => {
    it("clears the edit target and blanks the draft", () => {
      const { result } = setup();
      act(() => result.current.startEditingPrice("gpt-4.1", makeOverride()));

      act(() => result.current.cancelEditing());

      expect(result.current.editTarget).toBeNull();
      expect(result.current.editDraft).toEqual({
        input: "",
        output: "",
        cacheRead: "",
        cacheWrite: "",
        note: "",
      });
    });
  });

  describe("editKeyDown", () => {
    it("Enter triggers a save", async () => {
      const { result } = setup();
      act(() => result.current.startEditingPrice("gpt-4.1", null));
      act(() => {
        result.current.setDraftField("input", "2");
        result.current.setDraftField("output", "8");
      });

      await act(async () => {
        result.current.editKeyDown({ key: "Enter" } as React.KeyboardEvent);
      });

      expect(createInlineOverride.mutateAsync).toHaveBeenCalled();
    });

    it("Escape cancels editing", () => {
      const { result } = setup();
      act(() => result.current.startEditingPrice("gpt-4.1", null));

      act(() => result.current.editKeyDown({ key: "Escape" } as React.KeyboardEvent));

      expect(result.current.editTarget).toBeNull();
    });
  });

  describe("editIsSaving", () => {
    it("is true when any of the four mutations is pending", () => {
      updateTierRule.isPending = true;
      const { result } = setup();

      expect(result.current.editIsSaving).toBe(true);
    });

    it("is false when none of the four mutations is pending", () => {
      const { result } = setup();

      expect(result.current.editIsSaving).toBe(false);
    });
  });
});
