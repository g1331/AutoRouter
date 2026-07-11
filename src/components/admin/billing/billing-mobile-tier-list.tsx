import { Check, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { useDeleteBillingTierRule, useUpdateBillingTierRule } from "@/hooks/use-billing";
import { cn } from "@/lib/utils";
import type { BillingTierRule } from "@/types/api";

import { formatPriceNumber, type BillingTranslate } from "./billing-format";
import { ExpandChevron } from "./expand-chevron";
import type { BillingPriceRowEditApi } from "./use-billing-price-row-edit";

/**
 * 移动端某模型的可折叠阶梯列表。抽出前在 override 卡、synced 卡、tier-only 卡三处重复。
 * `wrapperClassName` 保留原本 override/tier-only 外层的 `mt-2` 与 synced 外层无类名的差异。
 * 阶梯编辑输入统一绑定 `onKeyDown`（Enter 保存 / Escape 取消）—— 该 handler 不进入渲染 DOM，
 * 仅为 override/synced 卡补齐与 tier-only 卡一致的键盘行为。
 */
export function BillingMobileTierList({
  model,
  modelTiers,
  isOpen,
  onToggle,
  wrapperClassName,
  edit,
  updateTierRule,
  deleteTierRule,
  t,
}: {
  model: string;
  modelTiers: BillingTierRule[];
  isOpen: boolean;
  onToggle: () => void;
  wrapperClassName?: string;
  edit: BillingPriceRowEditApi;
  updateTierRule: ReturnType<typeof useUpdateBillingTierRule>;
  deleteTierRule: ReturnType<typeof useDeleteBillingTierRule>;
  t: BillingTranslate;
}) {
  const {
    editDraft,
    setDraftField,
    saveEdit,
    cancelEditing,
    editKeyDown,
    editIsSaving,
    isEditingTierRule,
    isEditingTierOverride,
    startEditingTierRule,
    startEditingTierOverride,
  } = edit;

  return (
    <div className={wrapperClassName}>
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={onToggle}
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
                className="space-y-2 border-t border-divider/60 pt-2 text-xs"
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
                        onChange={(e) => setDraftField(field, e.target.value)}
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
                  <Button variant="ghost" size="sm" className="h-6 gap-1" onClick={cancelEditing}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <div
                key={rule.id}
                className={cn(
                  "flex cursor-pointer items-center justify-between border-t border-divider/60 px-1 py-2 text-xs transition-colors hover:bg-surface-300/30",
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
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Badge variant={rule.source === "manual" ? "success" : "neutral"}>
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
}
