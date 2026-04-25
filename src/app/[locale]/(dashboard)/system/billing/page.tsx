"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCcw,
  Trash2,
  Wallet,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { Topbar } from "@/components/admin/topbar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Link } from "@/i18n/navigation";
import {
  useBillingOverview,
  useBillingUnresolvedModels,
  useBillingManualOverrides,
  useCreateBillingManualOverride,
  useUpdateBillingManualOverride,
  useDeleteBillingManualOverride,
  useResetBillingManualOverrides,
  useSyncBillingPrices,
  useBillingModelPrices,
  useBillingTierRules,
  useCreateBillingTierRule,
  useDeleteBillingTierRule,
  useUpdateBillingTierRule,
} from "@/hooks/use-billing";
import { useBackgroundSyncTasks } from "@/hooks/use-background-sync";
import type {
  BillingModelPrice,
  BillingManualOverride,
  BillingTierRule,
  BillingUnresolvedModel,
  BackgroundSyncTaskLastStatus,
} from "@/types/api";

type BillingTranslate = (key: string, values?: Record<string, string | number>) => string;

function useUsdFormatter(locale: string) {
  return useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "USD",
        // Avoid "US$" prefix in some locales (e.g. zh-CN) to keep cost display compact.
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      }),
    [locale]
  );
}

function parseRequiredPrice(raw: string): number | null {
  const value = Number(raw);
  if (!raw.trim() || Number.isNaN(value) || value < 0) {
    return null;
  }
  return value;
}

function parseOptionalPrice(raw: string): number | null | "invalid" {
  if (!raw.trim()) {
    return null;
  }
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0) {
    return "invalid";
  }
  return value;
}

function getSyncBadgeVariant(status: string | null): "success" | "warning" | "error" | "neutral" {
  if (!status) return "neutral";
  if (status === "success") return "success";
  if (status === "partial" || status === "running" || status === "skipped") return "warning";
  if (status === "failed") return "error";
  return "neutral";
}

function getBillingTaskStatusLabel(
  t: BillingTranslate,
  status: BackgroundSyncTaskLastStatus | null,
  fallback: string
): string {
  if (!status) return fallback;
  if (status === "success") return t("syncTaskSuccess");
  if (status === "partial") return t("syncTaskPartial");
  if (status === "failed") return t("syncTaskFailed");
  if (status === "running") return t("syncTaskRunning");
  return t("syncTaskSkipped");
}

function formatPriceNumber(value: number | null): string {
  if (value == null) return "-";
  return value.toFixed(4);
}

function parsePositiveInt(raw: string): number | null {
  const value = Number(raw);
  if (!raw.trim() || Number.isNaN(value) || value <= 0 || !Number.isInteger(value)) {
    return null;
  }
  return value;
}

type EditTarget =
  | { kind: "price"; model: string }
  | { kind: "tierRule"; ruleId: string; model: string }
  | { kind: "tierOverride"; model: string; threshold: number }
  | null;

const PRICE_FIELDS_SHORT = [
  ["input", "IN"],
  ["output", "OUT"],
  ["cacheRead", "CR"],
  ["cacheWrite", "CW"],
] as const;

function ExpandChevron({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <ChevronDown
      className={cn(
        "h-4 w-4 transition-transform duration-cf-fast ease-cf-standard motion-reduce:transform-none motion-reduce:transition-none",
        expanded && "rotate-180",
        className
      )}
      aria-hidden="true"
    />
  );
}

