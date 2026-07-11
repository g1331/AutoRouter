import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, RotateCcw, X } from "lucide-react";

import { PaginationControls } from "@/components/admin/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { useResetBillingManualOverrides } from "@/hooks/use-billing";
import {
  useBillingManualOverrides,
  useBillingModelPrices,
  useBillingTierRules,
  useCreateBillingManualOverride,
  useCreateBillingTierRule,
  useDeleteBillingTierRule,
  useUpdateBillingManualOverride,
  useUpdateBillingTierRule,
} from "@/hooks/use-billing";
import { cn } from "@/lib/utils";
import type { BillingManualOverride, BillingModelPrice, BillingTierRule } from "@/types/api";

import {
  formatPriceNumber,
  parseOptionalPrice,
  parsePositiveInt,
  parseRequiredPrice,
  PRICE_FIELDS_SHORT,
  type BillingTranslate,
} from "./billing-format";
import { BillingMobileTierList } from "./billing-mobile-tier-list";
import { BillingPriceRow } from "./billing-price-row";
import { BillingTierSubTable } from "./billing-tier-sub-table";
import { ExpandChevron } from "./expand-chevron";
import { useBillingPriceRowEdit } from "./use-billing-price-row-edit";

export function PriceCatalogSection({
  t,
  tCommon,
  locale,
  priceCatalogRef,
  recentlySavedModel,
  setRecentlySavedModel,
  selectedResetModels,
  setSelectedResetModels,
  openResetDialog,
  resetOverrides,
}: {
  t: BillingTranslate;
  tCommon: (key: string) => string;
  locale: string;
  priceCatalogRef: React.RefObject<HTMLDivElement | null>;
  recentlySavedModel: string | null;
  setRecentlySavedModel: (model: string) => void;
  selectedResetModels: string[];
  setSelectedResetModels: React.Dispatch<React.SetStateAction<string[]>>;
  openResetDialog: (models: string[], source?: HTMLElement | null) => void;
  resetOverrides: ReturnType<typeof useResetBillingManualOverrides>;
}) {
  const [modelPriceInput, setModelPriceInput] = useState("");
  const [modelPriceQuery, setModelPriceQuery] = useState("");
  const [modelPricePage, setModelPricePage] = useState(1);
  const [modelPricePageSize, setModelPricePageSize] = useState(20);
  const [modelPriceOnlyManual, setModelPriceOnlyManual] = useState(false);
  const searchDebounceRef = useRef<number | null>(null);
  const [expandedPriceRows, setExpandedPriceRows] = useState<Set<string>>(new Set());
  const [isTierRuleCreating, setIsTierRuleCreating] = useState(false);
  const [tierRuleCreateDraft, setTierRuleCreateDraft] = useState({
    model: "",
    threshold: "",
    inputPrice: "",
    outputPrice: "",
    cacheReadPrice: "",
    cacheWritePrice: "",
    note: "",
  });

  const manualOverrides = useBillingManualOverrides();
  const modelPrices = useBillingModelPrices(modelPricePage, modelPricePageSize, modelPriceQuery);
  const tierRules = useBillingTierRules();
  const createTierRule = useCreateBillingTierRule();
  const deleteTierRule = useDeleteBillingTierRule();
  const updateTierRule = useUpdateBillingTierRule();
  const updateOverride = useUpdateBillingManualOverride();
  const createInlineOverride = useCreateBillingManualOverride();

  const manualOverrideMap = useMemo(() => {
    const map = new Map<string, BillingManualOverride>();
    for (const item of manualOverrides.data?.items ?? []) {
      map.set(item.model, item);
    }
    return map;
  }, [manualOverrides.data]);

  const manualOverrideMatches = useMemo(() => {
    const query = modelPriceQuery.trim().toLowerCase();
    const overrides = manualOverrides.data?.items ?? [];
    if (!query) {
      return modelPriceOnlyManual ? overrides : [];
    }
    return overrides.filter((item) => item.model.toLowerCase().includes(query));
  }, [manualOverrides.data, modelPriceOnlyManual, modelPriceQuery]);

  const priceCatalogSyncedItems = useMemo(() => modelPrices.data?.items ?? [], [modelPrices.data]);
  const priceCatalogVisibleSyncedItems = useMemo(() => {
    if (!modelPriceOnlyManual) {
      return priceCatalogSyncedItems;
    }
    return priceCatalogSyncedItems.filter((item) => manualOverrideMap.has(item.model));
  }, [manualOverrideMap, modelPriceOnlyManual, priceCatalogSyncedItems]);
  const priceCatalogExtraOverrides = useMemo(() => {
    if (manualOverrideMatches.length === 0) {
      return [];
    }
    const syncedModelSet = new Set(priceCatalogSyncedItems.map((item) => item.model));
    return manualOverrideMatches.filter((override) => !syncedModelSet.has(override.model));
  }, [manualOverrideMatches, priceCatalogSyncedItems]);
  const priceCatalogTierOnlyModels = useMemo(() => {
    const syncedModelSet = new Set(priceCatalogSyncedItems.map((i) => i.model));
    const flatOverrideSet = new Set(manualOverrides.data?.items.map((i) => i.model) ?? []);
    const query = modelPriceQuery.trim().toLowerCase();
    const seen = new Set<string>();
    const result: string[] = [];
    for (const rule of tierRules.data?.items ?? []) {
      if (rule.source !== "manual") continue;
      if (seen.has(rule.model)) continue;
      seen.add(rule.model);
      if (syncedModelSet.has(rule.model)) continue;
      if (flatOverrideSet.has(rule.model)) continue;
      if (query && !rule.model.toLowerCase().includes(query)) continue;
      result.push(rule.model);
    }
    return result.sort();
  }, [tierRules.data, priceCatalogSyncedItems, manualOverrides.data, modelPriceQuery]);
  const priceCatalogHasRows =
    priceCatalogVisibleSyncedItems.length > 0 ||
    priceCatalogExtraOverrides.length > 0 ||
    priceCatalogTierOnlyModels.length > 0;

  const allTierRulesMap = useMemo(() => {
    const map = new Map<string, BillingTierRule[]>();
    // Synced rules from catalog (source of truth)
    for (const item of priceCatalogVisibleSyncedItems) {
      for (const rule of item.synced_tier_rules ?? []) {
        const list = map.get(item.model) ?? [];
        list.push(rule);
        map.set(item.model, list);
      }
    }
    // Manual rules from tierRules query
    for (const rule of tierRules.data?.items ?? []) {
      if (rule.source !== "manual") continue;
      const list = map.get(rule.model) ?? [];
      list.push(rule);
      map.set(rule.model, list);
    }
    // Sort each model's rules by threshold ascending
    for (const [model, rules] of map.entries()) {
      map.set(
        model,
        [...rules].sort((a, b) => {
          if (a.threshold_input_tokens !== b.threshold_input_tokens) {
            return a.threshold_input_tokens - b.threshold_input_tokens;
          }
          if (a.source === b.source) return 0;
          return a.source === "litellm" ? -1 : 1;
        })
      );
    }
    return map;
  }, [tierRules.data, priceCatalogVisibleSyncedItems]);

  const tierRuleThresholdMap = useMemo(() => {
    const result = new Map<string, string>();
    for (const [model, rules] of allTierRulesMap.entries()) {
      const activeRules = rules.filter((r) => r.is_active);
      if (activeRules.length === 0) continue;
      const thresholds = [...new Set(activeRules.map((r) => r.threshold_input_tokens))].sort(
        (a, b) => a - b
      );
      const label = thresholds
        .map((tokens) => t("tierRulesThresholdTokens", { count: tokens / 1000 }))
        .join(" / ");
      result.set(model, label);
    }
    return result;
  }, [t, allTierRulesMap]);

  const tierRulePreviewMap = useMemo(() => {
    const result = new Map<string, BillingTierRule>();
    for (const [model, rules] of allTierRulesMap.entries()) {
      const firstActive = rules.find((r) => r.is_active);
      if (firstActive) result.set(model, firstActive);
    }
    return result;
  }, [allTierRulesMap]);

  const priceCatalogSelectableModels = useMemo(() => {
    const models = new Set<string>();
    for (const override of priceCatalogExtraOverrides) {
      models.add(override.model);
    }
    for (const item of priceCatalogVisibleSyncedItems) {
      if (manualOverrideMap.has(item.model)) {
        models.add(item.model);
      }
    }
    return [...models];
  }, [manualOverrideMap, priceCatalogExtraOverrides, priceCatalogVisibleSyncedItems]);

  const priceCatalogSelectedOnScreen = useMemo(() => {
    const selected = new Set(selectedResetModels);
    return priceCatalogSelectableModels.filter((model) => selected.has(model));
  }, [priceCatalogSelectableModels, selectedResetModels]);

  const priceCatalogHeaderSelectionState = useMemo(() => {
    if (priceCatalogSelectableModels.length === 0) {
      return false as boolean | "indeterminate";
    }
    if (priceCatalogSelectedOnScreen.length === 0) {
      return false as boolean | "indeterminate";
    }
    if (priceCatalogSelectedOnScreen.length === priceCatalogSelectableModels.length) {
      return true as boolean | "indeterminate";
    }
    return "indeterminate" as const;
  }, [priceCatalogSelectableModels.length, priceCatalogSelectedOnScreen.length]);

  const edit = useBillingPriceRowEdit({
    manualOverrideMap,
    priceCatalogSyncedItems,
    allTierRulesMap,
    updateOverride,
    createInlineOverride,
    updateTierRule,
    createTierRule,
    setRecentlySavedModel,
  });
  const { editTarget, setEditTarget } = edit;

  const toggleSelectAllVisible = (next: boolean) => {
    setSelectedResetModels((prev) => {
      if (priceCatalogSelectableModels.length === 0) {
        return prev;
      }

      if (next) {
        const merged = new Set(prev);
        for (const model of priceCatalogSelectableModels) {
          merged.add(model);
        }
        return [...merged];
      }

      const visible = new Set(priceCatalogSelectableModels);
      return prev.filter((model) => !visible.has(model));
    });
  };

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current != null) {
        window.clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  const togglePriceRow = (model: string) => {
    setExpandedPriceRows((prev) => {
      const next = new Set(prev);
      if (next.has(model)) {
        next.delete(model);
      } else {
        next.add(model);
      }
      return next;
    });
  };

  const handleTierRuleCreate = async () => {
    const model = tierRuleCreateDraft.model.trim();
    const threshold = parsePositiveInt(tierRuleCreateDraft.threshold);
    const inputPrice = parseRequiredPrice(tierRuleCreateDraft.inputPrice);
    const outputPrice = parseRequiredPrice(tierRuleCreateDraft.outputPrice);
    const cacheReadPrice = parseOptionalPrice(tierRuleCreateDraft.cacheReadPrice);
    const cacheWritePrice = parseOptionalPrice(tierRuleCreateDraft.cacheWritePrice);

    if (
      !model ||
      threshold === null ||
      inputPrice === null ||
      outputPrice === null ||
      cacheReadPrice === "invalid" ||
      cacheWritePrice === "invalid"
    ) {
      return;
    }

    try {
      await createTierRule.mutateAsync({
        model,
        threshold_input_tokens: threshold,
        input_price_per_million: inputPrice,
        output_price_per_million: outputPrice,
        cache_read_input_price_per_million: cacheReadPrice,
        cache_write_input_price_per_million: cacheWritePrice,
        note: tierRuleCreateDraft.note.trim() || null,
      });
    } catch {
      return;
    }

    setTierRuleCreateDraft({
      model: "",
      threshold: "",
      inputPrice: "",
      outputPrice: "",
      cacheReadPrice: "",
      cacheWritePrice: "",
      note: "",
    });
    setIsTierRuleCreating(false);
  };

  const toggleSelectedResetModel = (model: string, next: boolean) => {
    setSelectedResetModels((prev) => {
      if (next) {
        return prev.includes(model) ? prev : [...prev, model];
      }
      return prev.filter((item) => item !== model);
    });
  };

  return (
    <Card ref={priceCatalogRef} variant="outlined" className="border-divider bg-surface-200/70">
      <CardContent className="space-y-3 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="type-label-medium text-foreground">{t("priceCatalogTitle")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("priceCatalogDesc")}{" "}
              <span className="text-muted-foreground/80">({t("priceCatalogOverrideHint")})</span>
            </p>
          </div>
          <div className="w-full sm:w-80">
            <Input
              value={modelPriceInput}
              onChange={(event) => {
                const nextValue = event.target.value;
                setModelPriceInput(nextValue);

                if (searchDebounceRef.current != null) {
                  window.clearTimeout(searchDebounceRef.current);
                }

                searchDebounceRef.current = window.setTimeout(() => {
                  setModelPriceQuery(nextValue.trim());
                  setModelPricePage(1);
                  setExpandedPriceRows(new Set());
                  if (editTarget) setEditTarget(null);
                }, 300);
              }}
              placeholder={t("priceCatalogSearchPlaceholder")}
            />
          </div>
        </div>

        <div className="border-t border-divider/70 pt-3">
          {!isTierRuleCreating ? (
            <Button
              data-testid="billing-tier-rule-add-button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => setIsTierRuleCreating(true)}
            >
              <Plus className="h-4 w-4" />
              {t("tierRulesAdd")}
            </Button>
          ) : (
            <div className="space-y-3" data-testid="billing-tier-rule-create-form">
              <p className="font-medium text-foreground">{t("tierRulesAdd")}</p>
              <div className="grid gap-2 md:grid-cols-4">
                <Input
                  data-testid="billing-tier-rule-model-input"
                  placeholder={t("tierRulesModelPlaceholder")}
                  value={tierRuleCreateDraft.model}
                  onChange={(e) =>
                    setTierRuleCreateDraft((prev) => ({ ...prev, model: e.target.value }))
                  }
                />
                <Input
                  data-testid="billing-tier-rule-threshold-input"
                  placeholder={t("tierRulesThresholdPlaceholder")}
                  value={tierRuleCreateDraft.threshold}
                  onChange={(e) =>
                    setTierRuleCreateDraft((prev) => ({ ...prev, threshold: e.target.value }))
                  }
                />
                <Input
                  data-testid="billing-tier-rule-input-price-input"
                  placeholder={t("tierRulesInputPrice")}
                  value={tierRuleCreateDraft.inputPrice}
                  onChange={(e) =>
                    setTierRuleCreateDraft((prev) => ({ ...prev, inputPrice: e.target.value }))
                  }
                />
                <Input
                  data-testid="billing-tier-rule-output-price-input"
                  placeholder={t("tierRulesOutputPrice")}
                  value={tierRuleCreateDraft.outputPrice}
                  onChange={(e) =>
                    setTierRuleCreateDraft((prev) => ({
                      ...prev,
                      outputPrice: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2 md:grid-cols-4">
                <Input
                  data-testid="billing-tier-rule-cache-read-input"
                  placeholder={t("tierRulesCacheReadPrice")}
                  value={tierRuleCreateDraft.cacheReadPrice}
                  onChange={(e) =>
                    setTierRuleCreateDraft((prev) => ({
                      ...prev,
                      cacheReadPrice: e.target.value,
                    }))
                  }
                />
                <Input
                  data-testid="billing-tier-rule-cache-write-input"
                  placeholder={t("tierRulesCacheWritePrice")}
                  value={tierRuleCreateDraft.cacheWritePrice}
                  onChange={(e) =>
                    setTierRuleCreateDraft((prev) => ({
                      ...prev,
                      cacheWritePrice: e.target.value,
                    }))
                  }
                />
                <Input
                  data-testid="billing-tier-rule-note-input"
                  placeholder={t("overrideNote")}
                  value={tierRuleCreateDraft.note}
                  onChange={(e) =>
                    setTierRuleCreateDraft((prev) => ({ ...prev, note: e.target.value }))
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  data-testid="billing-tier-rule-save-button"
                  size="sm"
                  onClick={() => void handleTierRuleCreate()}
                  disabled={createTierRule.isPending}
                >
                  {createTierRule.isPending ? t("tierRulesAdding") : t("overrideSave")}
                </Button>
                <Button
                  data-testid="billing-tier-rule-cancel-button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsTierRuleCreating(false);
                    setTierRuleCreateDraft({
                      model: "",
                      threshold: "",
                      inputPrice: "",
                      outputPrice: "",
                      cacheReadPrice: "",
                      cacheWritePrice: "",
                      note: "",
                    });
                  }}
                >
                  {t("overrideCancel")}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={modelPriceOnlyManual}
                onCheckedChange={(checked) => {
                  setModelPriceOnlyManual(checked);
                  setModelPricePage(1);
                  setExpandedPriceRows(new Set());
                  if (editTarget) setEditTarget(null);
                }}
                aria-label={t("priceCatalogOnlyManual")}
              />
              <span className="text-sm text-muted-foreground">{t("priceCatalogOnlyManual")}</span>
            </div>
            {priceCatalogSelectableModels.length > 0 && (
              <div className="flex items-center gap-2 lg:hidden">
                <Checkbox
                  checked={priceCatalogHeaderSelectionState}
                  onCheckedChange={(value) =>
                    toggleSelectAllVisible(value === true || value === "indeterminate")
                  }
                  aria-label={t("priceCatalogSelectAll")}
                />
                <span className="text-sm text-muted-foreground">
                  {t("priceCatalogSelectAllLabel")}
                </span>
              </div>
            )}
            {priceCatalogSelectableModels.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {t("priceCatalogSelectableHint", {
                  count: priceCatalogSelectableModels.length,
                })}
              </span>
            )}
          </div>
          {selectedResetModels.length > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <span className="text-xs text-muted-foreground">
                {t("priceCatalogSelectedHint", { count: selectedResetModels.length })}
              </span>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1"
                onClick={() => openResetDialog(selectedResetModels)}
                disabled={resetOverrides.isPending}
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {t("priceCatalogBulkReset")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedResetModels([])}
                disabled={resetOverrides.isPending}
              >
                {t("priceCatalogClearSelection")}
              </Button>
            </div>
          )}
        </div>
        {modelPrices.isLoading ? (
          <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>
        ) : modelPrices.isError ? (
          <p className="text-sm text-status-error">{String(modelPrices.error)}</p>
        ) : !priceCatalogHasRows ? (
          <p className="text-sm text-muted-foreground">{t("priceCatalogEmpty")}</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {t("priceCatalogShowing", {
                from:
                  ((modelPrices.data?.page ?? 1) - 1) *
                    (modelPrices.data?.page_size ?? modelPricePageSize) +
                  1,
                to:
                  ((modelPrices.data?.page ?? 1) - 1) *
                    (modelPrices.data?.page_size ?? modelPricePageSize) +
                  (priceCatalogVisibleSyncedItems.length ?? 0),
                total: modelPrices.data?.total ?? 0,
              })}
              {modelPrices.isFetching && (
                <span className="ml-2 text-muted-foreground">({tCommon("loading")})</span>
              )}
            </p>
            {priceCatalogExtraOverrides.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("priceCatalogManualOverridesHint", {
                  count: priceCatalogExtraOverrides.length,
                })}
              </p>
            )}

            <div
              data-testid="billing-price-catalog-scroll-region"
              className="max-h-[min(62vh,48rem)] overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
              aria-label={t("priceCatalogTitle")}
              tabIndex={0}
            >
              <div className="space-y-2 lg:hidden">
                {priceCatalogExtraOverrides.map((override) => (
                  <div
                    key={override.id}
                    className={[
                      "rounded-cf-sm border border-divider bg-surface-300/30 p-3",
                      recentlySavedModel === override.model ? "ring-1 ring-amber-500/50" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-start gap-3">
                      <div className="pt-0.5">
                        <Checkbox
                          checked={selectedResetModels.includes(override.model)}
                          onCheckedChange={(value) =>
                            toggleSelectedResetModel(override.model, value === true)
                          }
                          aria-label={t("priceCatalogSelectModel", { model: override.model })}
                        />
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="break-all font-mono text-sm text-foreground">
                              {override.model}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <Badge variant="success">{t("priceCatalogEffectiveManual")}</Badge>
                              {allTierRulesMap.has(override.model) && (
                                <Badge variant="neutral">{t("tierRulesTitle")}</Badge>
                              )}
                              {override.has_official_price === false && (
                                <Badge variant="warning">{t("priceCatalogNoOfficialPrice")}</Badge>
                              )}
                            </div>
                            {tierRuleThresholdMap.has(override.model) && (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {t("tierRulesThreshold")}:{" "}
                                {tierRuleThresholdMap.get(override.model)}
                              </p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={(event) =>
                              openResetDialog([override.model], event.currentTarget)
                            }
                            disabled={resetOverrides.isPending}
                            title={
                              override.has_official_price === false
                                ? t("priceCatalogDeleteManualPrice")
                                : t("priceCatalogResetToOfficial")
                            }
                          >
                            <RotateCcw className="h-4 w-4" aria-hidden="true" />
                            <span className="sr-only">
                              {override.has_official_price === false
                                ? t("priceCatalogDeleteManualPrice")
                                : t("priceCatalogResetToOfficial")}
                            </span>
                          </Button>
                        </div>

                        {edit.isEditingPrice(override.model) ? (
                          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              {(
                                [
                                  ["input", t("priceCatalogInputPrice")],
                                  ["output", t("priceCatalogOutputPrice")],
                                  ["cacheRead", t("priceCatalogCacheReadPrice")],
                                  ["cacheWrite", t("priceCatalogCacheWritePrice")],
                                ] as const
                              ).map(([field, label]) => (
                                <div
                                  key={field}
                                  className="rounded-cf-sm bg-surface-200/45 px-2 py-1.5"
                                >
                                  <p className="text-muted-foreground">{label}</p>
                                  <Input
                                    type="number"
                                    step="0.0001"
                                    className="mt-0.5 h-6 text-xs"
                                    value={edit.editDraft[field]}
                                    onChange={(e) => edit.setDraftField(field, e.target.value)}
                                  />
                                </div>
                              ))}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="shrink-0 text-[11px] text-muted-foreground">
                                {t("overrideNote")}
                              </span>
                              <Input
                                className="h-7 text-xs"
                                value={edit.editDraft.note}
                                onChange={(e) => edit.setDraftField("note", e.target.value)}
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                className="h-7 gap-1"
                                onClick={() => void edit.saveEdit()}
                                disabled={edit.editIsSaving}
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1"
                                onClick={edit.cancelEditing}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="grid cursor-pointer grid-cols-2 gap-2 rounded-cf-sm text-xs transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              edit.startEditingPrice(override.model, override);
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="rounded-cf-sm bg-surface-200/45 px-2 py-1.5">
                              <p className="text-muted-foreground">{t("priceCatalogInputPrice")}</p>
                              <p className="mt-0.5 text-right font-medium tabular-nums text-foreground">
                                {formatPriceNumber(override.input_price_per_million)}
                              </p>
                            </div>
                            <div className="rounded-cf-sm bg-surface-200/45 px-2 py-1.5">
                              <p className="text-muted-foreground">
                                {t("priceCatalogOutputPrice")}
                              </p>
                              <p className="mt-0.5 text-right font-medium tabular-nums text-foreground">
                                {formatPriceNumber(override.output_price_per_million)}
                              </p>
                            </div>
                            <div className="rounded-cf-sm bg-surface-200/45 px-2 py-1.5">
                              <p className="text-muted-foreground">
                                {t("priceCatalogCacheReadPrice")}
                              </p>
                              <p className="mt-0.5 text-right font-medium tabular-nums text-foreground">
                                {formatPriceNumber(override.cache_read_input_price_per_million)}
                              </p>
                            </div>
                            <div className="rounded-cf-sm bg-surface-200/45 px-2 py-1.5">
                              <p className="text-muted-foreground">
                                {t("priceCatalogCacheWritePrice")}
                              </p>
                              <p className="mt-0.5 text-right font-medium tabular-nums text-foreground">
                                {formatPriceNumber(override.cache_write_input_price_per_million)}
                              </p>
                            </div>
                          </div>
                        )}

                        {(() => {
                          const modelTiers = allTierRulesMap.get(override.model);
                          const hasMobileTiers = !!modelTiers && modelTiers.length > 0;
                          const isOpen = expandedPriceRows.has(override.model);
                          if (!hasMobileTiers) return null;
                          return (
                            <BillingMobileTierList
                              model={override.model}
                              modelTiers={modelTiers}
                              isOpen={isOpen}
                              onToggle={() => togglePriceRow(override.model)}
                              wrapperClassName="mt-2"
                              edit={edit}
                              updateTierRule={updateTierRule}
                              deleteTierRule={deleteTierRule}
                              t={t}
                            />
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                ))}

                {priceCatalogTierOnlyModels.map((model) => {
                  const modelTiers = allTierRulesMap.get(model);
                  const isOpen = expandedPriceRows.has(model);
                  return (
                    <div
                      key={model}
                      className="rounded-cf-sm border border-divider bg-surface-300/30 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-all font-mono text-sm text-foreground">{model}</p>
                          <div className="mt-1">
                            <Badge variant="neutral">{t("tierRulesTitle")}</Badge>
                          </div>
                        </div>
                      </div>
                      {(() => {
                        if (!modelTiers || modelTiers.length === 0) return null;
                        return (
                          <BillingMobileTierList
                            model={model}
                            modelTiers={modelTiers}
                            isOpen={isOpen}
                            onToggle={() => togglePriceRow(model)}
                            wrapperClassName="mt-2"
                            edit={edit}
                            updateTierRule={updateTierRule}
                            deleteTierRule={deleteTierRule}
                            t={t}
                          />
                        );
                      })()}
                    </div>
                  );
                })}

                {priceCatalogVisibleSyncedItems.map((item: BillingModelPrice) => {
                  const override = manualOverrideMap.get(item.model);
                  const effective = override
                    ? {
                        input: override.input_price_per_million,
                        output: override.output_price_per_million,
                        cacheRead: override.cache_read_input_price_per_million,
                        cacheWrite: override.cache_write_input_price_per_million,
                      }
                    : {
                        input: item.input_price_per_million,
                        output: item.output_price_per_million,
                        cacheRead: item.cache_read_input_price_per_million,
                        cacheWrite: item.cache_write_input_price_per_million,
                      };

                  const renderCardPrice = (options: {
                    effectiveValue: number | null;
                    syncedValue: number | null;
                    showSynced: boolean;
                  }) => {
                    const { effectiveValue, syncedValue, showSynced } = options;
                    if (effectiveValue == null) {
                      return <span className="text-muted-foreground">-</span>;
                    }
                    if (!showSynced) {
                      return (
                        <span className="tabular-nums font-medium text-foreground">
                          {effectiveValue.toFixed(4)}
                        </span>
                      );
                    }
                    const syncedLabel = syncedValue == null ? "-" : syncedValue.toFixed(4);
                    return (
                      <div className="space-y-0.5 text-right">
                        <div className="tabular-nums font-medium text-foreground">
                          {effectiveValue.toFixed(4)}
                        </div>
                        <div className="text-[11px] tabular-nums text-muted-foreground">
                          litellm: {syncedLabel}
                        </div>
                      </div>
                    );
                  };

                  return (
                    <div
                      key={item.id}
                      className={[
                        "rounded-cf-sm border border-divider bg-surface-300/30 p-3",
                        recentlySavedModel === item.model ? "ring-1 ring-amber-500/50" : "",
                      ].join(" ")}
                    >
                      <div className="flex items-start gap-3">
                        <div className="pt-0.5">
                          {override ? (
                            <Checkbox
                              checked={selectedResetModels.includes(item.model)}
                              onCheckedChange={(value) =>
                                toggleSelectedResetModel(item.model, value === true)
                              }
                              aria-label={t("priceCatalogSelectModel", { model: item.model })}
                            />
                          ) : (
                            <span className="sr-only">-</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="break-all font-mono text-sm text-foreground">
                                {item.model}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <Badge variant={override ? "success" : "neutral"}>
                                  {override
                                    ? t("priceCatalogEffectiveManual")
                                    : t("priceCatalogEffectiveSynced")}
                                </Badge>
                                {allTierRulesMap.has(item.model) && (
                                  <Badge variant="neutral">{t("tierRulesTitle")}</Badge>
                                )}
                              </div>
                              {tierRuleThresholdMap.has(item.model) && (
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  {t("tierRulesThreshold")}: {tierRuleThresholdMap.get(item.model)}
                                </p>
                              )}
                              {(item.max_input_tokens != null ||
                                item.max_output_tokens != null) && (
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  {item.max_input_tokens != null &&
                                    `${t("priceCatalogMaxInput")}: ${item.max_input_tokens.toLocaleString()} · `}
                                  {item.max_output_tokens != null &&
                                    `${t("priceCatalogMaxOutput")}: ${item.max_output_tokens.toLocaleString()}`}
                                </p>
                              )}
                            </div>
                            {override ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={(event) =>
                                  openResetDialog([item.model], event.currentTarget)
                                }
                                disabled={resetOverrides.isPending}
                                title={t("priceCatalogResetToOfficial")}
                              >
                                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                <span className="sr-only">{t("priceCatalogResetToOfficial")}</span>
                              </Button>
                            ) : null}
                          </div>

                          {edit.isEditingPrice(item.model) ? (
                            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                {(
                                  [
                                    ["input", t("priceCatalogInputPrice")],
                                    ["output", t("priceCatalogOutputPrice")],
                                    ["cacheRead", t("priceCatalogCacheReadPrice")],
                                    ["cacheWrite", t("priceCatalogCacheWritePrice")],
                                  ] as const
                                ).map(([field, label]) => (
                                  <div
                                    key={field}
                                    className="rounded-cf-sm bg-surface-200/45 px-2 py-1.5"
                                  >
                                    <p className="text-muted-foreground">{label}</p>
                                    <Input
                                      type="number"
                                      step="0.0001"
                                      className="mt-0.5 h-6 text-xs"
                                      value={edit.editDraft[field]}
                                      onChange={(e) => edit.setDraftField(field, e.target.value)}
                                    />
                                  </div>
                                ))}
                              </div>
                              <Input
                                placeholder="Note"
                                className="h-7 text-xs"
                                value={edit.editDraft.note}
                                onChange={(e) => edit.setDraftField("note", e.target.value)}
                              />
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  className="h-7 gap-1"
                                  onClick={() => void edit.saveEdit()}
                                  disabled={edit.editIsSaving}
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 gap-1"
                                  onClick={edit.cancelEditing}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div
                              className="grid cursor-pointer grid-cols-2 gap-2 rounded-cf-sm text-xs transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                edit.startEditingPrice(item.model, override);
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="rounded-cf-sm bg-surface-200/45 px-2 py-1.5">
                                <p className="text-muted-foreground">
                                  {t("priceCatalogInputPrice")}
                                </p>
                                <div className="mt-0.5">
                                  {renderCardPrice({
                                    effectiveValue: effective.input,
                                    syncedValue: item.input_price_per_million,
                                    showSynced: !!override,
                                  })}
                                </div>
                              </div>
                              <div className="rounded-cf-sm bg-surface-200/45 px-2 py-1.5">
                                <p className="text-muted-foreground">
                                  {t("priceCatalogOutputPrice")}
                                </p>
                                <div className="mt-0.5">
                                  {renderCardPrice({
                                    effectiveValue: effective.output,
                                    syncedValue: item.output_price_per_million,
                                    showSynced: !!override,
                                  })}
                                </div>
                              </div>
                              <div className="rounded-cf-sm bg-surface-200/45 px-2 py-1.5">
                                <p className="text-muted-foreground">
                                  {t("priceCatalogCacheReadPrice")}
                                </p>
                                <div className="mt-0.5">
                                  {renderCardPrice({
                                    effectiveValue: effective.cacheRead,
                                    syncedValue: item.cache_read_input_price_per_million,
                                    showSynced: !!override,
                                  })}
                                </div>
                              </div>
                              <div className="rounded-cf-sm bg-surface-200/45 px-2 py-1.5">
                                <p className="text-muted-foreground">
                                  {t("priceCatalogCacheWritePrice")}
                                </p>
                                <div className="mt-0.5">
                                  {renderCardPrice({
                                    effectiveValue: effective.cacheWrite,
                                    syncedValue: item.cache_write_input_price_per_million,
                                    showSynced: !!override,
                                  })}
                                </div>
                              </div>
                            </div>
                          )}

                          {(() => {
                            const modelTiers = allTierRulesMap.get(item.model);
                            const hasMobileTiers = !!modelTiers && modelTiers.length > 0;
                            const isOpen = expandedPriceRows.has(item.model);
                            if (!hasMobileTiers) return null;
                            return (
                              <BillingMobileTierList
                                model={item.model}
                                modelTiers={modelTiers}
                                isOpen={isOpen}
                                onToggle={() => togglePriceRow(item.model)}
                                edit={edit}
                                updateTierRule={updateTierRule}
                                deleteTierRule={deleteTierRule}
                                t={t}
                              />
                            );
                          })()}

                          <p className="text-[11px] text-muted-foreground">
                            {t("priceCatalogSyncedAt")}:{" "}
                            {new Date(item.synced_at).toLocaleString(locale)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden w-full overflow-x-auto lg:block">
                <Table
                  className="w-full min-w-[850px] text-sm"
                  frame="none"
                  containerClassName="rounded-none border-0 bg-transparent"
                >
                  <TableHeader>
                    <TableRow className="border-b border-divider text-left text-xs uppercase tracking-wide text-muted-foreground hover:bg-transparent">
                      <TableHead className="w-10 px-3 py-2 h-auto">
                        <Checkbox
                          checked={priceCatalogHeaderSelectionState}
                          onCheckedChange={(value) =>
                            toggleSelectAllVisible(value === true || value === "indeterminate")
                          }
                          aria-label={t("priceCatalogSelectAll")}
                          disabled={priceCatalogSelectableModels.length === 0}
                        />
                      </TableHead>
                      <TableHead className="w-[220px] px-3 py-2 h-auto text-left">
                        {t("priceCatalogModel")}
                      </TableHead>
                      <TableHead className="w-[88px] px-3 py-2 h-auto text-left whitespace-nowrap">
                        {t("priceCatalogEffective")}
                      </TableHead>
                      <TableHead className="hidden w-[130px] px-3 py-2 h-auto text-left lg:table-cell whitespace-nowrap">
                        {t("tierRulesThreshold")} / {t("priceCatalogMaxInput")}
                      </TableHead>
                      <TableHead className="w-[300px] px-3 py-2 h-auto text-left">
                        {t("priceCatalogInputOutputPrice")} / {t("priceCatalogCacheReadWritePrice")}
                      </TableHead>
                      <TableHead className="hidden w-[130px] px-3 py-2 h-auto lg:table-cell text-left">
                        {t("priceCatalogSyncedAt")}
                      </TableHead>
                      <TableHead className="w-[72px] px-3 py-2 h-auto text-left">
                        {t("priceCatalogActions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {priceCatalogExtraOverrides.map((override) => {
                      const tierPreview = tierRulePreviewMap.get(override.model);
                      const tierPreviewLabel = tierPreview
                        ? `>${t("tierRulesThresholdTokens", {
                            count: tierPreview.threshold_input_tokens / 1000,
                          })}`
                        : null;
                      const modelTierRules = allTierRulesMap.get(override.model);
                      const hasTiers = !!modelTierRules && modelTierRules.length > 0;
                      const isExpanded = expandedPriceRows.has(override.model);

                      return (
                        <Fragment key={override.id}>
                          <TableRow
                            className={cn(
                              "border-b border-divider/60 align-top bg-surface-300/20",
                              hasTiers && "cursor-pointer",
                              recentlySavedModel === override.model && "bg-amber-500/10"
                            )}
                            onClick={hasTiers ? () => togglePriceRow(override.model) : undefined}
                          >
                            <TableCell className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedResetModels.includes(override.model)}
                                onCheckedChange={(value) =>
                                  toggleSelectedResetModel(override.model, value === true)
                                }
                                aria-label={t("priceCatalogSelectModel", {
                                  model: override.model,
                                })}
                              />
                            </TableCell>
                            <TableCell className="px-3 py-2 font-mono">
                              <span className="block whitespace-normal break-words leading-5">
                                {override.model}
                              </span>
                            </TableCell>
                            <TableCell className="px-3 py-2 whitespace-nowrap">
                              <div className="space-y-1">
                                <Badge variant="success">{t("priceCatalogEffectiveManual")}</Badge>
                                <p className="text-[11px] text-muted-foreground">
                                  {t("priceCatalogSourceManual")}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="hidden px-3 py-2 text-xs text-muted-foreground lg:table-cell">
                              <div className="space-y-1">
                                <div>{tierRuleThresholdMap.get(override.model) ?? "-"}</div>
                                <div>-</div>
                              </div>
                            </TableCell>
                            {edit.isEditingPrice(override.model) ? (
                              <>
                                <TableCell
                                  className="px-3 py-2"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="space-y-2">
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                                      {PRICE_FIELDS_SHORT.map(([field, label]) => (
                                        <div
                                          key={field}
                                          className="grid grid-cols-[24px_auto] items-center gap-2"
                                        >
                                          <span className="text-[11px] text-muted-foreground">
                                            {label}
                                          </span>
                                          <Input
                                            value={edit.editDraft[field]}
                                            onChange={(e) =>
                                              edit.setDraftField(field, e.target.value)
                                            }
                                            className="h-7 text-xs tabular-nums"
                                            onKeyDown={edit.editKeyDown}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                    <div className="grid grid-cols-[24px_auto] items-center gap-2">
                                      <span className="text-[11px] text-muted-foreground">
                                        {t("overrideNote")}
                                      </span>
                                      <Input
                                        value={edit.editDraft.note}
                                        onChange={(e) => edit.setDraftField("note", e.target.value)}
                                        className="h-7 text-xs"
                                        onKeyDown={edit.editKeyDown}
                                      />
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="hidden px-3 py-2 lg:table-cell" />
                                <TableCell
                                  className="px-3 py-2"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-status-success hover:text-status-success/80"
                                      onClick={() => void edit.saveEdit()}
                                      disabled={edit.editIsSaving}
                                    >
                                      <Check className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={edit.cancelEditing}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </>
                            ) : (
                              <>
                                <TableCell
                                  className="px-3 py-2 tabular-nums cursor-pointer hover:bg-surface-300/40 transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    edit.startEditingPrice(override.model, override);
                                  }}
                                >
                                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                    <div className="grid grid-cols-[24px_auto] items-center justify-start gap-2">
                                      <span className="text-[11px] text-muted-foreground">IN</span>
                                      <div>
                                        <div>{override.input_price_per_million.toFixed(4)}</div>
                                        {tierPreviewLabel ? (
                                          <div className="text-[11px] text-muted-foreground">
                                            {tierPreviewLabel}:{" "}
                                            {formatPriceNumber(
                                              tierPreview?.input_price_per_million ?? null
                                            )}
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-[24px_auto] items-center justify-start gap-2">
                                      <span className="text-[11px] text-muted-foreground">CR</span>
                                      <div>
                                        {override.cache_read_input_price_per_million == null
                                          ? "-"
                                          : override.cache_read_input_price_per_million.toFixed(4)}
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-[24px_auto] items-center justify-start gap-2">
                                      <span className="text-[11px] text-muted-foreground">OUT</span>
                                      <div>
                                        <div>{override.output_price_per_million.toFixed(4)}</div>
                                        {tierPreviewLabel ? (
                                          <div className="text-[11px] text-muted-foreground">
                                            {tierPreviewLabel}:{" "}
                                            {formatPriceNumber(
                                              tierPreview?.output_price_per_million ?? null
                                            )}
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-[24px_auto] items-center justify-start gap-2">
                                      <span className="text-[11px] text-muted-foreground">CW</span>
                                      <div>
                                        {override.cache_write_input_price_per_million == null
                                          ? "-"
                                          : override.cache_write_input_price_per_million.toFixed(4)}
                                      </div>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="hidden px-3 py-2 text-xs text-muted-foreground lg:table-cell">
                                  {new Date(override.updated_at).toLocaleString(locale)}
                                </TableCell>
                                <TableCell
                                  className="px-3 py-2"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={(event) =>
                                        openResetDialog([override.model], event.currentTarget)
                                      }
                                      disabled={resetOverrides.isPending}
                                      title={
                                        override.has_official_price === false
                                          ? t("priceCatalogDeleteManualPrice")
                                          : t("priceCatalogResetToOfficial")
                                      }
                                    >
                                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                    </Button>
                                    {hasTiers && (
                                      <button
                                        type="button"
                                        className="flex h-8 w-8 items-center justify-center rounded-cf-sm hover:bg-surface-300/60"
                                        onClick={() => togglePriceRow(override.model)}
                                        title={t(
                                          isExpanded
                                            ? "priceCatalogCollapseTiers"
                                            : "priceCatalogExpandTiers"
                                        )}
                                      >
                                        <ExpandChevron expanded={isExpanded} />
                                      </button>
                                    )}
                                  </div>
                                </TableCell>
                              </>
                            )}
                          </TableRow>
                          {isExpanded && (
                            <TableRow className="bg-surface-300/10">
                              <TableCell colSpan={7} className="px-3 py-3">
                                <div className="space-y-4">
                                  {hasTiers && modelTierRules && (
                                    <BillingTierSubTable
                                      model={override.model}
                                      modelTierRules={modelTierRules}
                                      edit={edit}
                                      updateTierRule={updateTierRule}
                                      deleteTierRule={deleteTierRule}
                                      t={t}
                                    />
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}

                    {priceCatalogTierOnlyModels.map((model) => {
                      const modelTierRules = allTierRulesMap.get(model);
                      const isExpanded = expandedPriceRows.has(model);
                      return (
                        <Fragment key={model}>
                          <TableRow
                            className="cursor-pointer border-b border-divider/60 align-top bg-surface-300/20"
                            onClick={() => togglePriceRow(model)}
                          >
                            <TableCell className="px-3 py-2" onClick={(e) => e.stopPropagation()} />
                            <TableCell className="px-3 py-2 font-mono">
                              <span className="block whitespace-normal break-words leading-5">
                                {model}
                              </span>
                            </TableCell>
                            <TableCell className="px-3 py-2 whitespace-nowrap">
                              <Badge variant="neutral">{t("tierRulesTitle")}</Badge>
                            </TableCell>
                            <TableCell className="hidden px-3 py-2 text-xs text-muted-foreground lg:table-cell">
                              <div>{tierRuleThresholdMap.get(model) ?? "-"}</div>
                            </TableCell>
                            <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                              -
                            </TableCell>
                            <TableCell className="hidden px-3 py-2 lg:table-cell" />
                            <TableCell className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="flex h-8 w-8 items-center justify-center rounded-cf-sm hover:bg-surface-300/60"
                                onClick={() => togglePriceRow(model)}
                                title={t(
                                  isExpanded
                                    ? "priceCatalogCollapseTiers"
                                    : "priceCatalogExpandTiers"
                                )}
                              >
                                <ExpandChevron expanded={isExpanded} />
                              </button>
                            </TableCell>
                          </TableRow>
                          {isExpanded && modelTierRules && (
                            <TableRow className="bg-surface-300/10">
                              <TableCell colSpan={7} className="px-3 py-3">
                                <BillingTierSubTable
                                  model={model}
                                  modelTierRules={modelTierRules}
                                  edit={edit}
                                  updateTierRule={updateTierRule}
                                  deleteTierRule={deleteTierRule}
                                  t={t}
                                />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}

                    {priceCatalogVisibleSyncedItems.map((item: BillingModelPrice) => (
                      <BillingPriceRow
                        key={item.id}
                        item={item}
                        manualOverrideMap={manualOverrideMap}
                        tierRulePreviewMap={tierRulePreviewMap}
                        tierRuleThresholdMap={tierRuleThresholdMap}
                        allTierRulesMap={allTierRulesMap}
                        selectedResetModels={selectedResetModels}
                        toggleSelectedResetModel={toggleSelectedResetModel}
                        recentlySavedModel={recentlySavedModel}
                        expandedPriceRows={expandedPriceRows}
                        togglePriceRow={togglePriceRow}
                        openResetDialog={openResetDialog}
                        resetOverrides={resetOverrides}
                        edit={edit}
                        updateTierRule={updateTierRule}
                        deleteTierRule={deleteTierRule}
                        t={t}
                        locale={locale}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {modelPrices.data && modelPrices.data.total_pages > 1 && (
              <PaginationControls
                total={modelPrices.data.total}
                page={modelPricePage}
                totalPages={modelPrices.data.total_pages}
                onPageChange={(nextPage) => {
                  setModelPricePage(nextPage);
                  setExpandedPriceRows(new Set());
                  if (editTarget) setEditTarget(null);
                }}
                className="mt-3 border-t border-divider/70 bg-surface-200/45 pt-3"
                actionPrefix={
                  <div className="flex items-center gap-2 pr-0 sm:pr-1">
                    <span className="text-xs text-muted-foreground">
                      {t("priceCatalogPageSize")}
                    </span>
                    <Select
                      value={String(modelPricePageSize)}
                      onValueChange={(value) => {
                        const next = Number(value);
                        if (!Number.isFinite(next) || next <= 0) {
                          return;
                        }
                        setModelPricePageSize(next);
                        setModelPricePage(1);
                        setExpandedPriceRows(new Set());
                        if (editTarget) setEditTarget(null);
                      }}
                    >
                      <SelectTrigger
                        className="h-9 w-[96px]"
                        aria-label={t("priceCatalogPageSize")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                }
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
