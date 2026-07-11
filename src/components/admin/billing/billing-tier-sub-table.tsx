import { Check, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { useDeleteBillingTierRule, useUpdateBillingTierRule } from "@/hooks/use-billing";
import { cn } from "@/lib/utils";
import type { BillingTierRule } from "@/types/api";

import { formatPriceNumber, type BillingTranslate } from "./billing-format";
import type { BillingPriceRowEditApi } from "./use-billing-price-row-edit";

/**
 * 桌面视图下某个模型展开后的阶梯规则子表（阈值 / 来源 / IN·OUT·CR·CW / 启用 / 删除）。
 * 抽出前该子表在 override 行、synced 行、tier-only 行三处逐字重复；差异仅是模型标识，
 * 由 `model` prop 统一。
 */
export function BillingTierSubTable({
  model,
  modelTierRules,
  edit,
  updateTierRule,
  deleteTierRule,
  t,
}: {
  model: string;
  modelTierRules: BillingTierRule[];
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
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {t("tierRulesTitle")} ({modelTierRules.length})
      </p>
      <Table
        className="w-full text-xs"
        frame="none"
        containerClassName="rounded-none border-0 bg-transparent"
      >
        <TableHeader>
          <TableRow className="border-b border-divider/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground hover:bg-transparent">
            <TableHead className="px-2 py-1 h-auto">{t("tierRulesThreshold")}</TableHead>
            <TableHead className="px-2 py-1 h-auto">{t("tierRulesSource")}</TableHead>
            <TableHead className="px-2 py-1 h-auto">IN</TableHead>
            <TableHead className="px-2 py-1 h-auto">OUT</TableHead>
            <TableHead className="px-2 py-1 h-auto">CR</TableHead>
            <TableHead className="px-2 py-1 h-auto">CW</TableHead>
            <TableHead className="px-2 py-1 h-auto">{t("tierRulesActive")}</TableHead>
            <TableHead className="w-10 px-2 py-1 h-auto" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {modelTierRules.map((rule) => {
            const isTierEditing =
              rule.source === "manual"
                ? isEditingTierRule(rule.id)
                : isEditingTierOverride(model, rule.threshold_input_tokens);
            return (
              <TableRow
                key={rule.id}
                className={cn("border-b border-divider/30", !rule.is_active && "opacity-50")}
              >
                <TableCell className="px-2 py-1.5 tabular-nums">
                  {t("tierRulesThresholdTokens", {
                    count: rule.threshold_input_tokens / 1000,
                  })}
                </TableCell>
                <TableCell className="px-2 py-1.5">
                  <Badge variant={rule.source === "manual" ? "success" : "neutral"}>
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
                        onChange={(e) => setDraftField("input", e.target.value)}
                        className="h-6 w-20 text-xs tabular-nums"
                        onKeyDown={editKeyDown}
                      />
                    </TableCell>
                    <TableCell className="px-2 py-1.5">
                      <Input
                        value={editDraft.output}
                        onChange={(e) => setDraftField("output", e.target.value)}
                        className="h-6 w-20 text-xs tabular-nums"
                        onKeyDown={editKeyDown}
                      />
                    </TableCell>
                    <TableCell className="px-2 py-1.5">
                      <Input
                        value={editDraft.cacheRead}
                        onChange={(e) => setDraftField("cacheRead", e.target.value)}
                        className="h-6 w-20 text-xs tabular-nums"
                        onKeyDown={editKeyDown}
                      />
                    </TableCell>
                    <TableCell className="px-2 py-1.5">
                      <Input
                        value={editDraft.cacheWrite}
                        onChange={(e) => setDraftField("cacheWrite", e.target.value)}
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
                          className="h-6 w-6 text-status-success hover:text-status-success/80"
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
                      {formatPriceNumber(rule.input_price_per_million)}
                    </TableCell>
                    <TableCell
                      className="px-2 py-1.5 tabular-nums cursor-pointer hover:bg-surface-300/40 transition-colors"
                      onClick={() =>
                        rule.source === "manual"
                          ? startEditingTierRule(rule)
                          : startEditingTierOverride(model, rule)
                      }
                    >
                      {formatPriceNumber(rule.output_price_per_million)}
                    </TableCell>
                    <TableCell
                      className="px-2 py-1.5 tabular-nums cursor-pointer hover:bg-surface-300/40 transition-colors"
                      onClick={() =>
                        rule.source === "manual"
                          ? startEditingTierRule(rule)
                          : startEditingTierOverride(model, rule)
                      }
                    >
                      {formatPriceNumber(rule.cache_read_input_price_per_million)}
                    </TableCell>
                    <TableCell
                      className="px-2 py-1.5 tabular-nums cursor-pointer hover:bg-surface-300/40 transition-colors"
                      onClick={() =>
                        rule.source === "manual"
                          ? startEditingTierRule(rule)
                          : startEditingTierOverride(model, rule)
                      }
                    >
                      {formatPriceNumber(rule.cache_write_input_price_per_million)}
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
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="px-2 py-1.5">
                      {rule.source === "manual" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => deleteTierRule.mutate(rule.id)}
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
  );
}