function UnresolvedRepairTable({
  rows,
  t,
  onOverrideSaved,
}: {
  rows: BillingUnresolvedModel[];
  t: BillingTranslate;
  onOverrideSaved?: (model: string) => void;
}) {
  const createOverride = useCreateBillingManualOverride();
  const deleteOverride = useDeleteBillingManualOverride();
  const { data: manualOverrides } = useBillingManualOverrides();
  const [manualDraft, setManualDraft] = useState({
    model: "",
    input: "",
    output: "",
    cacheRead: "",
    cacheWrite: "",
    note: "",
  });
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        input: string;
        output: string;
        cacheRead: string;
        cacheWrite: string;
        note: string;
      }
    >
  >({});

  const overrideMap = useMemo(() => {
    const map = new Map<string, BillingManualOverride>();
    for (const item of manualOverrides?.items ?? []) {
      map.set(item.model, item);
    }
    return map;
  }, [manualOverrides]);

  const getDraft = (model: string) => {
    const existing = overrideMap.get(model);
    return (
      drafts[model] ?? {
        input: existing ? String(existing.input_price_per_million) : "",
        output: existing ? String(existing.output_price_per_million) : "",
        cacheRead:
          existing?.cache_read_input_price_per_million == null
            ? ""
            : String(existing.cache_read_input_price_per_million),
        cacheWrite:
          existing?.cache_write_input_price_per_million == null
            ? ""
            : String(existing.cache_write_input_price_per_million),
        note: existing?.note ?? "",
      }
    );
  };

  const saveOverride = async (
    modelRaw: string,
    draft: {
      input: string;
      output: string;
      cacheRead: string;
      cacheWrite: string;
      note: string;
    }
  ): Promise<boolean> => {
    const model = modelRaw.trim();
    const inputPrice = parseRequiredPrice(draft.input);
    const outputPrice = parseRequiredPrice(draft.output);
    const cacheReadPrice = parseOptionalPrice(draft.cacheRead);
    const cacheWritePrice = parseOptionalPrice(draft.cacheWrite);
    if (
      !model ||
      inputPrice === null ||
      outputPrice === null ||
      cacheReadPrice === "invalid" ||
      cacheWritePrice === "invalid"
    ) {
      return false;
    }

    await createOverride.mutateAsync({
      model,
      input_price_per_million: inputPrice,
      output_price_per_million: outputPrice,
      cache_read_input_price_per_million: cacheReadPrice,
      cache_write_input_price_per_million: cacheWritePrice,
      note: draft.note.trim() || null,
    });
    onOverrideSaved?.(model);
    return true;
  };

  const handleSave = async (model: string) => {
    const draft = getDraft(model);
    await saveOverride(model, draft);
  };

  const manualModel = manualDraft.model.trim();
  const manualExistingOverride = manualModel ? overrideMap.get(manualModel) : undefined;
  const handleManualSave = async () => {
    const saved = await saveOverride(manualDraft.model, manualDraft);
    if (!saved) {
      return;
    }
    setManualDraft({
      model: "",
      input: "",
      output: "",
      cacheRead: "",
      cacheWrite: "",
      note: "",
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-cf-sm border border-divider bg-surface-300/45 p-3">
        <div className="mb-3">
          <p className="font-medium text-foreground">{t("manualEntryTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("manualEntryDesc")}</p>
        </div>
        <div className="grid gap-2 md:grid-cols-6">
          <Input
            placeholder={t("overrideModelInput")}
            value={manualDraft.model}
            onChange={(event) =>
              setManualDraft((prev) => ({
                ...prev,
                model: event.target.value,
              }))
            }
          />
          <Input
            placeholder={t("overrideInputPrice")}
            value={manualDraft.input}
            onChange={(event) =>
              setManualDraft((prev) => ({
                ...prev,
                input: event.target.value,
              }))
            }
          />
          <Input
            placeholder={t("overrideOutputPrice")}
            value={manualDraft.output}
            onChange={(event) =>
              setManualDraft((prev) => ({
                ...prev,
                output: event.target.value,
              }))
            }
          />
          <Input
            placeholder={t("overrideCacheReadPrice")}
            value={manualDraft.cacheRead}
            onChange={(event) =>
              setManualDraft((prev) => ({
                ...prev,
                cacheRead: event.target.value,
              }))
            }
          />
          <Input
            placeholder={t("overrideCacheWritePrice")}
            value={manualDraft.cacheWrite}
            onChange={(event) =>
              setManualDraft((prev) => ({
                ...prev,
                cacheWrite: event.target.value,
              }))
            }
          />
          <Input
            placeholder={t("overrideNote")}
            value={manualDraft.note}
            onChange={(event) =>
              setManualDraft((prev) => ({
                ...prev,
                note: event.target.value,
              }))
            }
          />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => void handleManualSave()}
            disabled={createOverride.isPending}
          >
            {manualExistingOverride ? t("overrideUpdate") : t("overrideSave")}
          </Button>
          {manualExistingOverride && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void deleteOverride.mutateAsync(manualExistingOverride.id)}
              disabled={deleteOverride.isPending}
            >
              {t("overrideDelete")}
            </Button>
          )}
        </div>
      </div>

      {rows.length === 0 && (
        <div className="rounded-cf-sm border border-dashed border-divider bg-surface-300/30 px-4 py-6 text-sm text-muted-foreground">
          {t("unresolvedEmpty")}
        </div>
      )}

      {rows.map((row) => {
        const existingOverride = overrideMap.get(row.model);
        const draft = getDraft(row.model);

        return (
          <div
            key={row.model}
            className="rounded-cf-sm border border-divider bg-surface-300/45 p-3"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-foreground">{row.model}</p>
                <p className="text-xs text-muted-foreground">
                  {row.occurrences} hits · {row.last_upstream_name ?? "-"}
                </p>
              </div>
              {existingOverride && <Badge variant="success">{t("overrideActive")}</Badge>}
            </div>
            <div className="grid gap-2 md:grid-cols-6">
              <Input
                placeholder={t("overrideInputPrice")}
                value={draft.input}
                onChange={(event) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [row.model]: { ...getDraft(row.model), input: event.target.value },
                  }))
                }
              />
              <Input
                placeholder={t("overrideOutputPrice")}
                value={draft.output}
                onChange={(event) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [row.model]: { ...getDraft(row.model), output: event.target.value },
                  }))
                }
              />
              <Input
                placeholder={t("overrideCacheReadPrice")}
                value={draft.cacheRead}
                onChange={(event) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [row.model]: { ...getDraft(row.model), cacheRead: event.target.value },
                  }))
                }
              />
              <Input
                placeholder={t("overrideCacheWritePrice")}
                value={draft.cacheWrite}
                onChange={(event) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [row.model]: { ...getDraft(row.model), cacheWrite: event.target.value },
                  }))
                }
              />
              <Input
                placeholder={t("overrideNote")}
                value={draft.note}
                onChange={(event) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [row.model]: { ...getDraft(row.model), note: event.target.value },
                  }))
                }
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => void handleSave(row.model)}
                  disabled={createOverride.isPending}
                >
                  {existingOverride ? t("overrideUpdate") : t("overrideSave")}
                </Button>
                {existingOverride && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void deleteOverride.mutateAsync(existingOverride.id)}
                    disabled={deleteOverride.isPending}
                  >
                    {t("overrideDelete")}
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function BillingPage() {
  const t = useTranslations("billing");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const usd = useUsdFormatter(locale);

  const overview = useBillingOverview();
  const unresolved = useBillingUnresolvedModels();
  const manualOverrides = useBillingManualOverrides();
  const backgroundTasks = useBackgroundSyncTasks();
  const [modelPriceInput, setModelPriceInput] = useState("");
  const [modelPriceQuery, setModelPriceQuery] = useState("");
  const [modelPricePage, setModelPricePage] = useState(1);
  const [modelPricePageSize, setModelPricePageSize] = useState(20);
  const [modelPriceOnlyManual, setModelPriceOnlyManual] = useState(false);
  const [selectedResetModels, setSelectedResetModels] = useState<string[]>([]);
  const [resetDialogTargets, setResetDialogTargets] = useState<string[] | null>(null);
  const [recentlySavedModel, setRecentlySavedModel] = useState<string | null>(null);
  const modelPrices = useBillingModelPrices(modelPricePage, modelPricePageSize, modelPriceQuery);
  const tierRules = useBillingTierRules();
  const syncPrices = useSyncBillingPrices();
  const resetOverrides = useResetBillingManualOverrides();
  const searchDebounceRef = useRef<number | null>(null);
  const priceCatalogRef = useRef<HTMLDivElement | null>(null);
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
  const createTierRule = useCreateBillingTierRule();
  const deleteTierRule = useDeleteBillingTierRule();
  const updateTierRule = useUpdateBillingTierRule();
  const updateOverride = useUpdateBillingManualOverride();
  const createInlineOverride = useCreateBillingManualOverride();

  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [editDraft, setEditDraft] = useState({
    input: "",
    output: "",
    cacheRead: "",
    cacheWrite: "",
    note: "",
  });

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

  const latestSync = overview.data?.latest_sync ?? null;
  const priceSyncTask =
    backgroundTasks.data?.items.find((task) => task.task_name === "billing_price_catalog_sync") ??
    null;
  const legacyLatestSyncText = latestSync
    ? latestSync.status === "success"
      ? t("syncSuccess", { source: latestSync.source ?? "-" })
      : latestSync.status === "partial"
        ? t("syncPartial", { source: latestSync.source ?? "-" })
        : t("syncFailed")
    : t("syncNever");
  const latestSyncText = getBillingTaskStatusLabel(
    t,
    priceSyncTask?.last_status ?? null,
    legacyLatestSyncText
  );
  const latestSyncFailureReason = priceSyncTask?.last_error ?? latestSync?.failure_reason ?? null;

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current != null) {
        window.clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!recentlySavedModel) {
      return;
    }
    const timer = window.setTimeout(() => setRecentlySavedModel(null), 4500);
    return () => window.clearTimeout(timer);
  }, [recentlySavedModel]);

  const scrollToPriceCatalog = () => {
    priceCatalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleOverrideSaved = (model: string) => {
    setRecentlySavedModel(model);
    scrollToPriceCatalog();
  };

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

  const setDraftField = (field: string, value: string) => {
    setEditDraft((prev) => ({ ...prev, [field]: value }));
  };

  const cancelEditing = () => {
    setEditTarget(null);
    setEditDraft({ input: "", output: "", cacheRead: "", cacheWrite: "", note: "" });
  };

  const editKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") void saveEdit();
    if (e.key === "Escape") cancelEditing();
  };

  const startEditingPrice = (model: string, existingOverride?: BillingManualOverride | null) => {
    setEditTarget({ kind: "price", model });
    if (existingOverride) {
      setEditDraft({
        input: String(existingOverride.input_price_per_million),
        output: String(existingOverride.output_price_per_million),
        cacheRead:
          existingOverride.cache_read_input_price_per_million == null
            ? ""
            : String(existingOverride.cache_read_input_price_per_million),
        cacheWrite:
          existingOverride.cache_write_input_price_per_million == null
            ? ""
            : String(existingOverride.cache_write_input_price_per_million),
        note: existingOverride.note ?? "",
      });
    } else {
      const synced = priceCatalogSyncedItems.find((s) => s.model === model);
      setEditDraft({
        input: synced ? String(synced.input_price_per_million) : "",
        output: synced ? String(synced.output_price_per_million) : "",
        cacheRead:
          synced?.cache_read_input_price_per_million == null
            ? ""
            : String(synced.cache_read_input_price_per_million),
        cacheWrite:
          synced?.cache_write_input_price_per_million == null
            ? ""
            : String(synced.cache_write_input_price_per_million),
        note: "",
      });
    }
  };

  const startEditingTierRule = (rule: BillingTierRule) => {
    setEditTarget({ kind: "tierRule", ruleId: rule.id, model: rule.model });
    setEditDraft({
      input: String(rule.input_price_per_million),
      output: String(rule.output_price_per_million),
      cacheRead:
        rule.cache_read_input_price_per_million == null
          ? ""
          : String(rule.cache_read_input_price_per_million),
      cacheWrite:
        rule.cache_write_input_price_per_million == null
          ? ""
          : String(rule.cache_write_input_price_per_million),
      note: rule.note ?? "",
    });
  };

  const startEditingTierOverride = (model: string, rule: BillingTierRule) => {
    setEditTarget({ kind: "tierOverride", model, threshold: rule.threshold_input_tokens });
    setEditDraft({
      input: String(rule.input_price_per_million),
      output: String(rule.output_price_per_million),
      cacheRead:
        rule.cache_read_input_price_per_million == null
          ? ""
          : String(rule.cache_read_input_price_per_million),
      cacheWrite:
        rule.cache_write_input_price_per_million == null
          ? ""
          : String(rule.cache_write_input_price_per_million),
      note: rule.note ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    const inputPrice = parseRequiredPrice(editDraft.input);
    const outputPrice = parseRequiredPrice(editDraft.output);
    const cacheReadPrice = parseOptionalPrice(editDraft.cacheRead);
    const cacheWritePrice = parseOptionalPrice(editDraft.cacheWrite);
    if (
      inputPrice === null ||
      outputPrice === null ||
      cacheReadPrice === "invalid" ||
      cacheWritePrice === "invalid"
    ) {
      return;
    }

    try {
      if (editTarget.kind === "price") {
        const existing = manualOverrideMap.get(editTarget.model);
        if (existing) {
          await updateOverride.mutateAsync({
            id: existing.id,
            data: {
              input_price_per_million: inputPrice,
              output_price_per_million: outputPrice,
              cache_read_input_price_per_million: cacheReadPrice,
              cache_write_input_price_per_million: cacheWritePrice,
              note: editDraft.note.trim() || null,
            },
          });
        } else {
          await createInlineOverride.mutateAsync({
            model: editTarget.model,
            input_price_per_million: inputPrice,
            output_price_per_million: outputPrice,
            cache_read_input_price_per_million: cacheReadPrice,
            cache_write_input_price_per_million: cacheWritePrice,
            note: editDraft.note.trim() || null,
          });
        }
        setRecentlySavedModel(editTarget.model);
      } else if (editTarget.kind === "tierRule") {
        await updateTierRule.mutateAsync({
          id: editTarget.ruleId,
          data: {
            input_price_per_million: inputPrice,
            output_price_per_million: outputPrice,
            cache_read_input_price_per_million: cacheReadPrice,
            cache_write_input_price_per_million: cacheWritePrice,
            note: editDraft.note.trim() || null,
          },
        });
      } else if (editTarget.kind === "tierOverride") {
        const existingManual = allTierRulesMap
          .get(editTarget.model)
          ?.find((r) => r.source === "manual" && r.threshold_input_tokens === editTarget.threshold);
        if (existingManual) {
          await updateTierRule.mutateAsync({
            id: existingManual.id,
            data: {
              input_price_per_million: inputPrice,
              output_price_per_million: outputPrice,
              cache_read_input_price_per_million: cacheReadPrice,
              cache_write_input_price_per_million: cacheWritePrice,
              note: editDraft.note.trim() || null,
            },
          });
        } else {
          await createTierRule.mutateAsync({
            model: editTarget.model,
            threshold_input_tokens: editTarget.threshold,
            input_price_per_million: inputPrice,
            output_price_per_million: outputPrice,
            cache_read_input_price_per_million: cacheReadPrice,
            cache_write_input_price_per_million: cacheWritePrice,
            note: editDraft.note.trim() || null,
          });
        }
      }
    } catch {
      return;
    }

    cancelEditing();
  };

  const isEditingPrice = (model: string) =>
    editTarget?.kind === "price" && editTarget.model === model;

  const isEditingTierRule = (ruleId: string) =>
    editTarget?.kind === "tierRule" && editTarget.ruleId === ruleId;

  const isEditingTierOverride = (model: string, threshold: number) =>
    editTarget?.kind === "tierOverride" &&
    editTarget.model === model &&
    editTarget.threshold === threshold;

  const editIsSaving =
    updateOverride.isPending ||
    createInlineOverride.isPending ||
    updateTierRule.isPending ||
    createTierRule.isPending;

  const toggleSelectedResetModel = (model: string, next: boolean) => {
    setSelectedResetModels((prev) => {
      if (next) {
        return prev.includes(model) ? prev : [...prev, model];
      }
      return prev.filter((item) => item !== model);
    });
  };

  const openResetDialog = (models: string[]) => {
    const normalized = [...new Set(models.map((m) => m.trim()).filter(Boolean))];
    if (normalized.length === 0) {
      return;
    }
    setResetDialogTargets(normalized);
  };

  const closeResetDialog = () => setResetDialogTargets(null);

  const handleConfirmReset = async () => {
    if (!resetDialogTargets || resetOverrides.isPending) {
      return;
    }
    const targets = resetDialogTargets;
    await resetOverrides.mutateAsync(targets);
    setSelectedResetModels((prev) => prev.filter((m) => !targets.includes(m)));
    closeResetDialog();
  };

  return (
    <>
      <Topbar title={t("pageTitle")} />

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <Card variant="outlined" className="border-divider bg-surface-200/70">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-amber-500">
                <Wallet className="h-4 w-4" aria-hidden="true" />
                <span className="type-label-medium">{t("management")}</span>
              </div>
              <p className="type-body-medium text-muted-foreground">{t("managementDesc")}</p>
            </div>
            <Button onClick={() => syncPrices.mutate()} disabled={syncPrices.isPending}>
              {syncPrices.isPending ? t("syncing") : t("syncNow")}
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card variant="filled" className="border border-divider">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t("todayCost")}</p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {usd.format(overview.data?.today_cost_usd ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card variant="filled" className="border border-divider">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t("monthCost")}</p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {usd.format(overview.data?.month_cost_usd ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card variant="filled" className="border border-divider">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t("unresolvedModels")}</p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {overview.data?.unresolved_model_count ?? 0}
              </p>
            </CardContent>
          </Card>
          <Card variant="filled" className="border border-divider">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t("latestSync")}</p>
              <div className="mt-1 flex items-center gap-2">
                <Badge
                  variant={getSyncBadgeVariant(
                    priceSyncTask?.last_status ?? latestSync?.status ?? null
                  )}
                >
                  {latestSyncText}
                </Badge>
              </div>
              {priceSyncTask?.next_run_at && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("syncNextRun", {
                    time: new Date(priceSyncTask.next_run_at).toLocaleString(locale),
                  })}
                </p>
              )}
              {latestSyncFailureReason && (
                <p className="mt-2 text-xs text-status-warning">
                  {t("syncFailureReason", { reason: latestSyncFailureReason })}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card variant="outlined" className="border-divider bg-surface-200/70">
          <CardContent className="space-y-3 p-5 sm:p-6">
            <div>
              <h3 className="type-label-medium text-foreground">{t("unresolvedTitle")}</h3>
              <p className="text-sm text-muted-foreground">{t("unresolvedDesc")}</p>
            </div>
            {unresolved.isLoading ? (
              <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>
            ) : unresolved.isError ? (
              <p className="text-sm text-status-error">{String(unresolved.error)}</p>
            ) : (
              <UnresolvedRepairTable
                rows={unresolved.data?.items ?? []}
                t={t}
                onOverrideSaved={handleOverrideSaved}
              />
            )}
          </CardContent>
        </Card>

        <Card ref={priceCatalogRef} variant="outlined" className="border-divider bg-surface-200/70">
          <CardContent className="space-y-3 p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="type-label-medium text-foreground">{t("priceCatalogTitle")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("priceCatalogDesc")}{" "}
                  <span className="text-muted-foreground/80">
                    ({t("priceCatalogOverrideHint")})
                  </span>
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

            <div className="rounded-cf-sm border border-divider bg-surface-300/45 p-3">
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
                  <span className="text-sm text-muted-foreground">
                    {t("priceCatalogOnlyManual")}
                  </span>
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
                                  <Badge variant="warning">
                                    {t("priceCatalogNoOfficialPrice")}
                                  </Badge>
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
                              onClick={() => openResetDialog([override.model])}
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

                          {isEditingPrice(override.model) ? (
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
                                    className="rounded-cf-sm border border-divider bg-surface-200/40 px-2 py-1.5"
                                  >
                                    <p className="text-muted-foreground">{label}</p>
                                    <Input
                                      type="number"
                                      step="0.0001"
                                      className="mt-0.5 h-6 text-xs"
                                      value={editDraft[field]}
                                      onChange={(e) => setDraftField(field, e.target.value)}
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
                                  value={editDraft.note}
                                  onChange={(e) => setDraftField("note", e.target.value)}
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  className="h-7 gap-1"
                                  onClick={() => void saveEdit()}
                                  disabled={editIsSaving}
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 gap-1"
                                  onClick={cancelEditing}
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
                                startEditingPrice(override.model, override);
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="rounded-cf-sm border border-divider bg-surface-200/40 px-2 py-1.5">
                                <p className="text-muted-foreground">
                                  {t("priceCatalogInputPrice")}
                                </p>
                                <p className="mt-0.5 text-right font-medium tabular-nums text-foreground">
                                  {formatPriceNumber(override.input_price_per_million)}
                                </p>
                              </div>
                              <div className="rounded-cf-sm border border-divider bg-surface-200/40 px-2 py-1.5">
                                <p className="text-muted-foreground">
                                  {t("priceCatalogOutputPrice")}
                                </p>
                                <p className="mt-0.5 text-right font-medium tabular-nums text-foreground">
                                  {formatPriceNumber(override.output_price_per_million)}
                                </p>
                              </div>
                              <div className="rounded-cf-sm border border-divider bg-surface-200/40 px-2 py-1.5">
                                <p className="text-muted-foreground">
                                  {t("priceCatalogCacheReadPrice")}
                                </p>
                                <p className="mt-0.5 text-right font-medium tabular-nums text-foreground">
                                  {formatPriceNumber(override.cache_read_input_price_per_million)}
                                </p>
                              </div>
                              <div className="rounded-cf-sm border border-divider bg-surface-200/40 px-2 py-1.5">
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
                              <div className="mt-2">
                                <button
                                  type="button"
                                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() => togglePriceRow(override.model)}
                                >
                                  <ExpandChevron expanded={isOpen} className="h-3 w-3" />
                                  {t("priceCatalogTiersCount", { count: modelTiers.length })}
                                </button>
                                {isOpen && (
                                  <div className="mt-2 space-y-1.5">
                                    {modelTiers.map((rule) => {
                                      const isTierEditing =
                                        rule.source === "manual"
                                          ? isEditingTierRule(rule.id)
                                          : isEditingTierOverride(
                                              override.model,
                                              rule.threshold_input_tokens
                                            );
                                      return isTierEditing ? (
                                        <div
                                          key={rule.id}
                                          className="space-y-2 rounded-cf-sm border border-divider/60 bg-surface-200/30 px-2 py-1.5 text-xs"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <span className="text-muted-foreground">
                                            {t("tierRulesThresholdTokens", {
                                              count: rule.threshold_input_tokens / 1000,
                                            })}
                                          </span>
                                          <div className="grid grid-cols-2 gap-2">
                                            {(
                                              [
                                                ["input", t("priceCatalogInputPrice")],
                                                ["output", t("priceCatalogOutputPrice")],
                                                ["cacheRead", t("priceCatalogCacheReadPrice")],
                                                ["cacheWrite", t("priceCatalogCacheWritePrice")],
                                              ] as const
                                            ).map(([field, label]) => (
                                              <div key={field}>
                                                <p className="text-muted-foreground">{label}</p>
                                                <Input
                                                  type="number"
                                                  step="0.0001"
                                                  className="mt-0.5 h-6 text-xs"
                                                  value={editDraft[field]}
                                                  onChange={(e) =>
                                                    setDraftField(field, e.target.value)
                                                  }
                                                />
                                              </div>
                                            ))}
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <Button
                                              size="sm"
                                              className="h-6 gap-1"
                                              onClick={() => void saveEdit()}
                                              disabled={editIsSaving}
                                            >
                                              <Check className="h-3 w-3" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-6 gap-1"
                                              onClick={cancelEditing}
                                            >
                                              <X className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div
                                          key={rule.id}
                                          className={cn(
                                            "flex cursor-pointer items-center justify-between rounded-cf-sm border border-divider/60 bg-surface-200/30 px-2 py-1.5 text-xs transition-colors hover:bg-surface-300/40",
                                            !rule.is_active && "opacity-50"
                                          )}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (rule.source === "manual") {
                                              startEditingTierRule(rule);
                                            } else {
                                              startEditingTierOverride(override.model, rule);
                                            }
                                          }}
                                        >
                                          <div className="space-y-0.5">
                                            <span className="text-muted-foreground">
                                              {t("tierRulesThresholdTokens", {
                                                count: rule.threshold_input_tokens / 1000,
                                              })}
                                            </span>
                                            <div className="tabular-nums">
                                              {formatPriceNumber(rule.input_price_per_million)} /{" "}
                                              {formatPriceNumber(rule.output_price_per_million)}
                                            </div>
                                          </div>
                                          <div
                                            className="flex items-center gap-1"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <Badge
                                              variant={
                                                rule.source === "manual" ? "success" : "neutral"
                                              }
                                            >
                                              {rule.source === "manual"
                                                ? t("tierRulesSourceManual")
                                                : t("tierRulesSourceLitellm")}
                                            </Badge>
                                            {rule.source === "manual" && (
                                              <>
                                                <Switch
                                                  checked={rule.is_active}
                                                  onCheckedChange={(checked) =>
                                                    updateTierRule.mutate({
                                                      id: rule.id,
                                                      data: { is_active: checked },
                                                    })
                                                  }
                                                  disabled={updateTierRule.isPending}
                                                />
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-6 w-6"
                                                  onClick={() => deleteTierRule.mutate(rule.id)}
                                                  disabled={deleteTierRule.isPending}
                                                >
                                                  <Trash2 className="h-3 w-3" />
                                                </Button>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
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
                            <div className="mt-2">
                              <button
                                type="button"
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => togglePriceRow(model)}
                              >
                                <ExpandChevron expanded={isOpen} className="h-3 w-3" />
                                {t("priceCatalogTiersCount", { count: modelTiers.length })}
                              </button>
                              {isOpen && (
                                <div className="mt-2 space-y-1.5">
                                  {modelTiers.map((rule) => {
                                    const isTierEditing =
                                      rule.source === "manual"
                                        ? isEditingTierRule(rule.id)
                                        : isEditingTierOverride(model, rule.threshold_input_tokens);
                                    return isTierEditing ? (
                                      <div
                                        key={rule.id}
                                        className="space-y-2 rounded-cf-sm border border-divider/60 bg-surface-200/30 px-2 py-1.5 text-xs"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <span className="text-muted-foreground">
                                          {t("tierRulesThresholdTokens", {
                                            count: rule.threshold_input_tokens / 1000,
                                          })}
                                        </span>
                                        <div className="grid grid-cols-2 gap-2">
                                          {(
                                            [
                                              ["input", t("priceCatalogInputPrice")],
                                              ["output", t("priceCatalogOutputPrice")],
                                              ["cacheRead", t("priceCatalogCacheReadPrice")],
                                              ["cacheWrite", t("priceCatalogCacheWritePrice")],
                                            ] as const
                                          ).map(([field, label]) => (
                                            <div key={field}>
                                              <p className="text-muted-foreground">{label}</p>
                                              <Input
                                                type="number"
                                                step="0.0001"
                                                className="mt-0.5 h-6 text-xs"
                                                value={editDraft[field]}
                                                onChange={(e) =>
                                                  setDraftField(field, e.target.value)
                                                }
                                                onKeyDown={editKeyDown}
                                              />
                                            </div>
                                          ))}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Button
                                            size="sm"
                                            className="h-6 gap-1"
                                            onClick={() => void saveEdit()}
                                            disabled={editIsSaving}
                                          >
                                            <Check className="h-3 w-3" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 gap-1"
                                            onClick={cancelEditing}
                                          >
                                            <X className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div
                                        key={rule.id}
                                        className={cn(
                                          "flex cursor-pointer items-center justify-between rounded-cf-sm border border-divider/60 bg-surface-200/30 px-2 py-1.5 text-xs transition-colors hover:bg-surface-300/40",
                                          !rule.is_active && "opacity-50"
                                        )}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (rule.source === "manual") {
                                            startEditingTierRule(rule);
                                          } else {
                                            startEditingTierOverride(model, rule);
                                          }
                                        }}
                                      >
                                        <div className="space-y-0.5">
                                          <span className="text-muted-foreground">
                                            {t("tierRulesThresholdTokens", {
                                              count: rule.threshold_input_tokens / 1000,
                                            })}
                                          </span>
                                          <div className="tabular-nums">
                                            {formatPriceNumber(rule.input_price_per_million)} /{" "}
                                            {formatPriceNumber(rule.output_price_per_million)}
                                          </div>
                                        </div>
                                        <div
                                          className="flex items-center gap-1"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <Badge
                                            variant={
                                              rule.source === "manual" ? "success" : "neutral"
                                            }
                                          >
                                            {rule.source === "manual"
                                              ? t("tierRulesSourceManual")
                                              : t("tierRulesSourceLitellm")}
                                          </Badge>
                                          {rule.source === "manual" && (
                                            <>
                                              <Switch
                                                checked={rule.is_active}
                                                onCheckedChange={(checked) =>
                                                  updateTierRule.mutate({
                                                    id: rule.id,
                                                    data: { is_active: checked },
                                                  })
                                                }
                                                disabled={updateTierRule.isPending}
                                              />
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6"
                                                onClick={() => deleteTierRule.mutate(rule.id)}
                                                disabled={deleteTierRule.isPending}
                                              >
                                                <Trash2 className="h-3 w-3" />
                                              </Button>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
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
                                    {t("tierRulesThreshold")}:{" "}
                                    {tierRuleThresholdMap.get(item.model)}
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
                                  onClick={() => openResetDialog([item.model])}
                                  disabled={resetOverrides.isPending}
                                  title={t("priceCatalogResetToOfficial")}
                                >
                                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                  <span className="sr-only">
                                    {t("priceCatalogResetToOfficial")}
                                  </span>
                                </Button>
                              ) : null}
                            </div>

                            {isEditingPrice(item.model) ? (
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
                                      className="rounded-cf-sm border border-divider bg-surface-200/40 px-2 py-1.5"
                                    >
                                      <p className="text-muted-foreground">{label}</p>
                                      <Input
                                        type="number"
                                        step="0.0001"
                                        className="mt-0.5 h-6 text-xs"
                                        value={editDraft[field]}
                                        onChange={(e) => setDraftField(field, e.target.value)}
                                      />
                                    </div>
                                  ))}
                                </div>
                                <Input
                                  placeholder="Note"
                                  className="h-7 text-xs"
                                  value={editDraft.note}
                                  onChange={(e) => setDraftField("note", e.target.value)}
                                />
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    className="h-7 gap-1"
                                    onClick={() => void saveEdit()}
                                    disabled={editIsSaving}
                                  >
                                    <Check className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 gap-1"
                                    onClick={cancelEditing}
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
                                  startEditingPrice(item.model, override);
                                }}
                                role="button"
                                tabIndex={0}
                              >
                                <div className="rounded-cf-sm border border-divider bg-surface-200/40 px-2 py-1.5">
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
                                <div className="rounded-cf-sm border border-divider bg-surface-200/40 px-2 py-1.5">
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
                                <div className="rounded-cf-sm border border-divider bg-surface-200/40 px-2 py-1.5">
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
                                <div className="rounded-cf-sm border border-divider bg-surface-200/40 px-2 py-1.5">
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
                                <div>
                                  <button
                                    type="button"
                                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() => togglePriceRow(item.model)}
                                  >
                                    <ExpandChevron expanded={isOpen} className="h-3 w-3" />
                                    {t("priceCatalogTiersCount", { count: modelTiers.length })}
                                  </button>
                                  {isOpen && (
                                    <div className="mt-2 space-y-1.5">
                                      {modelTiers.map((rule) => {
                                        const isTierEditing =
                                          rule.source === "manual"
                                            ? isEditingTierRule(rule.id)
                                            : isEditingTierOverride(
                                                item.model,
                                                rule.threshold_input_tokens
                                              );
                                        return isTierEditing ? (
                                          <div
                                            key={rule.id}
                                            className="space-y-2 rounded-cf-sm border border-divider/60 bg-surface-200/30 px-2 py-1.5 text-xs"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <span className="text-muted-foreground">
                                              {t("tierRulesThresholdTokens", {
                                                count: rule.threshold_input_tokens / 1000,
                                              })}
                                            </span>
                                            <div className="grid grid-cols-2 gap-2">
                                              {(
                                                [
                                                  ["input", t("priceCatalogInputPrice")],
                                                  ["output", t("priceCatalogOutputPrice")],
                                                  ["cacheRead", t("priceCatalogCacheReadPrice")],
                                                  ["cacheWrite", t("priceCatalogCacheWritePrice")],
                                                ] as const
                                              ).map(([field, label]) => (
                                                <div key={field}>
                                                  <p className="text-muted-foreground">{label}</p>
                                                  <Input
                                                    type="number"
                                                    step="0.0001"
                                                    className="mt-0.5 h-6 text-xs"
                                                    value={editDraft[field]}
                                                    onChange={(e) =>
                                                      setDraftField(field, e.target.value)
                                                    }
                                                  />
                                                </div>
                                              ))}
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <Button
                                                size="sm"
                                                className="h-6 gap-1"
                                                onClick={() => void saveEdit()}
                                                disabled={editIsSaving}
                                              >
                                                <Check className="h-3 w-3" />
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 gap-1"
                                                onClick={cancelEditing}
                                              >
                                                <X className="h-3 w-3" />
                                              </Button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div
                                            key={rule.id}
                                            className={cn(
                                              "flex cursor-pointer items-center justify-between rounded-cf-sm border border-divider/60 bg-surface-200/30 px-2 py-1.5 text-xs transition-colors hover:bg-surface-300/40",
                                              !rule.is_active && "opacity-50"
                                            )}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (rule.source === "manual") {
                                                startEditingTierRule(rule);
                                              } else {
                                                startEditingTierOverride(item.model, rule);
                                              }
                                            }}
                                          >
                                            <div className="space-y-0.5">
                                              <span className="text-muted-foreground">
                                                {t("tierRulesThresholdTokens", {
                                                  count: rule.threshold_input_tokens / 1000,
                                                })}
                                              </span>
                                              <div className="tabular-nums">
                                                {formatPriceNumber(rule.input_price_per_million)} /{" "}
                                                {formatPriceNumber(rule.output_price_per_million)}
                                              </div>
                                            </div>
                                            <div
                                              className="flex items-center gap-1"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <Badge
                                                variant={
                                                  rule.source === "manual" ? "success" : "neutral"
                                                }
                                              >
                                                {rule.source === "manual"
                                                  ? t("tierRulesSourceManual")
                                                  : t("tierRulesSourceLitellm")}
                                              </Badge>
                                              {rule.source === "manual" && (
                                                <>
                                                  <Switch
                                                    checked={rule.is_active}
                                                    onCheckedChange={(checked) =>
                                                      updateTierRule.mutate({
                                                        id: rule.id,
                                                        data: { is_active: checked },
                                                      })
                                                    }
                                                    disabled={updateTierRule.isPending}
                                                  />
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6"
                                                    onClick={() => deleteTierRule.mutate(rule.id)}
                                                    disabled={deleteTierRule.isPending}
                                                  >
                                                    <Trash2 className="h-3 w-3" />
                                                  </Button>
                                                </>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
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
                  <Table className="w-full min-w-[850px] text-sm">
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
                          {t("priceCatalogInputOutputPrice")} /{" "}
                          {t("priceCatalogCacheReadWritePrice")}
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
                                  <Badge variant="success">
                                    {t("priceCatalogEffectiveManual")}
                                  </Badge>
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
                              {isEditingPrice(override.model) ? (
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
                                              value={editDraft[field]}
                                              onChange={(e) => setDraftField(field, e.target.value)}
                                              className="h-7 text-xs tabular-nums"
                                              onKeyDown={editKeyDown}
                                            />
                                          </div>
                                        ))}
                                      </div>
                                      <div className="grid grid-cols-[24px_auto] items-center gap-2">
                                        <span className="text-[11px] text-muted-foreground">
                                          {t("overrideNote")}
                                        </span>
                                        <Input
                                          value={editDraft.note}
                                          onChange={(e) => setDraftField("note", e.target.value)}
                                          className="h-7 text-xs"
                                          onKeyDown={editKeyDown}
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
                                        className="h-8 w-8 text-green-600 hover:text-green-700"
                                        onClick={() => void saveEdit()}
                                        disabled={editIsSaving}
                                      >
                                        <Check className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={cancelEditing}
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
                                      startEditingPrice(override.model, override);
                                    }}
                                  >
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                      <div className="grid grid-cols-[24px_auto] items-center justify-start gap-2">
                                        <span className="text-[11px] text-muted-foreground">
                                          IN
                                        </span>
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
                                        <span className="text-[11px] text-muted-foreground">
                                          CR
                                        </span>
                                        <div>
                                          {override.cache_read_input_price_per_million == null
                                            ? "-"
                                            : override.cache_read_input_price_per_million.toFixed(
                                                4
                                              )}
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-[24px_auto] items-center justify-start gap-2">
                                        <span className="text-[11px] text-muted-foreground">
                                          OUT
                                        </span>
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
                                        <span className="text-[11px] text-muted-foreground">
                                          CW
                                        </span>
                                        <div>
                                          {override.cache_write_input_price_per_million == null
                                            ? "-"
                                            : override.cache_write_input_price_per_million.toFixed(
                                                4
                                              )}
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
                                        onClick={() => openResetDialog([override.model])}
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
                                          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-300/60"
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
                                      <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                          {t("tierRulesTitle")} ({modelTierRules.length})
                                        </p>
                                        <Table className="w-full text-xs">
                                          <TableHeader>
                                            <TableRow className="border-b border-divider/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground hover:bg-transparent">
                                              <TableHead className="px-2 py-1 h-auto">
                                                {t("tierRulesThreshold")}
                                              </TableHead>
                                              <TableHead className="px-2 py-1 h-auto">
                                                {t("tierRulesSource")}
                                              </TableHead>
                                              <TableHead className="px-2 py-1 h-auto">IN</TableHead>
                                              <TableHead className="px-2 py-1 h-auto">
                                                OUT
                                              </TableHead>
                                              <TableHead className="px-2 py-1 h-auto">CR</TableHead>
                                              <TableHead className="px-2 py-1 h-auto">CW</TableHead>
                                              <TableHead className="px-2 py-1 h-auto">
                                                {t("tierRulesActive")}
                                              </TableHead>
                                              <TableHead className="w-10 px-2 py-1 h-auto" />
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {modelTierRules.map((rule) => {
                                              const isTierEditing =
                                                rule.source === "manual"
                                                  ? isEditingTierRule(rule.id)
                                                  : isEditingTierOverride(
                                                      override.model,
                                                      rule.threshold_input_tokens
                                                    );
                                              return (
                                                <TableRow
                                                  key={rule.id}
                                                  className={cn(
                                                    "border-b border-divider/30",
                                                    !rule.is_active && "opacity-50"
                                                  )}
                                                >
                                                  <TableCell className="px-2 py-1.5 tabular-nums">
                                                    {t("tierRulesThresholdTokens", {
                                                      count: rule.threshold_input_tokens / 1000,
                                                    })}
                                                  </TableCell>
                                                  <TableCell className="px-2 py-1.5">
                                                    <Badge
                                                      variant={
                                                        rule.source === "manual"
                                                          ? "success"
                                                          : "neutral"
                                                      }
                                                    >
                                                      {rule.source === "manual"
                                                        ? t("tierRulesSourceManual")
                                                        : t("tierRulesSourceLitellm")}
                                                    </Badge>
                                                  </TableCell>
                                                  {isTierEditing ? (
                                                    <>
                                                      <TableCell className="px-2 py-1.5">
                                                        <Input
                                                          value={editDraft.input}
                                                          onChange={(e) =>
                                                            setDraftField("input", e.target.value)
                                                          }
                                                          className="h-6 w-20 text-xs tabular-nums"
                                                          onKeyDown={editKeyDown}
                                                        />
                                                      </TableCell>
                                                      <TableCell className="px-2 py-1.5">
                                                        <Input
                                                          value={editDraft.output}
                                                          onChange={(e) =>
                                                            setDraftField("output", e.target.value)
                                                          }
                                                          className="h-6 w-20 text-xs tabular-nums"
                                                          onKeyDown={editKeyDown}
                                                        />
                                                      </TableCell>
                                                      <TableCell className="px-2 py-1.5">
                                                        <Input
                                                          value={editDraft.cacheRead}
                                                          onChange={(e) =>
                                                            setDraftField(
                                                              "cacheRead",
                                                              e.target.value
                                                            )
                                                          }
                                                          className="h-6 w-20 text-xs tabular-nums"
                                                          onKeyDown={editKeyDown}
                                                        />
                                                      </TableCell>
                                                      <TableCell className="px-2 py-1.5">
                                                        <Input
                                                          value={editDraft.cacheWrite}
                                                          onChange={(e) =>
                                                            setDraftField(
                                                              "cacheWrite",
                                                              e.target.value
                                                            )
                                                          }
                                                          className="h-6 w-20 text-xs tabular-nums"
                                                          onKeyDown={editKeyDown}
                                                        />
                                                      </TableCell>
                                                      <TableCell className="px-2 py-1.5" />
                                                      <TableCell className="px-2 py-1.5">
                                                        <div className="flex items-center gap-0.5">
                                                          <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 text-green-600 hover:text-green-700"
                                                            onClick={() => void saveEdit()}
                                                            disabled={editIsSaving}
                                                          >
                                                            <Check className="h-3 w-3" />
                                                          </Button>
                                                          <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={cancelEditing}
                                                          >
                                                            <X className="h-3 w-3" />
                                                          </Button>
                                                        </div>
                                                      </TableCell>
                                                    </>
                                                  ) : (
                                                    <>
                                                      <TableCell
                                                        className="px-2 py-1.5 tabular-nums cursor-pointer hover:bg-surface-300/40 transition-colors"
                                                        onClick={() =>
                                                          rule.source === "manual"
                                                            ? startEditingTierRule(rule)
                                                            : startEditingTierOverride(
                                                                override.model,
                                                                rule
                                                              )
                                                        }
                                                      >
                                                        {formatPriceNumber(
                                                          rule.input_price_per_million
                                                        )}
                                                      </TableCell>
                                                      <TableCell
                                                        className="px-2 py-1.5 tabular-nums cursor-pointer hover:bg-surface-300/40 transition-colors"
                                                        onClick={() =>
                                                          rule.source === "manual"
                                                            ? startEditingTierRule(rule)
                                                            : startEditingTierOverride(
                                                                override.model,
                                                                rule
                                                              )
                                                        }
                                                      >
                                                        {formatPriceNumber(
                                                          rule.output_price_per_million
                                                        )}
                                                      </TableCell>
                                                      <TableCell
                                                        className="px-2 py-1.5 tabular-nums cursor-pointer hover:bg-surface-300/40 transition-colors"
                                                        onClick={() =>
                                                          rule.source === "manual"
                                                            ? startEditingTierRule(rule)
                                                            : startEditingTierOverride(
                                                                override.model,
                                                                rule
                                                              )
                                                        }
                                                      >
                                                        {formatPriceNumber(
                                                          rule.cache_read_input_price_per_million
                                                        )}
                                                      </TableCell>
                                                      <TableCell
                                                        className="px-2 py-1.5 tabular-nums cursor-pointer hover:bg-surface-300/40 transition-colors"
                                                        onClick={() =>
                                                          rule.source === "manual"
                                                            ? startEditingTierRule(rule)
                                                            : startEditingTierOverride(
                                                                override.model,
                                                                rule
                                                              )
                                                        }
                                                      >
                                                        {formatPriceNumber(
                                                          rule.cache_write_input_price_per_million
                                                        )}
                                                      </TableCell>
                                                      <TableCell className="px-2 py-1.5">
                                                        {rule.source === "manual" ? (
                                                          <Switch
                                                            checked={rule.is_active}
                                                            onCheckedChange={(checked) =>
                                                              updateTierRule.mutate({
                                                                id: rule.id,
                                                                data: { is_active: checked },
                                                              })
                                                            }
                                                            disabled={updateTierRule.isPending}
                                                          />
                                                        ) : (
                                                          <span className="text-muted-foreground">
                                                            -
                                                          </span>
                                                        )}
                                                      </TableCell>
                                                      <TableCell className="px-2 py-1.5">
                                                        {rule.source === "manual" && (
                                                          <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={() =>
                                                              deleteTierRule.mutate(rule.id)
                                                            }
                                                            disabled={deleteTierRule.isPending}
                                                            title={t("tierRulesDelete")}
                                                          >
                                                            <Trash2 className="h-3 w-3" />
                                                          </Button>
                                                        )}
                                                      </TableCell>
                                                    </>
                                                  )}
                                                </TableRow>
                                              );
                                            })}
                                          </TableBody>
                                        </Table>
                                      </div>
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
                              <TableCell
                                className="px-3 py-2"
                                onClick={(e) => e.stopPropagation()}
                              />
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
                                  className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-300/60"
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
                                  <div className="space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                      {t("tierRulesTitle")} ({modelTierRules.length})
                                    </p>
                                    <Table className="w-full text-xs">
                                      <TableHeader>
                                        <TableRow className="border-b border-divider/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground hover:bg-transparent">
                                          <TableHead className="px-2 py-1 h-auto">
                                            {t("tierRulesThreshold")}
                                          </TableHead>
                                          <TableHead className="px-2 py-1 h-auto">
                                            {t("tierRulesSource")}
                                          </TableHead>
                                          <TableHead className="px-2 py-1 h-auto">IN</TableHead>
                                          <TableHead className="px-2 py-1 h-auto">OUT</TableHead>
                                          <TableHead className="px-2 py-1 h-auto">CR</TableHead>
                                          <TableHead className="px-2 py-1 h-auto">CW</TableHead>
                                          <TableHead className="px-2 py-1 h-auto">
                                            {t("tierRulesActive")}
                                          </TableHead>
                                          <TableHead className="w-10 px-2 py-1 h-auto" />
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {modelTierRules.map((rule) => {
                                          const isTierEditing =
                                            rule.source === "manual"
                                              ? isEditingTierRule(rule.id)
                                              : isEditingTierOverride(
                                                  model,
                                                  rule.threshold_input_tokens
                                                );
                                          return (
                                            <TableRow
                                              key={rule.id}
                                              className={cn(
                                                "border-b border-divider/30",
                                                !rule.is_active && "opacity-50"
                                              )}
                                            >
                                              <TableCell className="px-2 py-1.5 tabular-nums">
                                                {t("tierRulesThresholdTokens", {
                                                  count: rule.threshold_input_tokens / 1000,
                                                })}
                                              </TableCell>
                                              <TableCell className="px-2 py-1.5">
                                                <Badge
                                                  variant={
                                                    rule.source === "manual" ? "success" : "neutral"
                                                  }
                                                >
                                                  {rule.source === "manual"
                                                    ? t("tierRulesSourceManual")
                                                    : t("tierRulesSourceLitellm")}
                                                </Badge>
                                              </TableCell>
                                              {isTierEditing ? (
                                                <>
                                                  <TableCell className="px-2 py-1.5">
                                                    <Input
                                                      value={editDraft.input}
                                                      onChange={(e) =>
                                                        setDraftField("input", e.target.value)
                                                      }
                                                      className="h-6 w-20 text-xs tabular-nums"
                                                      onKeyDown={editKeyDown}
                                                    />
                                                  </TableCell>
                                                  <TableCell className="px-2 py-1.5">
                                                    <Input
                                                      value={editDraft.output}
                                                      onChange={(e) =>
                                                        setDraftField("output", e.target.value)
                                                      }
                                                      className="h-6 w-20 text-xs tabular-nums"
                                                      onKeyDown={editKeyDown}
                                                    />
                                                  </TableCell>
                                                  <TableCell className="px-2 py-1.5">
                                                    <Input
                                                      value={editDraft.cacheRead}
                                                      onChange={(e) =>
                                                        setDraftField("cacheRead", e.target.value)
                                                      }
                                                      className="h-6 w-20 text-xs tabular-nums"
                                                      onKeyDown={editKeyDown}
                                                    />
                                                  </TableCell>
                                                  <TableCell className="px-2 py-1.5">
                                                    <Input
                                                      value={editDraft.cacheWrite}
                                                      onChange={(e) =>
                                                        setDraftField("cacheWrite", e.target.value)
                                                      }
                                                      className="h-6 w-20 text-xs tabular-nums"
                                                      onKeyDown={editKeyDown}
                                                    />
                                                  </TableCell>
                                                  <TableCell className="px-2 py-1.5" />
                                                  <TableCell className="px-2 py-1.5">
                                                    <div className="flex items-center gap-0.5">
                                                      <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 text-green-600 hover:text-green-700"
                                                        onClick={() => void saveEdit()}
                                                        disabled={editIsSaving}
                                                      >
                                                        <Check className="h-3 w-3" />
                                                      </Button>
                                                      <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6"
                                                        onClick={cancelEditing}
                                                      >
                                                        <X className="h-3 w-3" />
                                                      </Button>
                                                    </div>
                                                  </TableCell>
                                                </>
                                              ) : (
                                                <>
                                                  <TableCell
                                                    className="px-2 py-1.5 tabular-nums cursor-pointer hover:bg-surface-300/40 transition-colors"
                                                    onClick={() =>
                                                      rule.source === "manual"
                                                        ? startEditingTierRule(rule)
                                                        : startEditingTierOverride(model, rule)
                                                    }
                                                  >
                                                    {formatPriceNumber(
                                                      rule.input_price_per_million
                                                    )}
                                                  </TableCell>
                                                  <TableCell
                                                    className="px-2 py-1.5 tabular-nums cursor-pointer hover:bg-surface-300/40 transition-colors"
                                                    onClick={() =>
                                                      rule.source === "manual"
                                                        ? startEditingTierRule(rule)
                                                        : startEditingTierOverride(model, rule)
                                                    }
                                                  >
                                                    {formatPriceNumber(
                                                      rule.output_price_per_million
                                                    )}
                                                  </TableCell>
                                                  <TableCell
                                                    className="px-2 py-1.5 tabular-nums cursor-pointer hover:bg-surface-300/40 transition-colors"
                                                    onClick={() =>
                                                      rule.source === "manual"
                                                        ? startEditingTierRule(rule)
                                                        : startEditingTierOverride(model, rule)
                                                    }
                                                  >
                                                    {formatPriceNumber(
                                                      rule.cache_read_input_price_per_million
                                                    )}
                                                  </TableCell>
                                                  <TableCell
                                                    className="px-2 py-1.5 tabular-nums cursor-pointer hover:bg-surface-300/40 transition-colors"
                                                    onClick={() =>
                                                      rule.source === "manual"
                                                        ? startEditingTierRule(rule)
                                                        : startEditingTierOverride(model, rule)
                                                    }
                                                  >
                                                    {formatPriceNumber(
                                                      rule.cache_write_input_price_per_million
                                                    )}
                                                  </TableCell>
                                                  <TableCell className="px-2 py-1.5">
                                                    {rule.source === "manual" ? (
                                                      <Switch
                                                        checked={rule.is_active}
                                                        onCheckedChange={(checked) =>
                                                          updateTierRule.mutate({
                                                            id: rule.id,
                                                            data: { is_active: checked },
                                                          })
                                                        }
                                                        disabled={updateTierRule.isPending}
                                                      />
                                                    ) : (
                                                      <span className="text-muted-foreground">
                                                        -
                                                      </span>
                                                    )}
                                                  </TableCell>
                                                  <TableCell className="px-2 py-1.5">
                                                    {rule.source === "manual" && (
                                                      <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6"
                                                        onClick={() =>
                                                          deleteTierRule.mutate(rule.id)
                                                        }
                                                        disabled={deleteTierRule.isPending}
                                                        title={t("tierRulesDelete")}
                                                      >
                                                        <Trash2 className="h-3 w-3" />
                                                      </Button>
                                                    )}
                                                  </TableCell>
                                                </>
                                              )}
                                            </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}

                      {priceCatalogVisibleSyncedItems.map((item: BillingModelPrice) => {
                        const override = manualOverrideMap.get(item.model);
                        const tierPreview = tierRulePreviewMap.get(item.model);
                        const tierPreviewLabel = tierPreview
                          ? `>${t("tierRulesThresholdTokens", {
                              count: tierPreview.threshold_input_tokens / 1000,
                            })}`
                          : null;
                        const effective = override
                          ? {
                              input: override.input_price_per_million,
                              output: override.output_price_per_million,
                              cacheRead: override.cache_read_input_price_per_million,
                              cacheWrite: override.cache_write_input_price_per_million,
                              source: "manual" as const,
                            }
                          : {
                              input: item.input_price_per_million,
                              output: item.output_price_per_million,
                              cacheRead: item.cache_read_input_price_per_million,
                              cacheWrite: item.cache_write_input_price_per_million,
                              source: "litellm" as const,
                            };
                        const modelTierRules = allTierRulesMap.get(item.model);
                        const hasTiers = !!modelTierRules && modelTierRules.length > 0;
                        const isExpanded = expandedPriceRows.has(item.model);

                        const renderEffectiveNumber = (options: {
                          effectiveValue: number | null;
                          syncedValue: number | null;
                        }) => {
                          const { effectiveValue, syncedValue } = options;
                          if (effectiveValue == null) {
                            return <span className="text-muted-foreground">-</span>;
                          }

                          if (!override) {
                            return (
                              <span className="tabular-nums">{effectiveValue.toFixed(4)}</span>
                            );
                          }

                          const syncedLabel =
                            syncedValue == null ? "-" : (syncedValue as number).toFixed(4);
                          return (
                            <div className="space-y-0.5">
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
                          <Fragment key={item.id}>
                            <TableRow
                              className={cn(
                                "border-b border-divider/60 align-top",
                                hasTiers && "cursor-pointer",
                                recentlySavedModel === item.model && "bg-amber-500/10"
                              )}
                              onClick={hasTiers ? () => togglePriceRow(item.model) : undefined}
                            >
                              <TableCell className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                {override ? (
                                  <Checkbox
                                    checked={selectedResetModels.includes(item.model)}
                                    onCheckedChange={(value) =>
                                      toggleSelectedResetModel(item.model, value === true)
                                    }
                                    aria-label={t("priceCatalogSelectModel", {
                                      model: item.model,
                                    })}
                                  />
                                ) : (
                                  <span className="sr-only">-</span>
                                )}
                              </TableCell>
                              <TableCell className="px-3 py-2 font-mono">
                                <span className="block whitespace-normal break-words leading-5">
                                  {item.model}
                                </span>
                              </TableCell>
                              <TableCell className="px-3 py-2 whitespace-nowrap">
                                <div className="space-y-1">
                                  <Badge variant={override ? "success" : "neutral"}>
                                    {override
                                      ? t("priceCatalogEffectiveManual")
                                      : t("priceCatalogEffectiveSynced")}
                                  </Badge>
                                  <p className="text-[11px] text-muted-foreground">{item.source}</p>
                                </div>
                              </TableCell>
                              <TableCell className="hidden px-3 py-2 text-xs text-muted-foreground lg:table-cell">
                                <div className="space-y-1">
                                  <div>{tierRuleThresholdMap.get(item.model) ?? "-"}</div>
                                  <div>
                                    {item.max_input_tokens != null
                                      ? item.max_input_tokens.toLocaleString()
                                      : "-"}{" "}
                                    /{" "}
                                    {item.max_output_tokens != null
                                      ? item.max_output_tokens.toLocaleString()
                                      : "-"}
                                  </div>
                                </div>
                              </TableCell>
                              {isEditingPrice(item.model) ? (
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
                                              value={editDraft[field]}
                                              onChange={(e) => setDraftField(field, e.target.value)}
                                              className="h-7 text-xs tabular-nums"
                                              onKeyDown={editKeyDown}
                                            />
                                          </div>
                                        ))}
                                      </div>
                                      <div className="grid grid-cols-[24px_auto] items-center gap-2">
                                        <span className="text-[11px] text-muted-foreground">
                                          {t("overrideNote")}
                                        </span>
                                        <Input
                                          value={editDraft.note}
                                          onChange={(e) => setDraftField("note", e.target.value)}
                                          className="h-7 text-xs"
                                          onKeyDown={editKeyDown}
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
                                        className="h-8 w-8 text-green-600 hover:text-green-700"
                                        onClick={() => void saveEdit()}
                                        disabled={editIsSaving}
                                      >
                                        <Check className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={cancelEditing}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </>
                              ) : (
                                <>
                                  <TableCell
                                    className="px-3 py-2 cursor-pointer hover:bg-surface-300/40 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditingPrice(item.model, override);
                                    }}
                                  >
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                      <div className="grid grid-cols-[24px_auto] items-start justify-start gap-2">
                                        <span className="pt-0.5 text-[11px] text-muted-foreground">
                                          IN
                                        </span>
                                        <div>
                                          {renderEffectiveNumber({
                                            effectiveValue: effective.input,
                                            syncedValue: item.input_price_per_million,
                                          })}
                                          {tierPreviewLabel ? (
                                            <div className="text-[11px] tabular-nums text-muted-foreground">
                                              {tierPreviewLabel}:{" "}
                                              {formatPriceNumber(
                                                tierPreview?.input_price_per_million ?? null
                                              )}
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-[24px_auto] items-start justify-start gap-2">
                                        <span className="pt-0.5 text-[11px] text-muted-foreground">
                                          CR
                                        </span>
                                        <div>
                                          {renderEffectiveNumber({
                                            effectiveValue: effective.cacheRead,
                                            syncedValue: item.cache_read_input_price_per_million,
                                          })}
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-[24px_auto] items-start justify-start gap-2">
                                        <span className="pt-0.5 text-[11px] text-muted-foreground">
                                          OUT
                                        </span>
                                        <div>
                                          {renderEffectiveNumber({
                                            effectiveValue: effective.output,
                                            syncedValue: item.output_price_per_million,
                                          })}
                                          {tierPreviewLabel ? (
                                            <div className="text-[11px] tabular-nums text-muted-foreground">
                                              {tierPreviewLabel}:{" "}
                                              {formatPriceNumber(
                                                tierPreview?.output_price_per_million ?? null
                                              )}
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-[24px_auto] items-start justify-start gap-2">
                                        <span className="pt-0.5 text-[11px] text-muted-foreground">
                                          CW
                                        </span>
                                        <div>
                                          {renderEffectiveNumber({
                                            effectiveValue: effective.cacheWrite,
                                            syncedValue: item.cache_write_input_price_per_million,
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="hidden px-3 py-2 text-xs text-muted-foreground lg:table-cell">
                                    {new Date(item.synced_at).toLocaleString(locale)}
                                  </TableCell>
                                  <TableCell
                                    className="px-3 py-2"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="flex items-center gap-1">
                                      {override ? (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          onClick={() => openResetDialog([item.model])}
                                          disabled={resetOverrides.isPending}
                                          title={t("priceCatalogResetToOfficial")}
                                        >
                                          <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                        </Button>
                                      ) : (
                                        <span className="inline-block h-8 w-8" />
                                      )}
                                      {hasTiers && (
                                        <button
                                          type="button"
                                          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-300/60"
                                          onClick={() => togglePriceRow(item.model)}
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
                                      <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                          {t("tierRulesTitle")} ({modelTierRules.length})
                                        </p>
                                        <Table className="w-full text-xs">
                                          <TableHeader>
                                            <TableRow className="border-b border-divider/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground hover:bg-transparent">
                                              <TableHead className="px-2 py-1 h-auto">
                                                {t("tierRulesThreshold")}
                                              </TableHead>
                                              <TableHead className="px-2 py-1 h-auto">
                                                {t("tierRulesSource")}
                                              </TableHead>
                                              <TableHead className="px-2 py-1 h-auto">IN</TableHead>
                                              <TableHead className="px-2 py-1 h-auto">
                                                OUT
                                              </TableHead>
                                              <TableHead className="px-2 py-1 h-auto">CR</TableHead>
                                              <TableHead className="px-2 py-1 h-auto">CW</TableHead>
                                              <TableHead className="px-2 py-1 h-auto">
                                                {t("tierRulesActive")}
                                              </TableHead>
                                              <TableHead className="w-10 px-2 py-1 h-auto" />
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {modelTierRules.map((rule) => {
                                              const isTierEditing =
                                                rule.source === "manual"
                                                  ? isEditingTierRule(rule.id)
                                                  : isEditingTierOverride(
                                                      item.model,
                                                      rule.threshold_input_tokens
                                                    );
                                              return (
                                                <TableRow
                                                  key={rule.id}
                                                  className={cn(
                                                    "border-b border-divider/30",
                                                    !rule.is_active && "opacity-50"
                                                  )}
                                                >
                                                  <TableCell className="px-2 py-1.5 tabular-nums">
                                                    {t("tierRulesThresholdTokens", {
                                                      count: rule.threshold_input_tokens / 1000,
                                                    })}
                                                  </TableCell>
                                                  <TableCell className="px-2 py-1.5">
                                                    <Badge
                                                      variant={
                                                        rule.source === "manual"
                                                          ? "success"
                                                          : "neutral"
                                                      }
                                                    >
                                                      {rule.source === "manual"
                                                        ? t("tierRulesSourceManual")
                                                        : t("tierRulesSourceLitellm")}
                                                    </Badge>
                                                  </TableCell>
                                                  {isTierEditing ? (
                                                    <>
                                                      <TableCell className="px-2 py-1.5">
                                                        <Input
                                                          value={editDraft.input}
                                                          onChange={(e) =>
                                                            setDraftField("input", e.target.value)
                                                          }
                                                          className="h-6 w-20 text-xs tabular-nums"
                                                          onKeyDown={editKeyDown}
                                                        />
                                                      </TableCell>
                                                      <TableCell className="px-2 py-1.5">
                                                        <Input
                                                          value={editDraft.output}
                                                          onChange={(e) =>
                                                            setDraftField("output", e.target.value)
                                                          }
                                                          className="h-6 w-20 text-xs tabular-nums"
                                                          onKeyDown={editKeyDown}
                                                        />
                                                      </TableCell>
                                                      <TableCell className="px-2 py-1.5">
                                                        <Input
                                                          value={editDraft.cacheRead}
                                                          onChange={(e) =>
                                                            setDraftField(
                                                              "cacheRead",
                                                              e.target.value
                                                            )
                                                          }
                                                          className="h-6 w-20 text-xs tabular-nums"
                                                          onKeyDown={editKeyDown}
                                                        />
                                                      </TableCell>
                                                      <TableCell className="px-2 py-1.5">
                                                        <Input
                                                          value={editDraft.cacheWrite}
                                                          onChange={(e) =>
                                                            setDraftField(
                                                              "cacheWrite",
                                                              e.target.value
                                                            )
                                                          }
                                                          className="h-6 w-20 text-xs tabular-nums"
                                                          onKeyDown={editKeyDown}
                                                        />
                                                      </TableCell>
                                                      <TableCell className="px-2 py-1.5" />
                                                      <TableCell className="px-2 py-1.5">
                                                        <div className="flex items-center gap-0.5">
                                                          <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 text-green-600 hover:text-green-700"
                                                            onClick={() => void saveEdit()}
                                                            disabled={editIsSaving}
                                                          >
                                                            <Check className="h-3 w-3" />
                                                          </Button>
                                                          <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={cancelEditing}
                                                          >
                                                            <X className="h-3 w-3" />
                                                          </Button>
                                                        </div>
                                                      </TableCell>
                                                    </>
                                                  ) : (
                                                    <>
                                                      <TableCell
                                                        className="px-2 py-1.5 tabular-nums cursor-pointer hover:bg-surface-300/40 transition-colors"
                                                        onClick={() =>
                                                          rule.source === "manual"
                                                            ? startEditingTierRule(rule)
                                                            : startEditingTierOverride(
                                                                item.model,
                                                                rule
                                                              )
                                                        }
                                                      >
                                                        {formatPriceNumber(
                                                          rule.input_price_per_million
                                                        )}
                                                      </TableCell>
                                                      <TableCell
                                                        className="px-2 py-1.5 tabular-nums cursor-pointer hover:bg-surface-300/40 transition-colors"
                                                        onClick={() =>
                                                          rule.source === "manual"
                                                            ? startEditingTierRule(rule)
                                                            : startEditingTierOverride(
                                                                item.model,
                                                                rule
                                                              )
                                                        }
                                                      >
                                                        {formatPriceNumber(
                                                          rule.output_price_per_million
                                                        )}
                                                      </TableCell>
                                                      <TableCell
                                                        className="px-2 py-1.5 tabular-nums cursor-pointer hover:bg-surface-300/40 transition-colors"
                                                        onClick={() =>
                                                          rule.source === "manual"
                                                            ? startEditingTierRule(rule)
                                                            : startEditingTierOverride(
                                                                item.model,
                                                                rule
                                                              )
                                                        }
                                                      >
                                                        {formatPriceNumber(
                                                          rule.cache_read_input_price_per_million
                                                        )}
                                                      </TableCell>
                                                      <TableCell
                                                        className="px-2 py-1.5 tabular-nums cursor-pointer hover:bg-surface-300/40 transition-colors"
                                                        onClick={() =>
                                                          rule.source === "manual"
                                                            ? startEditingTierRule(rule)
                                                            : startEditingTierOverride(
                                                                item.model,
                                                                rule
                                                              )
                                                        }
                                                      >
                                                        {formatPriceNumber(
                                                          rule.cache_write_input_price_per_million
                                                        )}
                                                      </TableCell>
                                                      <TableCell className="px-2 py-1.5">
                                                        {rule.source === "manual" ? (
                                                          <Switch
                                                            checked={rule.is_active}
                                                            onCheckedChange={(checked) =>
                                                              updateTierRule.mutate({
                                                                id: rule.id,
                                                                data: { is_active: checked },
                                                              })
                                                            }
                                                            disabled={updateTierRule.isPending}
                                                          />
                                                        ) : (
                                                          <span className="text-muted-foreground">
                                                            -
                                                          </span>
                                                        )}
                                                      </TableCell>
                                                      <TableCell className="px-2 py-1.5">
                                                        {rule.source === "manual" && (
                                                          <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={() =>
                                                              deleteTierRule.mutate(rule.id)
                                                            }
                                                            disabled={deleteTierRule.isPending}
                                                            title={t("tierRulesDelete")}
                                                          >
                                                            <Trash2 className="h-3 w-3" />
                                                          </Button>
                                                        )}
                                                      </TableCell>
                                                    </>
                                                  )}
                                                </TableRow>
                                              );
                                            })}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {modelPrices.data && modelPrices.data.total_pages > 1 && (
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="type-body-small text-muted-foreground">
                      {tCommon("items")}{" "}
                      <span className="font-semibold text-foreground">
                        {modelPrices.data.total}
                      </span>{" "}
                      · {tCommon("page")}{" "}
                      <span className="font-semibold text-foreground">{modelPrices.data.page}</span>{" "}
                      {tCommon("of")}{" "}
                      <span className="font-semibold text-foreground">
                        {modelPrices.data.total_pages}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex items-center gap-2">
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
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setModelPricePage((prev) => Math.max(1, prev - 1));
                          setExpandedPriceRows(new Set());
                          if (editTarget) setEditTarget(null);
                        }}
                        disabled={modelPricePage === 1}
                        className="gap-1"
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                        {tCommon("previous")}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setModelPricePage((prev) =>
                            Math.min(modelPrices.data?.total_pages ?? prev, prev + 1)
                          );
                          setExpandedPriceRows(new Set());
                          if (editTarget) setEditTarget(null);
                        }}
                        disabled={modelPricePage === modelPrices.data.total_pages}
                        className="gap-1"
                      >
                        {tCommon("next")}
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card variant="outlined" className="border-divider bg-surface-200/70">
          <CardContent className="space-y-3 p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="type-label-medium text-foreground">{t("logsTitle")}</h3>
                <p className="text-sm text-muted-foreground">{t("logsDesc")}</p>
              </div>
              <Button asChild variant="secondary" className="w-full sm:w-auto">
                <Link href="/logs">{t("logsAction")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!resetDialogTargets} onOpenChange={(v) => !v && closeResetDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("priceCatalogResetDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("priceCatalogResetDialogDesc", { count: resetDialogTargets?.length ?? 0 })}
              {(() => {
                const targets = resetDialogTargets ?? [];
                const missingOfficialCount = targets.filter(
                  (model) => manualOverrideMap.get(model)?.has_official_price === false
                ).length;
                if (missingOfficialCount === 0) {
                  return null;
                }
                return (
                  <span className="mt-2 block text-status-warning">
                    {t("priceCatalogResetDialogWarningNoOfficial", {
                      count: missingOfficialCount,
                    })}
                  </span>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetOverrides.isPending}>
              {tCommon("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleConfirmReset()}
              disabled={resetOverrides.isPending}
            >
              {resetOverrides.isPending ? tCommon("loading") : t("priceCatalogResetConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
