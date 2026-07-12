import { Fragment } from "react";
import { Check, RotateCcw, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import type {
  useDeleteBillingTierRule,
  useResetBillingManualOverrides,
  useUpdateBillingTierRule,
} from "@/hooks/use-billing";
import { cn } from "@/lib/utils";
import type { BillingManualOverride, BillingModelPrice, BillingTierRule } from "@/types/api";

import { formatPriceNumber, PRICE_FIELDS_SHORT, type BillingTranslate } from "./billing-format";
import { BillingTierSubTable } from "./billing-tier-sub-table";
import { ExpandChevron } from "./expand-chevron";
import type { BillingPriceRowEditApi } from "./use-billing-price-row-edit";

/**
 * 桌面表格里的 synced（同步价目）价目行，渲染显示态与内联编辑态，展开后接 `BillingTierSubTable`。
 * 这是价目目录中最核心、也是 `billing-tier-flow.spec` 直接断言的行路径（gpt-4.1）。
 */
export function BillingPriceRow({
  item,
  manualOverrideMap,
  tierRulePreviewMap,
  tierRuleThresholdMap,
  allTierRulesMap,
  selectedResetModels,
  toggleSelectedResetModel,
  recentlySavedModel,
  expandedPriceRows,
  togglePriceRow,
  openResetDialog,
  resetOverrides,
  edit,
  updateTierRule,
  deleteTierRule,
  t,
  locale,
}: {
  item: BillingModelPrice;
  manualOverrideMap: Map<string, BillingManualOverride>;
  tierRulePreviewMap: Map<string, BillingTierRule>;
  tierRuleThresholdMap: Map<string, string>;
  allTierRulesMap: Map<string, BillingTierRule[]>;
  selectedResetModels: string[];
  toggleSelectedResetModel: (model: string, next: boolean) => void;
  recentlySavedModel: string | null;
  expandedPriceRows: Set<string>;
  togglePriceRow: (model: string) => void;
  openResetDialog: (models: string[], source?: HTMLElement | null) => void;
  resetOverrides: ReturnType<typeof useResetBillingManualOverrides>;
  edit: BillingPriceRowEditApi;
  updateTierRule: ReturnType<typeof useUpdateBillingTierRule>;
  deleteTierRule: ReturnType<typeof useDeleteBillingTierRule>;
  t: BillingTranslate;
  locale: string;
}) {
  const {
    editDraft,
    setDraftField,
    saveEdit,
    cancelEditing,
    editKeyDown,
    editIsSaving,
    isEditingPrice,
    startEditingPrice,
  } = edit;

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
      return <span className="tabular-nums">{effectiveValue.toFixed(4)}</span>;
    }

    const syncedLabel = syncedValue == null ? "-" : (syncedValue as number).toFixed(4);
    return (
      <div className="space-y-0.5">
        <div className="tabular-nums font-medium text-foreground">{effectiveValue.toFixed(4)}</div>
        <div className="text-[11px] tabular-nums text-muted-foreground">litellm: {syncedLabel}</div>
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
              onCheckedChange={(value) => toggleSelectedResetModel(item.model, value === true)}
              aria-label={t("priceCatalogSelectModel", {
                model: item.model,
              })}
            />
          ) : (
            <span className="sr-only">-</span>
          )}
        </TableCell>
        <TableCell className="px-3 py-2 font-mono">
          <span className="block whitespace-normal break-words leading-5">{item.model}</span>
        </TableCell>
        <TableCell className="px-3 py-2 whitespace-nowrap">
          <div className="space-y-1">
            <Badge variant={override ? "success" : "neutral"}>
              {override ? t("priceCatalogEffectiveManual") : t("priceCatalogEffectiveSynced")}
            </Badge>
            <p className="text-[11px] text-muted-foreground">{item.source}</p>
          </div>
        </TableCell>
        <TableCell className="hidden px-3 py-2 text-xs text-muted-foreground lg:table-cell">
          <div className="space-y-1">
            <div>{tierRuleThresholdMap.get(item.model) ?? "-"}</div>
            <div>
              {item.max_input_tokens != null ? item.max_input_tokens.toLocaleString() : "-"} /{" "}
              {item.max_output_tokens != null ? item.max_output_tokens.toLocaleString() : "-"}
            </div>
          </div>
        </TableCell>
        {isEditingPrice(item.model) ? (
          <>
            <TableCell className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {PRICE_FIELDS_SHORT.map(([field, label]) => (
                    <div key={field} className="grid grid-cols-[24px_auto] items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">{label}</span>
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
                  <span className="text-[11px] text-muted-foreground">{t("overrideNote")}</span>
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
            <TableCell className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-status-success hover:text-status-success/80"
                  onClick={() => void saveEdit()}
                  disabled={editIsSaving}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={cancelEditing}>
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
                  <span className="pt-0.5 text-[11px] text-muted-foreground">IN</span>
                  <div>
                    {renderEffectiveNumber({
                      effectiveValue: effective.input,
                      syncedValue: item.input_price_per_million,
                    })}
                    {tierPreviewLabel ? (
                      <div className="text-[11px] tabular-nums text-muted-foreground">
                        {tierPreviewLabel}:{" "}
                        {formatPriceNumber(tierPreview?.input_price_per_million ?? null)}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="grid grid-cols-[24px_auto] items-start justify-start gap-2">
                  <span className="pt-0.5 text-[11px] text-muted-foreground">CR</span>
                  <div>
                    {renderEffectiveNumber({
                      effectiveValue: effective.cacheRead,
                      syncedValue: item.cache_read_input_price_per_million,
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-[24px_auto] items-start justify-start gap-2">
                  <span className="pt-0.5 text-[11px] text-muted-foreground">OUT</span>
                  <div>
                    {renderEffectiveNumber({
                      effectiveValue: effective.output,
                      syncedValue: item.output_price_per_million,
                    })}
                    {tierPreviewLabel ? (
                      <div className="text-[11px] tabular-nums text-muted-foreground">
                        {tierPreviewLabel}:{" "}
                        {formatPriceNumber(tierPreview?.output_price_per_million ?? null)}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="grid grid-cols-[24px_auto] items-start justify-start gap-2">
                  <span className="pt-0.5 text-[11px] text-muted-foreground">CW</span>
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
            <TableCell className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-1">
                {override ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(event) => openResetDialog([item.model], event.currentTarget)}
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
                    className="flex h-8 w-8 items-center justify-center rounded-cf-sm hover:bg-surface-300/60"
                    onClick={() => togglePriceRow(item.model)}
                    title={t(isExpanded ? "priceCatalogCollapseTiers" : "priceCatalogExpandTiers")}
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
                  model={item.model}
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
}
