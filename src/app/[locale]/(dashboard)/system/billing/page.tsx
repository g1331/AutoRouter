"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ChevronLeft, ChevronRight, Plus, RotateCcw, Trash2, Wallet } from "lucide-react";

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
  useDeleteBillingManualOverride,
  useResetBillingManualOverrides,
  useSyncBillingPrices,
  useBillingModelPrices,
  useBillingTierRules,
  useCreateBillingTierRule,
  useDeleteBillingTierRule,
  useUpdateBillingTierRule,
} from "@/hooks/use-billing";
import type {
  BillingModelPrice,
  BillingManualOverride,
  BillingTierRule,
  BillingUnresolvedModel,
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
  if (status === "partial") return "warning";
  if (status === "failed") return "error";
  return "neutral";
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

function TierRulesManager({ t }: { t: BillingTranslate }) {
  const tCommon = useTranslations("common");
  const { data: tierRulesData, isLoading } = useBillingTierRules();
  const createTierRule = useCreateBillingTierRule();
  const deleteTierRule = useDeleteBillingTierRule();
  const updateTierRule = useUpdateBillingTierRule();

  const [isCreating, setIsCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    model: "",
    threshold: "",
    inputPrice: "",
    outputPrice: "",
    cacheReadPrice: "",
    cacheWritePrice: "",
    note: "",
  });

  const tierRules = useMemo(() => tierRulesData?.items ?? [], [tierRulesData?.items]);
  const manualRules = useMemo(() => tierRules.filter((r) => r.source === "manual"), [tierRules]);
  const syncedRules = useMemo(
    () => tierRules.filter((r) => r.source === "litellm" && r.is_active),
    [tierRules]
  );

  const groupedSynced = useMemo(() => {
    const map = new Map<string, BillingTierRule[]>();
    for (const rule of syncedRules) {
      const list = map.get(rule.model) ?? [];
      list.push(rule);
      map.set(rule.model, list);
    }
    return map;
  }, [syncedRules]);

  const handleCreate = async () => {
    const model = createDraft.model.trim();
    const threshold = parsePositiveInt(createDraft.threshold);
    const inputPrice = parseRequiredPrice(createDraft.inputPrice);
    const outputPrice = parseRequiredPrice(createDraft.outputPrice);
    const cacheReadPrice = parseOptionalPrice(createDraft.cacheReadPrice);
    const cacheWritePrice = parseOptionalPrice(createDraft.cacheWritePrice);

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
        note: createDraft.note.trim() || null,
      });
    } catch {
      return;
    }

    setCreateDraft({
      model: "",
      threshold: "",
      inputPrice: "",
      outputPrice: "",
      cacheReadPrice: "",
      cacheWritePrice: "",
      note: "",
    });
    setIsCreating(false);
  };

  return (
    <div className="space-y-4">
      {/* Create new tier rule */}
      <div className="rounded-cf-sm border border-divider bg-surface-300/45 p-3">
        {!isCreating ? (
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4" />
            {t("tierRulesAdd")}
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="font-medium text-foreground">{t("tierRulesAdd")}</p>
            <div className="grid gap-2 md:grid-cols-4">
              <Input
                placeholder={t("tierRulesModelPlaceholder")}
                value={createDraft.model}
                onChange={(e) => setCreateDraft((prev) => ({ ...prev, model: e.target.value }))}
              />
              <Input
                placeholder={t("tierRulesThresholdPlaceholder")}
                value={createDraft.threshold}
                onChange={(e) => setCreateDraft((prev) => ({ ...prev, threshold: e.target.value }))}
              />
              <Input
                placeholder={t("overrideInputPrice")}
                value={createDraft.inputPrice}
                onChange={(e) =>
                  setCreateDraft((prev) => ({ ...prev, inputPrice: e.target.value }))
                }
              />
              <Input
                placeholder={t("overrideOutputPrice")}
                value={createDraft.outputPrice}
                onChange={(e) =>
                  setCreateDraft((prev) => ({ ...prev, outputPrice: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              <Input
                placeholder={t("overrideCacheReadPrice")}
                value={createDraft.cacheReadPrice}
                onChange={(e) =>
                  setCreateDraft((prev) => ({ ...prev, cacheReadPrice: e.target.value }))
                }
              />
              <Input
                placeholder={t("overrideCacheWritePrice")}
                value={createDraft.cacheWritePrice}
                onChange={(e) =>
                  setCreateDraft((prev) => ({ ...prev, cacheWritePrice: e.target.value }))
                }
              />
              <Input
                placeholder={t("overrideNote")}
                value={createDraft.note}
                onChange={(e) => setCreateDraft((prev) => ({ ...prev, note: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => void handleCreate()}
                disabled={createTierRule.isPending}
              >
                {createTierRule.isPending ? t("tierRulesAdding") : t("overrideSave")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsCreating(false);
                  setCreateDraft({
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

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>
      ) : tierRules.length === 0 ? (
        <div className="rounded-cf-sm border border-dashed border-divider bg-surface-300/30 px-4 py-6 text-sm text-muted-foreground">
          {t("tierRulesEmpty")}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Manual rules section */}
          {manualRules.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("tierRulesSourceManual")}
              </p>
              <div className="space-y-2 lg:hidden">
                {manualRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="rounded-cf-sm border border-divider bg-surface-300/30 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="break-all font-mono text-sm text-foreground">{rule.model}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {t("tierRulesThreshold")}:{" "}
                          {t("tierRulesThresholdTokens", {
                            count: rule.threshold_input_tokens / 1000,
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Switch
                          checked={rule.is_active}
                          onCheckedChange={(checked) =>
                            updateTierRule.mutate({ id: rule.id, data: { is_active: checked } })
                          }
                          disabled={updateTierRule.isPending}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => deleteTierRule.mutate(rule.id)}
                          disabled={deleteTierRule.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-cf-sm border border-divider bg-surface-200/40 px-2 py-1.5">
                        <p className="text-muted-foreground">{t("tierRulesInputPrice")}</p>
                        <p className="mt-0.5 text-right font-medium tabular-nums text-foreground">
                          {formatPriceNumber(rule.input_price_per_million)}
                        </p>
                      </div>
                      <div className="rounded-cf-sm border border-divider bg-surface-200/40 px-2 py-1.5">
                        <p className="text-muted-foreground">{t("tierRulesOutputPrice")}</p>
                        <p className="mt-0.5 text-right font-medium tabular-nums text-foreground">
                          {formatPriceNumber(rule.output_price_per_million)}
                        </p>
                      </div>
                    </div>
                    {rule.note && (
                      <p className="mt-2 text-[11px] text-muted-foreground">{rule.note}</p>
                    )}
                  </div>
                ))}
              </div>
              <div className="hidden w-full overflow-x-auto lg:block">
                <Table className="w-full min-w-[900px] text-sm">
                  <TableHeader>
                    <TableRow className="border-b border-divider text-left text-xs uppercase tracking-wide text-muted-foreground hover:bg-transparent">
                      <TableHead className="w-[200px] px-3 py-2 h-auto">
                        {t("tierRulesModel")}
                      </TableHead>
                      <TableHead className="w-[120px] px-3 py-2 h-auto">
                        {t("tierRulesThreshold")}
                      </TableHead>
                      <TableHead className="w-[120px] px-3 py-2 h-auto">
                        {t("tierRulesInputPrice")}
                      </TableHead>
                      <TableHead className="w-[120px] px-3 py-2 h-auto">
                        {t("tierRulesOutputPrice")}
                      </TableHead>
                      <TableHead className="w-[100px] px-3 py-2 h-auto">
                        {t("tierRulesActive")}
                      </TableHead>
                      <TableHead className="w-14 px-3 py-2 h-auto"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manualRules.map((rule) => (
                      <TableRow
                        key={rule.id}
                        className="border-b border-divider/60 align-top bg-surface-300/20"
                      >
                        <TableCell className="px-3 py-2 font-mono">{rule.model}</TableCell>
                        <TableCell className="px-3 py-2 text-xs">
                          {t("tierRulesThresholdTokens", {
                            count: rule.threshold_input_tokens / 1000,
                          })}
                        </TableCell>
                        <TableCell className="px-3 py-2 tabular-nums">
                          {formatPriceNumber(rule.input_price_per_million)}
                        </TableCell>
                        <TableCell className="px-3 py-2 tabular-nums">
                          {formatPriceNumber(rule.output_price_per_million)}
                        </TableCell>
                        <TableCell className="px-3 py-2">
                          <Switch
                            checked={rule.is_active}
                            onCheckedChange={(checked) =>
                              updateTierRule.mutate({ id: rule.id, data: { is_active: checked } })
                            }
                            disabled={updateTierRule.isPending}
                          />
                        </TableCell>
                        <TableCell className="px-3 py-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => deleteTierRule.mutate(rule.id)}
                            disabled={deleteTierRule.isPending}
                            title={t("tierRulesDelete")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Synced rules section */}
          {syncedRules.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("tierRulesSourceLitellm")}
              </p>
              <div className="space-y-2 lg:hidden">
                {Array.from(groupedSynced.entries()).map(([model, rules]) => {
                  const sortedRules = [...rules].sort(
                    (a, b) => a.threshold_input_tokens - b.threshold_input_tokens
                  );
                  return (
                    <div
                      key={model}
                      className="rounded-cf-sm border border-divider bg-surface-300/30 p-3"
                    >
                      <p className="break-all font-mono text-sm text-foreground">{model}</p>
                      <div className="mt-2 space-y-1">
                        {sortedRules.map((rule) => (
                          <div key={rule.id} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              {t("tierRulesThresholdTokens", {
                                count: rule.threshold_input_tokens / 1000,
                              })}
                            </span>
                            <span className="tabular-nums">
                              {formatPriceNumber(rule.input_price_per_million)} /{" "}
                              {formatPriceNumber(rule.output_price_per_million)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden w-full overflow-x-auto lg:block">
                <Table className="w-full min-w-[900px] text-sm">
                  <TableHeader>
                    <TableRow className="border-b border-divider text-left text-xs uppercase tracking-wide text-muted-foreground hover:bg-transparent">
                      <TableHead className="w-[200px] px-3 py-2 h-auto">
                        {t("tierRulesModel")}
                      </TableHead>
                      <TableHead className="w-[120px] px-3 py-2 h-auto">
                        {t("tierRulesThreshold")}
                      </TableHead>
                      <TableHead className="w-[120px] px-3 py-2 h-auto">
                        {t("tierRulesInputPrice")}
                      </TableHead>
                      <TableHead className="w-[120px] px-3 py-2 h-auto">
                        {t("tierRulesOutputPrice")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {syncedRules
                      .sort((a, b) => {
                        if (a.model !== b.model) return a.model.localeCompare(b.model);
                        return a.threshold_input_tokens - b.threshold_input_tokens;
                      })
                      .map((rule) => (
                        <TableRow key={rule.id} className="border-b border-divider/60 align-top">
                          <TableCell className="px-3 py-2 font-mono">{rule.model}</TableCell>
                          <TableCell className="px-3 py-2 text-xs">
                            {t("tierRulesThresholdTokens", {
                              count: rule.threshold_input_tokens / 1000,
                            })}
                          </TableCell>
                          <TableCell className="px-3 py-2 tabular-nums">
                            {formatPriceNumber(rule.input_price_per_million)}
                          </TableCell>
                          <TableCell className="px-3 py-2 tabular-nums">
                            {formatPriceNumber(rule.output_price_per_million)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
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
  const priceCatalogHasRows =
    priceCatalogVisibleSyncedItems.length > 0 || priceCatalogExtraOverrides.length > 0;

  const tierRuleThresholdMap = useMemo(() => {
    const grouped = new Map<string, number[]>();
    // Use synced_tier_rules from catalog for synced rules (source of truth)
    for (const item of priceCatalogVisibleSyncedItems) {
      for (const rule of item.synced_tier_rules ?? []) {
        if (!rule.is_active) continue;
        const list = grouped.get(item.model) ?? [];
        list.push(rule.threshold_input_tokens);
        grouped.set(item.model, list);
      }
    }
    // Add manual rules from tierRules query
    for (const rule of tierRules.data?.items ?? []) {
      if (rule.source !== "manual" || !rule.is_active) continue;
      const list = grouped.get(rule.model) ?? [];
      list.push(rule.threshold_input_tokens);
      grouped.set(rule.model, list);
    }

    const result = new Map<string, string>();
    for (const [model, thresholds] of grouped.entries()) {
      const normalized = [...new Set(thresholds)].sort((a, b) => a - b);
      const label = normalized
        .map((tokens) => t("tierRulesThresholdTokens", { count: tokens / 1000 }))
        .join(" / ");
      result.set(model, label);
    }
    return result;
  }, [t, tierRules.data, priceCatalogVisibleSyncedItems]);

  const tierRulePreviewMap = useMemo(() => {
    const grouped = new Map<string, BillingTierRule[]>();
    // Use synced_tier_rules from catalog for synced rules (source of truth)
    for (const item of priceCatalogVisibleSyncedItems) {
      for (const rule of item.synced_tier_rules ?? []) {
        if (!rule.is_active) continue;
        const list = grouped.get(item.model) ?? [];
        list.push(rule);
        grouped.set(item.model, list);
      }
    }
    // Add manual rules from tierRules query
    for (const rule of tierRules.data?.items ?? []) {
      if (rule.source !== "manual" || !rule.is_active) continue;
      const list = grouped.get(rule.model) ?? [];
      list.push(rule);
      grouped.set(rule.model, list);
    }

    const result = new Map<string, BillingTierRule>();
    for (const [model, rules] of grouped.entries()) {
      const sorted = [...rules].sort((a, b) => {
        if (a.threshold_input_tokens !== b.threshold_input_tokens) {
          return a.threshold_input_tokens - b.threshold_input_tokens;
        }
        // At same threshold, synced (litellm) beats manual
        if (a.source === b.source) return 0;
        return a.source === "litellm" ? -1 : 1;
      });
      result.set(model, sorted[0]);
    }
    return result;
  }, [tierRules.data, priceCatalogVisibleSyncedItems]);

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
  const latestSyncText = latestSync
    ? latestSync.status === "success"
      ? t("syncSuccess", { source: latestSync.source ?? "-" })
      : latestSync.status === "partial"
        ? t("syncPartial", { source: latestSync.source ?? "-" })
        : t("syncFailed")
    : t("syncNever");

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
                <Badge variant={getSyncBadgeVariant(latestSync?.status ?? null)}>
                  {latestSyncText}
                </Badge>
              </div>
              {latestSync?.failure_reason && (
                <p className="mt-2 text-xs text-status-warning">
                  {t("syncFailureReason", { reason: latestSync.failure_reason })}
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
                    }, 300);
                  }}
                  placeholder={t("priceCatalogSearchPlaceholder")}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={modelPriceOnlyManual}
                    onCheckedChange={(checked) => {
                      setModelPriceOnlyManual(checked);
                      setModelPricePage(1);
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
                                {tierRuleThresholdMap.has(override.model) && (
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

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-cf-sm border border-divider bg-surface-200/40 px-2 py-1.5">
                              <p className="text-muted-foreground">{t("priceCatalogInputPrice")}</p>
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
                        </div>
                      </div>
                    </div>
                  ))}

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
                                  {tierRuleThresholdMap.has(item.model) && (
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

                            <div className="grid grid-cols-2 gap-2 text-xs">
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
                  <Table className="w-full min-w-[1360px] text-sm">
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
                        <TableHead className="w-[280px] px-3 py-2 h-auto text-left">
                          {t("priceCatalogModel")}
                        </TableHead>
                        <TableHead className="hidden w-[88px] px-3 py-2 h-auto text-left lg:table-cell whitespace-nowrap">
                          {t("priceCatalogSource")}
                        </TableHead>
                        <TableHead className="hidden w-[170px] px-3 py-2 h-auto text-left lg:table-cell whitespace-nowrap">
                          {t("tierRulesThreshold")}
                        </TableHead>
                        <TableHead className="hidden w-[120px] px-3 py-2 h-auto text-left lg:table-cell whitespace-nowrap">
                          {t("priceCatalogMaxInput")} / {t("priceCatalogMaxOutput")}
                        </TableHead>
                        <TableHead className="w-[104px] px-3 py-2 h-auto text-left">
                          {t("priceCatalogEffective")}
                        </TableHead>
                        <TableHead className="w-[230px] px-3 py-2 h-auto text-left">
                          {t("priceCatalogInputOutputPrice")}
                        </TableHead>
                        <TableHead className="w-[230px] px-3 py-2 h-auto text-left">
                          {t("priceCatalogCacheReadWritePrice")}
                        </TableHead>
                        <TableHead className="hidden w-[170px] px-3 py-2 h-auto lg:table-cell text-left">
                          {t("priceCatalogSyncedAt")}
                        </TableHead>
                        <TableHead className="w-14 px-3 py-2 h-auto text-left">
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

                        return (
                          <TableRow
                            key={override.id}
                            className={[
                              "border-b border-divider/60 align-top bg-surface-300/20",
                              recentlySavedModel === override.model ? "bg-amber-500/10" : "",
                            ].join(" ")}
                          >
                            <TableCell className="px-3 py-2">
                              <Checkbox
                                checked={selectedResetModels.includes(override.model)}
                                onCheckedChange={(value) =>
                                  toggleSelectedResetModel(override.model, value === true)
                                }
                                aria-label={t("priceCatalogSelectModel", { model: override.model })}
                              />
                            </TableCell>
                            <TableCell className="px-3 py-2 font-mono">
                              <span className="block whitespace-normal break-words leading-5">
                                {override.model}
                              </span>
                            </TableCell>
                            <TableCell className="hidden px-3 py-2 lg:table-cell whitespace-nowrap">
                              {t("priceCatalogSourceManual")}
                            </TableCell>
                            <TableCell className="hidden px-3 py-2 text-xs text-muted-foreground lg:table-cell whitespace-nowrap">
                              {tierRuleThresholdMap.get(override.model) ?? "-"}
                            </TableCell>
                            <TableCell className="hidden px-3 py-2 text-xs text-muted-foreground lg:table-cell whitespace-nowrap">
                              -
                            </TableCell>
                            <TableCell className="px-3 py-2">
                              <Badge variant="success">{t("priceCatalogEffectiveManual")}</Badge>
                            </TableCell>
                            <TableCell className="px-3 py-2 tabular-nums">
                              <div className="space-y-1">
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
                              </div>
                            </TableCell>
                            <TableCell className="px-3 py-2 tabular-nums">
                              <div className="space-y-1">
                                <div className="grid grid-cols-[24px_auto] items-center justify-start gap-2">
                                  <span className="text-[11px] text-muted-foreground">CR</span>
                                  <div>
                                    <div>
                                      {override.cache_read_input_price_per_million == null
                                        ? "-"
                                        : override.cache_read_input_price_per_million.toFixed(4)}
                                    </div>
                                    {tierPreviewLabel ? (
                                      <div className="text-[11px] text-muted-foreground">
                                        {tierPreviewLabel}:{" "}
                                        {formatPriceNumber(
                                          tierPreview?.cache_read_input_price_per_million ?? null
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="grid grid-cols-[24px_auto] items-center justify-start gap-2">
                                  <span className="text-[11px] text-muted-foreground">CW</span>
                                  <div>
                                    <div>
                                      {override.cache_write_input_price_per_million == null
                                        ? "-"
                                        : override.cache_write_input_price_per_million.toFixed(4)}
                                    </div>
                                    {tierPreviewLabel ? (
                                      <div className="text-[11px] text-muted-foreground">
                                        {tierPreviewLabel}:{" "}
                                        {formatPriceNumber(
                                          tierPreview?.cache_write_input_price_per_million ?? null
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden px-3 py-2 text-xs text-muted-foreground lg:table-cell">
                              {new Date(override.updated_at).toLocaleString(locale)}
                            </TableCell>
                            <TableCell className="px-3 py-2">
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
                                <span className="sr-only">
                                  {override.has_official_price === false
                                    ? t("priceCatalogDeleteManualPrice")
                                    : t("priceCatalogResetToOfficial")}
                                </span>
                              </Button>
                            </TableCell>
                          </TableRow>
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
                          <TableRow
                            key={item.id}
                            className={[
                              "border-b border-divider/60 align-top",
                              recentlySavedModel === item.model ? "bg-amber-500/10" : "",
                            ].join(" ")}
                          >
                            <TableCell className="px-3 py-2">
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
                            <TableCell className="hidden px-3 py-2 lg:table-cell whitespace-nowrap">
                              {item.source}
                            </TableCell>
                            <TableCell className="hidden px-3 py-2 text-xs text-muted-foreground lg:table-cell whitespace-nowrap">
                              {tierRuleThresholdMap.get(item.model) ?? "-"}
                            </TableCell>
                            <TableCell className="hidden px-3 py-2 text-xs text-muted-foreground lg:table-cell whitespace-nowrap">
                              {item.max_input_tokens != null
                                ? item.max_input_tokens.toLocaleString()
                                : "-"}{" "}
                              /{" "}
                              {item.max_output_tokens != null
                                ? item.max_output_tokens.toLocaleString()
                                : "-"}
                            </TableCell>
                            <TableCell className="px-3 py-2">
                              <Badge variant={override ? "success" : "neutral"}>
                                {override
                                  ? t("priceCatalogEffectiveManual")
                                  : t("priceCatalogEffectiveSynced")}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-3 py-2">
                              <div className="space-y-1">
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
                              </div>
                            </TableCell>
                            <TableCell className="px-3 py-2">
                              <div className="space-y-1">
                                <div className="grid grid-cols-[24px_auto] items-start justify-start gap-2">
                                  <span className="pt-0.5 text-[11px] text-muted-foreground">
                                    CR
                                  </span>
                                  <div>
                                    {renderEffectiveNumber({
                                      effectiveValue: effective.cacheRead,
                                      syncedValue: item.cache_read_input_price_per_million,
                                    })}
                                    {tierPreviewLabel ? (
                                      <div className="text-[11px] tabular-nums text-muted-foreground">
                                        {tierPreviewLabel}:{" "}
                                        {formatPriceNumber(
                                          tierPreview?.cache_read_input_price_per_million ?? null
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
                                    {tierPreviewLabel ? (
                                      <div className="text-[11px] tabular-nums text-muted-foreground">
                                        {tierPreviewLabel}:{" "}
                                        {formatPriceNumber(
                                          tierPreview?.cache_write_input_price_per_million ?? null
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden px-3 py-2 text-xs text-muted-foreground lg:table-cell">
                              {new Date(item.synced_at).toLocaleString(locale)}
                            </TableCell>
                            <TableCell className="px-3 py-2">
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
                                  <span className="sr-only">
                                    {t("priceCatalogResetToOfficial")}
                                  </span>
                                </Button>
                              ) : (
                                <span className="sr-only">-</span>
                              )}
                            </TableCell>
                          </TableRow>
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
                        onClick={() => setModelPricePage((prev) => Math.max(1, prev - 1))}
                        disabled={modelPricePage === 1}
                        className="gap-1"
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                        {tCommon("previous")}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setModelPricePage((prev) =>
                            Math.min(modelPrices.data?.total_pages ?? prev, prev + 1)
                          )
                        }
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
            <div>
              <h3 className="type-label-medium text-foreground">{t("tierRulesTitle")}</h3>
              <p className="text-sm text-muted-foreground">{t("tierRulesDesc")}</p>
            </div>
            <TierRulesManager t={t} />
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
