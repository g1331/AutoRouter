"use client";

import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Wallet } from "lucide-react";

import { Topbar } from "@/components/admin/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useBillingOverview,
  useBillingUnresolvedModels,
  useBillingManualOverrides,
  useCreateBillingManualOverride,
  useDeleteBillingManualOverride,
  useSyncBillingPrices,
  useBillingModelPrices,
  useRecentBillingDetails,
  useUpstreamBillingMultipliers,
  useUpdateUpstreamBillingMultiplier,
} from "@/hooks/use-billing";
import type {
  BillingModelPrice,
  BillingManualOverride,
  BillingUnresolvedModel,
  UpstreamBillingMultiplier,
} from "@/types/api";

type BillingTranslate = (key: string, values?: Record<string, string | number>) => string;

function useUsdFormatter(locale: string) {
  return useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      }),
    [locale]
  );
}

function parseMultiplierInput(raw: string): number | null {
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0 || value > 100) {
    return null;
  }
  return value;
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

function resolveReasonLabel(reason: string | null, t: BillingTranslate): string {
  if (!reason) {
    return "-";
  }
  if (reason === "model_missing") return t("reasonModelMissing");
  if (reason === "usage_missing") return t("reasonUsageMissing");
  if (reason === "price_not_found") return t("reasonPriceNotFound");
  if (reason === "calculation_error") return t("reasonCalculationError");
  return reason;
}

function getSyncBadgeVariant(status: string | null): "success" | "warning" | "error" | "neutral" {
  if (!status) return "neutral";
  if (status === "success") return "success";
  if (status === "partial") return "warning";
  if (status === "failed") return "error";
  return "neutral";
}

