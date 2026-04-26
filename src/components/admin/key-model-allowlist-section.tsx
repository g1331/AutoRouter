"use client";

import { useMemo, useState } from "react";
import { ArrowDownToLine, Plus, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { normalizeApiKeyAllowedModels } from "@/lib/api-key-models";

interface KeyModelAllowlistSectionProps {
  value: string[];
  candidates: string[];
  onChange: (models: string[]) => void;
}

function mergeModels(current: string[], additions: string[]): string[] {
  return normalizeApiKeyAllowedModels([...current, ...additions]) ?? [];
}

export function KeyModelAllowlistSection({
  value,
  candidates,
  onChange,
}: KeyModelAllowlistSectionProps) {
  const t = useTranslations("keys");
  const [draft, setDraft] = useState("");
  const [candidateSearchQuery, setCandidateSearchQuery] = useState("");
  const [currentModelSearchQuery, setCurrentModelSearchQuery] = useState("");
  const [selectedCandidateModels, setSelectedCandidateModels] = useState<string[]>([]);
  const [selectedCurrentModels, setSelectedCurrentModels] = useState<string[]>([]);
  const modelSet = useMemo(() => new Set(value), [value]);
  const availableCandidates = useMemo(
    () => candidates.filter((model) => !modelSet.has(model)),
    [candidates, modelSet]
  );
  const normalizedCandidateSearchQuery = candidateSearchQuery.trim().toLowerCase();
  const normalizedCurrentModelSearchQuery = currentModelSearchQuery.trim().toLowerCase();
  const filteredCandidates = useMemo(
    () =>
      availableCandidates.filter(
        (model) =>
          !normalizedCandidateSearchQuery ||
          model.toLowerCase().includes(normalizedCandidateSearchQuery)
      ),
    [availableCandidates, normalizedCandidateSearchQuery]
  );
  const filteredCurrentModels = useMemo(
    () =>
      value.filter(
        (model) =>
          !normalizedCurrentModelSearchQuery ||
          model.toLowerCase().includes(normalizedCurrentModelSearchQuery)
      ),
    [normalizedCurrentModelSearchQuery, value]
  );
  const selectedAvailableCandidates = selectedCandidateModels.filter((model) =>
    availableCandidates.includes(model)
  );
  const selectedExistingModels = selectedCurrentModels.filter((model) => value.includes(model));
  const selectedVisibleCandidateCount = filteredCandidates.filter((model) =>
    selectedAvailableCandidates.includes(model)
  ).length;
  const selectedVisibleCurrentCount = filteredCurrentModels.filter((model) =>
    selectedExistingModels.includes(model)
  ).length;

  const addDraftModels = () => {
    const draftModels = draft
      .split(/[\n,]/)
      .map((model) => model.trim())
      .filter((model) => model.length > 0);

    if (draftModels.length === 0) {
      return;
    }

    onChange(mergeModels(value, draftModels));
    setDraft("");
  };

  const importSelectedCandidates = () => {
    if (selectedAvailableCandidates.length === 0) {
      return;
    }

    onChange(mergeModels(value, selectedAvailableCandidates));
    setSelectedCandidateModels([]);
  };

  const selectVisibleCandidates = () => {
    if (filteredCandidates.length === 0) {
      return;
    }

    setSelectedCandidateModels((current) => [...new Set([...current, ...filteredCandidates])]);
  };

  const selectVisibleCurrentModels = () => {
    if (filteredCurrentModels.length === 0) {
      return;
    }

    setSelectedCurrentModels((current) => [...new Set([...current, ...filteredCurrentModels])]);
  };

  const toggleCandidate = (model: string, checked: boolean) => {
    setSelectedCandidateModels((current) => {
      if (checked) {
        return current.includes(model) ? current : [...current, model];
      }

      return current.filter((item) => item !== model);
    });
  };

  const toggleCurrentModel = (model: string, checked: boolean) => {
    setSelectedCurrentModels((current) => {
      if (checked) {
        return current.includes(model) ? current : [...current, model];
      }

      return current.filter((item) => item !== model);
    });
  };

  const removeModel = (model: string) => {
    onChange(value.filter((item) => item !== model));
    setSelectedCurrentModels((current) => current.filter((item) => item !== model));
  };

  const removeSelectedCurrentModels = () => {
    if (selectedExistingModels.length === 0) {
      return;
    }

    const selectedModelSet = new Set(selectedExistingModels);
    onChange(value.filter((model) => !selectedModelSet.has(model)));
    setSelectedCurrentModels([]);
  };

  return (
    <div className="space-y-3 rounded-[var(--shape-corner-medium)] border border-[rgb(var(--md-sys-color-outline-variant))] bg-[rgb(var(--md-sys-color-surface-container-low))] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="type-body-medium text-[rgb(var(--md-sys-color-on-surface))]">
            {t("allowedModels")}
          </p>
          <p className="type-body-small text-[rgb(var(--md-sys-color-on-surface-variant))]">
            {t("allowedModelsDesc")}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant={value.length > 0 ? "info" : "neutral"}>
          {value.length > 0
            ? t("allowedModelsLimited", { count: value.length })
            : t("allowedModelsOpen")}
        </Badge>
        <span>{t("modelCandidatesSummary", { count: candidates.length })}</span>
        {availableCandidates.length > 0 ? (
          <span>{t("newModelCandidatesSummary", { count: availableCandidates.length })}</span>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={candidateSearchQuery}
              onChange={(event) => setCandidateSearchQuery(event.target.value)}
              placeholder={t("searchModelCandidates")}
              className="pl-9"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 px-2 text-xs"
            onClick={selectVisibleCandidates}
            disabled={filteredCandidates.length === 0}
          >
            {t("selectVisibleModelCandidates")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 px-2 text-xs"
            onClick={() => setSelectedCandidateModels([])}
            disabled={selectedAvailableCandidates.length === 0}
          >
            {t("clearModelCandidateSelection")}
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {t("modelCandidateSelectionSummary", {
              selected: selectedAvailableCandidates.length,
              visible: selectedVisibleCandidateCount,
              total: availableCandidates.length,
            })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={importSelectedCandidates}
            disabled={selectedAvailableCandidates.length === 0}
          >
            <ArrowDownToLine className="h-4 w-4" />
            {t("importSelectedModelCandidates", { count: selectedAvailableCandidates.length })}
          </Button>
        </div>

        {availableCandidates.length === 0 ? (
          <div className="rounded-cf-sm border border-dashed border-divider p-3 text-sm text-muted-foreground">
            {candidates.length === 0 ? t("modelCandidatesEmpty") : t("allModelCandidatesImported")}
          </div>
        ) : filteredCandidates.length === 0 ? (
          <div className="rounded-cf-sm border border-dashed border-divider p-3 text-sm text-muted-foreground">
            {t("noMatchingModelCandidates")}
          </div>
        ) : (
          <div className="max-h-40 overflow-auto rounded-cf-sm border border-divider/70">
            <div className="divide-y divide-divider/70">
              {filteredCandidates.map((model) => {
                const checked = selectedAvailableCandidates.includes(model);
                return (
                  <label
                    key={model}
                    className="flex cursor-pointer items-center gap-3 px-2.5 py-2.5 transition-colors hover:bg-surface-200/55"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(nextChecked) =>
                        toggleCandidate(model, nextChecked === true)
                      }
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
                      {model}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addDraftModels();
            }
          }}
          placeholder={t("allowedModelsPlaceholder")}
        />
        <Button type="button" variant="outline" className="gap-2" onClick={addDraftModels}>
          <Plus className="h-4 w-4" />
          {t("addAllowedModel")}
        </Button>
      </div>

      {value.length > 0 ? (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={currentModelSearchQuery}
                onChange={(event) => setCurrentModelSearchQuery(event.target.value)}
                placeholder={t("searchAllowedModels")}
                className="pl-9"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 px-2 text-xs"
              onClick={selectVisibleCurrentModels}
              disabled={filteredCurrentModels.length === 0}
            >
              {t("selectVisibleAllowedModels")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 px-2 text-xs"
              onClick={() => setSelectedCurrentModels([])}
              disabled={selectedExistingModels.length === 0}
            >
              {t("clearAllowedModelSelection")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-2 px-2 text-xs text-status-error hover:bg-status-error-muted"
              onClick={removeSelectedCurrentModels}
              disabled={selectedExistingModels.length === 0}
            >
              <X className="h-4 w-4" />
              {t("removeSelectedAllowedModels", { count: selectedExistingModels.length })}
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            {t("allowedModelSelectionSummary", {
              selected: selectedExistingModels.length,
              visible: selectedVisibleCurrentCount,
              total: value.length,
            })}
          </div>

          {filteredCurrentModels.length === 0 ? (
            <div className="rounded-cf-sm border border-dashed border-divider p-3 text-sm text-muted-foreground">
              {t("noMatchingAllowedModels")}
            </div>
          ) : (
            <div className="max-h-40 overflow-auto rounded-cf-sm border border-divider/70">
              <div className="divide-y divide-divider/70">
                {filteredCurrentModels.map((model) => {
                  const checked = selectedExistingModels.includes(model);
                  return (
                    <label
                      key={model}
                      className="flex cursor-pointer items-center gap-3 px-2.5 py-2.5 transition-colors hover:bg-surface-200/55"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(nextChecked) =>
                          toggleCurrentModel(model, nextChecked === true)
                        }
                      />
                      <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
                        {model}
                      </span>
                      <button
                        type="button"
                        className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={(event) => {
                          event.preventDefault();
                          removeModel(model);
                        }}
                        aria-label={t("removeAllowedModel", { model })}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="type-body-small text-[rgb(var(--md-sys-color-on-surface-variant))]">
          {t("allowedModelsEmpty")}
        </p>
      )}
    </div>
  );
}
