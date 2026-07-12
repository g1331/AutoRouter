import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { useBillingUnresolvedModels } from "@/hooks/use-billing";
import {
  useCreateBillingManualOverride,
  useDeleteBillingManualOverride,
  useBillingManualOverrides,
} from "@/hooks/use-billing";
import type { BillingManualOverride, BillingUnresolvedModel } from "@/types/api";

import { parseOptionalPrice, parseRequiredPrice, type BillingTranslate } from "./billing-format";

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
      <div className="border-t border-divider/70 pt-3">
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

export function UnresolvedModelsSection({
  unresolved,
  t,
  tCommon,
  onOverrideSaved,
}: {
  unresolved: ReturnType<typeof useBillingUnresolvedModels>;
  t: BillingTranslate;
  tCommon: (key: string) => string;
  onOverrideSaved?: (model: string) => void;
}) {
  return (
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
            onOverrideSaved={onOverrideSaved}
          />
        )}
      </CardContent>
    </Card>
  );
}