function UpstreamMultiplierTable({
  rows,
  onSave,
  pendingId,
  t,
}: {
  rows: UpstreamBillingMultiplier[];
  onSave: (row: UpstreamBillingMultiplier, inputRaw: string, outputRaw: string) => void;
  pendingId: string | null;
  t: BillingTranslate;
}) {
  const [drafts, setDrafts] = useState<Record<string, { input: string; output: string }>>({});

  const getDraft = (row: UpstreamBillingMultiplier) => {
    return (
      drafts[row.id] ?? {
        input: String(row.input_multiplier),
        output: String(row.output_multiplier),
      }
    );
  };

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("unresolvedEmpty")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-divider text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2">{t("overrideModel")}</th>
            <th className="px-3 py-2">{t("multiplierInput")}</th>
            <th className="px-3 py-2">{t("multiplierOutput")}</th>
            <th className="px-3 py-2 text-right">{t("tableAction")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const draft = getDraft(row);
            const inputMultiplier = parseMultiplierInput(draft.input);
            const outputMultiplier = parseMultiplierInput(draft.output);
            const invalid = inputMultiplier === null || outputMultiplier === null;

            return (
              <tr key={row.id} className="border-b border-divider/60">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{row.name}</span>
                    {!row.is_active && <Badge variant="neutral">{t("statusInactive")}</Badge>}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={draft.input}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [row.id]: { ...getDraft(row), input: event.target.value },
                      }))
                    }
                    className={cn("h-9", inputMultiplier === null && "border-status-error")}
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={draft.output}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [row.id]: { ...getDraft(row), output: event.target.value },
                      }))
                    }
                    className={cn("h-9", outputMultiplier === null && "border-status-error")}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    onClick={() => onSave(row, draft.input, draft.output)}
                    disabled={invalid || pendingId === row.id}
                  >
                    {pendingId === row.id ? t("saving") : t("save")}
                  </Button>
                  {invalid && (
                    <p className="mt-1 text-xs text-status-error">{t("multiplierInvalid")}</p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function UnresolvedRepairTable({
  rows,
  t,
}: {
  rows: BillingUnresolvedModel[];
  t: BillingTranslate;
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
              {existingOverride && <Badge variant="success">{t("statusBilled")}</Badge>}
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
  const locale = useLocale();
  const usd = useUsdFormatter(locale);

  const overview = useBillingOverview();
  const unresolved = useBillingUnresolvedModels();
  const multipliers = useUpstreamBillingMultipliers();
  const [modelPriceQuery, setModelPriceQuery] = useState("");
  const modelPrices = useBillingModelPrices(1, 50, modelPriceQuery);
  const recent = useRecentBillingDetails(1, 20);
  const syncPrices = useSyncBillingPrices();
  const updateMultiplier = useUpdateUpstreamBillingMultiplier();
  const [savingMultiplierId, setSavingMultiplierId] = useState<string | null>(null);

  const latestSync = overview.data?.latest_sync ?? null;
  const latestSyncText = latestSync
    ? latestSync.status === "success"
      ? t("syncSuccess", { source: latestSync.source ?? "-" })
      : latestSync.status === "partial"
        ? t("syncPartial", { source: latestSync.source ?? "-" })
        : t("syncFailed")
    : t("syncNever");

  const handleSaveMultiplier = async (
    row: UpstreamBillingMultiplier,
    inputRaw: string,
    outputRaw: string
  ) => {
    const input = parseMultiplierInput(inputRaw);
    const output = parseMultiplierInput(outputRaw);
    if (input === null || output === null) {
      return;
    }

    setSavingMultiplierId(row.id);
    try {
      await updateMultiplier.mutateAsync({
        id: row.id,
        data: {
          input_multiplier: input,
          output_multiplier: output,
        },
      });
    } finally {
      setSavingMultiplierId(null);
    }
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
              {syncPrices.isPending ? "Syncing..." : t("syncNow")}
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
              <h3 className="type-label-medium text-foreground">{t("multiplierTitle")}</h3>
              <p className="text-sm text-muted-foreground">{t("multiplierDesc")}</p>
            </div>
            {multipliers.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : multipliers.isError ? (
              <p className="text-sm text-status-error">{String(multipliers.error)}</p>
            ) : (
              <UpstreamMultiplierTable
                rows={multipliers.data?.items ?? []}
                onSave={handleSaveMultiplier}
                pendingId={savingMultiplierId}
                t={t}
              />
            )}
          </CardContent>
        </Card>

        <Card variant="outlined" className="border-divider bg-surface-200/70">
          <CardContent className="space-y-3 p-5 sm:p-6">
            <div>
              <h3 className="type-label-medium text-foreground">{t("unresolvedTitle")}</h3>
              <p className="text-sm text-muted-foreground">{t("unresolvedDesc")}</p>
            </div>
            {unresolved.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : unresolved.isError ? (
              <p className="text-sm text-status-error">{String(unresolved.error)}</p>
            ) : (
              <UnresolvedRepairTable rows={unresolved.data?.items ?? []} t={t} />
            )}
          </CardContent>
        </Card>

        <Card variant="outlined" className="border-divider bg-surface-200/70">
          <CardContent className="space-y-3 p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="type-label-medium text-foreground">{t("priceCatalogTitle")}</h3>
                <p className="text-sm text-muted-foreground">{t("priceCatalogDesc")}</p>
              </div>
              <div className="w-full sm:w-80">
                <Input
                  value={modelPriceQuery}
                  onChange={(event) => setModelPriceQuery(event.target.value)}
                  placeholder={t("priceCatalogSearchPlaceholder")}
                />
              </div>
            </div>
            {modelPrices.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : modelPrices.isError ? (
              <p className="text-sm text-status-error">{String(modelPrices.error)}</p>
            ) : (modelPrices.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">{t("priceCatalogEmpty")}</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {t("priceCatalogShowing", {
                    current: modelPrices.data?.items.length ?? 0,
                    total: modelPrices.data?.total ?? 0,
                  })}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1200px] text-sm">
                    <thead>
                      <tr className="border-b border-divider text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2">{t("priceCatalogModel")}</th>
                        <th className="px-3 py-2">{t("priceCatalogSource")}</th>
                        <th className="px-3 py-2">{t("priceCatalogInputPrice")}</th>
                        <th className="px-3 py-2">{t("priceCatalogOutputPrice")}</th>
                        <th className="px-3 py-2">{t("priceCatalogCacheReadPrice")}</th>
                        <th className="px-3 py-2">{t("priceCatalogCacheWritePrice")}</th>
                        <th className="px-3 py-2">{t("priceCatalogSyncedAt")}</th>
                        <th className="px-3 py-2">{t("priceCatalogStatus")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modelPrices.data?.items.map((item: BillingModelPrice) => (
                        <tr key={item.id} className="border-b border-divider/60">
                          <td className="px-3 py-2 font-mono">{item.model}</td>
                          <td className="px-3 py-2">{item.source}</td>
                          <td className="px-3 py-2 tabular-nums">
                            {item.input_price_per_million.toFixed(4)}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {item.output_price_per_million.toFixed(4)}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {item.cache_read_input_price_per_million == null
                              ? "-"
                              : item.cache_read_input_price_per_million.toFixed(4)}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {item.cache_write_input_price_per_million == null
                              ? "-"
                              : item.cache_write_input_price_per_million.toFixed(4)}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {new Date(item.synced_at).toLocaleString(locale)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant={item.is_active ? "success" : "neutral"}>
                              {item.is_active ? t("statusActive") : t("statusInactive")}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card variant="outlined" className="border-divider bg-surface-200/70">
          <CardContent className="space-y-3 p-5 sm:p-6">
            <div>
              <h3 className="type-label-medium text-foreground">{t("recentTitle")}</h3>
              <p className="text-sm text-muted-foreground">{t("recentDesc")}</p>
            </div>
            {recent.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : recent.isError ? (
              <p className="text-sm text-status-error">{String(recent.error)}</p>
            ) : (recent.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">{t("recentEmpty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1200px] text-sm">
                  <thead>
                    <tr className="border-b border-divider text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2">{t("recentTime")}</th>
                      <th className="px-3 py-2">{t("recentModel")}</th>
                      <th className="px-3 py-2">{t("recentUpstream")}</th>
                      <th className="px-3 py-2">{t("recentTokens")}</th>
                      <th className="px-3 py-2">{t("recentCacheTokens")}</th>
                      <th className="px-3 py-2">{t("recentBasePrice")}</th>
                      <th className="px-3 py-2">{t("recentMultiplier")}</th>
                      <th className="px-3 py-2">{t("recentCacheCost")}</th>
                      <th className="px-3 py-2">{t("recentFinalCost")}</th>
                      <th className="px-3 py-2">{t("recentSource")}</th>
                      <th className="px-3 py-2">{t("recentStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.data?.items.map((item) => (
                      <tr key={item.request_log_id} className="border-b border-divider/60">
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {new Date(item.created_at).toLocaleString(locale)}
                        </td>
                        <td className="px-3 py-2 font-mono">{item.model ?? "-"}</td>
                        <td className="px-3 py-2">{item.upstream_name ?? "-"}</td>
                        <td className="px-3 py-2 tabular-nums">{item.total_tokens}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {item.cache_read_tokens} / {item.cache_write_tokens}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {item.base_input_price_per_million == null ||
                          item.base_output_price_per_million == null
                            ? "-"
                            : `${item.base_input_price_per_million.toFixed(4)} / ${item.base_output_price_per_million.toFixed(4)}`}
                          {(item.base_cache_read_input_price_per_million != null ||
                            item.base_cache_write_input_price_per_million != null) && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {item.base_cache_read_input_price_per_million == null
                                ? "-"
                                : item.base_cache_read_input_price_per_million.toFixed(4)}{" "}
                              /{" "}
                              {item.base_cache_write_input_price_per_million == null
                                ? "-"
                                : item.base_cache_write_input_price_per_million.toFixed(4)}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {item.input_multiplier == null || item.output_multiplier == null
                            ? "-"
                            : `${item.input_multiplier.toFixed(2)} / ${item.output_multiplier.toFixed(2)}`}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {item.cache_read_cost == null && item.cache_write_cost == null
                            ? "-"
                            : `${item.cache_read_cost == null ? "-" : usd.format(item.cache_read_cost)} / ${item.cache_write_cost == null ? "-" : usd.format(item.cache_write_cost)}`}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {item.final_cost == null ? "-" : usd.format(item.final_cost)}
                        </td>
                        <td className="px-3 py-2">{item.price_source ?? "-"}</td>
                        <td className="px-3 py-2">
                          <Badge variant={item.billing_status === "billed" ? "success" : "warning"}>
                            {item.billing_status === "billed"
                              ? t("statusBilled")
                              : t("statusUnbilled")}
                          </Badge>
                          {item.billing_status === "unbilled" && (
                            <p className="mt-1 text-xs text-status-warning">
                              {resolveReasonLabel(item.unbillable_reason, t)}
                            </p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
