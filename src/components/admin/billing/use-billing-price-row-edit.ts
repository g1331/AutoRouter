import { useState } from "react";

import type {
  useCreateBillingManualOverride,
  useUpdateBillingManualOverride,
  useCreateBillingTierRule,
  useUpdateBillingTierRule,
} from "@/hooks/use-billing";
import type { BillingManualOverride, BillingModelPrice, BillingTierRule } from "@/types/api";

import { parseOptionalPrice, parseRequiredPrice, type EditTarget } from "./billing-format";

interface UseBillingPriceRowEditParams {
  manualOverrideMap: Map<string, BillingManualOverride>;
  priceCatalogSyncedItems: BillingModelPrice[];
  allTierRulesMap: Map<string, BillingTierRule[]>;
  updateOverride: ReturnType<typeof useUpdateBillingManualOverride>;
  createInlineOverride: ReturnType<typeof useCreateBillingManualOverride>;
  updateTierRule: ReturnType<typeof useUpdateBillingTierRule>;
  createTierRule: ReturnType<typeof useCreateBillingTierRule>;
  setRecentlySavedModel: (model: string) => void;
}

/**
 * 统一四路重复的价目行内联编辑逻辑：编辑目标（整价 override / 手动阶梯规则 / 阶梯覆盖）、
 * 草稿状态、保存 / 取消 / 校验与「正在编辑」判定。抽出前这套状态机内联在 billing 页面，
 * 桌面表格行、移动卡片、阶梯子表都各自消费它 —— 现在统一由本 hook 提供。
 */
export function useBillingPriceRowEdit({
  manualOverrideMap,
  priceCatalogSyncedItems,
  allTierRulesMap,
  updateOverride,
  createInlineOverride,
  updateTierRule,
  createTierRule,
  setRecentlySavedModel,
}: UseBillingPriceRowEditParams) {
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [editDraft, setEditDraft] = useState({
    input: "",
    output: "",
    cacheRead: "",
    cacheWrite: "",
    note: "",
  });

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

  return {
    editTarget,
    setEditTarget,
    editDraft,
    setDraftField,
    cancelEditing,
    editKeyDown,
    startEditingPrice,
    startEditingTierRule,
    startEditingTierOverride,
    saveEdit,
    isEditingPrice,
    isEditingTierRule,
    isEditingTierOverride,
    editIsSaving,
  };
}

export type BillingPriceRowEditApi = ReturnType<typeof useBillingPriceRowEdit>;
