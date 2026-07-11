"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowDownToLine,
  CheckCircle2,
  CircleAlert,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { z } from "zod";

import { SectionForm } from "@/components/admin/section-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { usePreviewUpstreamCatalog, useUpdateUpstreamSection } from "@/hooks/use-upstreams";
import { statusTone } from "@/lib/status-tone";
import { cn } from "@/lib/utils";
import type {
  Upstream,
  UpstreamModelDiscoveryMode,
  UpstreamModelCatalogSource,
  UpstreamModelRuleType,
} from "@/types/api";

import {
  applyCatalogPreviewToUpstream,
  areCatalogWorkspaceStatesEqual,
  buildCatalogWorkspaceState,
  formatCatalogTimestamp,
  getRuleSourceBadgeVariant,
  importCatalogModelsIntoRules,
  resolveDiscoveryPreview,
  type CatalogSourceFilter,
} from "../catalog-workspace";
import { createEmptyModelRule, modelRoutingDefaults } from "../form-values";
import { buildModelRoutingPayload, toApiModelDiscoveryValue } from "../section-payloads";
import {
  MODEL_DISCOVERY_MODE_VALUES,
  MODEL_RULE_ALIAS_TARGET_REQUIRED_MESSAGE,
  MODEL_RULE_TYPE_VALUES,
  upstreamSectionSchemas,
} from "../section-schemas";
import { VirtualCatalogEntryList } from "../virtual-catalog-entry-list";

const schema = upstreamSectionSchemas["model-routing"];
type Values = z.input<typeof schema>;

export function ModelRoutingSection({ upstream }: { upstream: Upstream }) {
  const t = useTranslations("upstreams");

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: modelRoutingDefaults(upstream),
  });
  const mutation = useUpdateUpstreamSection();
  const previewCatalogMutation = usePreviewUpstreamCatalog();

  const [catalogSearchQuery, setCatalogSearchQuery] = useState("");
  const deferredCatalogSearchQuery = useDeferredValue(catalogSearchQuery);
  const [catalogSourceFilter, setCatalogSourceFilter] = useState<CatalogSourceFilter>("all");
  const [selectedCatalogModels, setSelectedCatalogModels] = useState<string[]>([]);
  const [selectedModelRuleIds, setSelectedModelRuleIds] = useState<string[]>([]);
  const [workspaceUpstream, setWorkspaceUpstream] = useState<Upstream | null>(null);

  const {
    fields: modelRuleFields,
    append: appendModelRule,
    remove: removeModelRule,
    replace: replaceModelRules,
  } = useFieldArray({ control: form.control, name: "model_rules" });

  const watchedModelDiscovery = useWatch({ control: form.control, name: "model_discovery" });
  const watchedModelRules = useWatch({ control: form.control, name: "model_rules" });

  const discoveryPreview = useMemo(
    () =>
      resolveDiscoveryPreview(
        upstream.base_url ?? "",
        upstream.route_capabilities,
        watchedModelDiscovery
      ),
    [upstream.base_url, upstream.route_capabilities, watchedModelDiscovery]
  );

  const catalogState = useMemo(
    () => buildCatalogWorkspaceState(workspaceUpstream ?? upstream),
    [upstream, workspaceUpstream]
  );
  const catalogWorkspaceDirty = useMemo(
    () =>
      !areCatalogWorkspaceStatesEqual(
        buildCatalogWorkspaceState(upstream),
        buildCatalogWorkspaceState(workspaceUpstream ?? upstream)
      ),
    [upstream, workspaceUpstream]
  );

  const filteredCatalogEntries = useMemo(() => {
    const query = deferredCatalogSearchQuery.trim().toLowerCase();
    return catalogState.modelCatalog.filter((entry) => {
      const matchesQuery = !query || entry.model.toLowerCase().includes(query);
      const matchesSource = catalogSourceFilter === "all" || entry.source === catalogSourceFilter;
      return matchesQuery && matchesSource;
    });
  }, [deferredCatalogSearchQuery, catalogSourceFilter, catalogState.modelCatalog]);
  const catalogSourceCounts = useMemo(
    () =>
      catalogState.modelCatalog.reduce(
        (counts, entry) => {
          counts[entry.source] += 1;
          return counts;
        },
        { native: 0, inferred: 0, litellm: 0 } satisfies Record<UpstreamModelCatalogSource, number>
      ),
    [catalogState.modelCatalog]
  );
  const selectedCatalogModelSet = useMemo(
    () => new Set(selectedCatalogModels),
    [selectedCatalogModels]
  );
  const selectedVisibleCatalogCount = filteredCatalogEntries.filter((entry) =>
    selectedCatalogModelSet.has(entry.model)
  ).length;
  const catalogUpdatedAtLabel = formatCatalogTimestamp(catalogState.modelCatalogUpdatedAt);
  const catalogFailedAtLabel = formatCatalogTimestamp(catalogState.modelCatalogLastFailedAt);
  const catalogHasEntries = catalogState.modelCatalog.length > 0;
  const catalogIsRefreshing = previewCatalogMutation.isPending;
  const catalogRefreshBlocked = !upstream.base_url?.trim();
  const currentRuleCount = watchedModelRules?.length ?? 0;
  const selectedModelRuleIdSet = new Set(
    selectedModelRuleIds.filter((id) => modelRuleFields.some((field) => field.id === id))
  );
  const selectedModelRuleCount = selectedModelRuleIdSet.size;
  const modelRuleHeaderSelectionState =
    currentRuleCount === 0
      ? false
      : selectedModelRuleCount === 0
        ? false
        : selectedModelRuleCount === currentRuleCount
          ? true
          : ("indeterminate" as const);

  const updateRuleAtIndex = (
    index: number,
    patch: Partial<Values["model_rules"][number]>,
    options?: { forceManualSource?: boolean }
  ) => {
    const currentRule = form.getValues(`model_rules.${index}`);
    if (!currentRule) {
      return;
    }
    form.setValue(
      `model_rules.${index}`,
      {
        ...currentRule,
        ...patch,
        source: options?.forceManualSource ? "manual" : (patch.source ?? currentRule.source),
      },
      { shouldDirty: true, shouldValidate: true }
    );
  };

  const toggleCatalogModelSelection = (model: string, checked: boolean) => {
    setSelectedCatalogModels((current) => {
      if (checked) {
        return current.includes(model) ? current : [...current, model];
      }
      return current.filter((value) => value !== model);
    });
  };

  const toggleModelRuleSelection = (ruleId: string, checked: boolean) => {
    setSelectedModelRuleIds((current) => {
      const nextCurrent = current.filter((value) =>
        modelRuleFields.some((field) => field.id === value)
      );
      if (checked) {
        return nextCurrent.includes(ruleId) ? nextCurrent : [...nextCurrent, ruleId];
      }
      return nextCurrent.filter((value) => value !== ruleId);
    });
  };

  const handleSelectAllModelRules = (checked: boolean) => {
    setSelectedModelRuleIds(checked ? modelRuleFields.map((field) => field.id) : []);
  };

  const handleRemoveModelRule = (index: number) => {
    const ruleId = modelRuleFields[index]?.id;
    if (ruleId) {
      setSelectedModelRuleIds((current) => current.filter((value) => value !== ruleId));
    }
    removeModelRule(index);
  };

  const handleRemoveSelectedModelRules = () => {
    const selectedRuleIdSet = new Set(
      selectedModelRuleIds.filter((id) => modelRuleFields.some((field) => field.id === id))
    );
    if (selectedRuleIdSet.size === 0) {
      return;
    }
    const remainingRules = form
      .getValues("model_rules")
      .filter((_, index) => !selectedRuleIdSet.has(modelRuleFields[index]?.id ?? ""));
    replaceModelRules(remainingRules);
    setSelectedModelRuleIds([]);
  };

  const handleSelectFilteredCatalogEntries = () => {
    const filteredModels = filteredCatalogEntries.map((entry) => entry.model);
    setSelectedCatalogModels((current) => [...new Set([...current, ...filteredModels])]);
  };

  const handleClearCatalogSelection = () => {
    setSelectedCatalogModels([]);
  };

  const handleRefreshCatalog = async () => {
    try {
      const preview = await previewCatalogMutation.mutateAsync({
        id: upstream.id,
        data: {
          base_url: upstream.base_url ?? "",
          route_capabilities: upstream.route_capabilities ?? [],
          model_discovery: watchedModelDiscovery
            ? toApiModelDiscoveryValue(watchedModelDiscovery)
            : null,
        },
      });
      setWorkspaceUpstream((current) =>
        applyCatalogPreviewToUpstream(current ?? upstream, preview)
      );
      const refreshedModelSet = new Set((preview.model_catalog ?? []).map((entry) => entry.model));
      setSelectedCatalogModels((current) =>
        current.filter((model) => refreshedModelSet.has(model))
      );
    } catch {
      // Refresh errors are surfaced by the mutation toast.
    }
  };

  const handleClearLiteLlmCatalogEntries = () => {
    if (catalogSourceCounts.litellm === 0) {
      return;
    }
    const retainedCatalog = catalogState.modelCatalog.filter((entry) => entry.source !== "litellm");
    const retainedModelSet = new Set(retainedCatalog.map((entry) => entry.model));

    mutation.mutate(
      {
        id: upstream.id,
        payload: {
          model_catalog: retainedCatalog.length > 0 ? retainedCatalog : null,
          model_catalog_updated_at:
            retainedCatalog.length > 0 ? catalogState.modelCatalogUpdatedAt : null,
          model_catalog_last_status: retainedCatalog.length > 0 ? "success" : null,
          model_catalog_last_error: null,
          model_catalog_last_failed_at: null,
        },
      },
      {
        onSuccess: () => {
          setSelectedCatalogModels((current) =>
            current.filter((model) => retainedModelSet.has(model))
          );
          setWorkspaceUpstream(null);
        },
      }
    );
  };

  const handleImportCatalog = () => {
    if (selectedCatalogModels.length === 0) {
      return;
    }
    const nextRules = importCatalogModelsIntoRules(
      catalogState.modelCatalog,
      selectedCatalogModels,
      form.getValues("model_rules")
    );
    replaceModelRules(nextRules);
    setSelectedCatalogModels([]);
  };

  const onSave = form.handleSubmit(() => {
    const parsed = schema.parse(form.getValues());
    const payload = buildModelRoutingPayload(parsed);
    if (workspaceUpstream) {
      payload.model_catalog = workspaceUpstream.model_catalog;
      payload.model_catalog_updated_at = workspaceUpstream.model_catalog_updated_at;
      payload.model_catalog_last_status = workspaceUpstream.model_catalog_last_status;
      payload.model_catalog_last_error = workspaceUpstream.model_catalog_last_error;
      payload.model_catalog_last_failed_at = workspaceUpstream.model_catalog_last_failed_at;
    }
    mutation.mutate(
      { id: upstream.id, payload },
      {
        onSuccess: () => {
          form.reset(form.getValues());
          setWorkspaceUpstream(null);
        },
      }
    );
  });

  const handleReset = () => {
    form.reset();
    setWorkspaceUpstream(null);
    setSelectedCatalogModels([]);
    setSelectedModelRuleIds([]);
  };

  return (
    <Form {...form}>
      <SectionForm
        title={t("modelBasedRouting")}
        isDirty={form.formState.isDirty || catalogWorkspaceDirty}
        isSaving={mutation.isPending}
        onSave={onSave}
        onReset={handleReset}
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-cf-sm bg-surface-200/45 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                  {t("modelBasedRouting")}
                </span>
                <Badge
                  variant={
                    catalogIsRefreshing
                      ? "info"
                      : catalogState.modelCatalogLastStatus === "failed"
                        ? "error"
                        : catalogHasEntries
                          ? "success"
                          : "neutral"
                  }
                >
                  {catalogIsRefreshing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : catalogState.modelCatalogLastStatus === "failed" ? (
                    <CircleAlert className="h-3.5 w-3.5" />
                  ) : catalogHasEntries ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {catalogIsRefreshing
                    ? t("catalogRefreshing")
                    : catalogState.modelCatalogLastStatus === "failed"
                      ? t("catalogStatusFailed")
                      : catalogHasEntries
                        ? t("catalogStatusReady")
                        : t("catalogStatusIdle")}
                </Badge>
                {catalogSourceCounts.native > 0 && (
                  <Badge variant="neutral">
                    {t("catalogSourceCountNative", { count: catalogSourceCounts.native })}
                  </Badge>
                )}
                {catalogSourceCounts.inferred > 0 && (
                  <Badge variant="info">
                    {t("catalogSourceCountInferred", { count: catalogSourceCounts.inferred })}
                  </Badge>
                )}
                {catalogSourceCounts.litellm > 0 && (
                  <Badge variant="warning">
                    {t("catalogSourceCountLiteLlm", { count: catalogSourceCounts.litellm })}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {catalogUpdatedAtLabel
                    ? t("catalogUpdatedAtLabel", { time: catalogUpdatedAtLabel })
                    : t("catalogNeverRefreshed")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{t("catalogStatusBarHint")}</p>
            </div>

            <div className="flex flex-wrap gap-2 self-start xl:self-auto">
              {catalogSourceCounts.litellm > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleClearLiteLlmCatalogEntries}
                  disabled={mutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                  {t("clearLiteLlmCatalogEntries")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  void handleRefreshCatalog();
                }}
                disabled={catalogRefreshBlocked || catalogIsRefreshing}
              >
                {catalogIsRefreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {t("refreshCatalog")}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.02fr)_minmax(340px,0.98fr)]">
            <div className="flex min-h-0 flex-col gap-4 xl:border-r xl:border-divider/70 xl:pr-5">
              <section className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="text-sm font-medium text-foreground">
                    {t("modelDiscoverySectionTitle")}
                  </h3>
                  <Badge variant="outline">
                    {t(
                      `modelDiscoveryModeLabel_${watchedModelDiscovery?.mode ?? "openai_compatible"}`
                    )}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name="model_discovery.mode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("modelDiscoveryMode")}</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(value: UpstreamModelDiscoveryMode) => {
                            field.onChange(value);
                          }}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {MODEL_DISCOVERY_MODE_VALUES.map((mode) => (
                              <SelectItem key={mode} value={mode}>
                                {t(`modelDiscoveryModeLabel_${mode}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {t(`modelDiscoveryModeDescription_${field.value}`)}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="model_discovery.enable_lite_llm_fallback"
                    render={({ field }) => (
                      <FormItem className="flex h-10 items-center justify-between gap-3 rounded-cf-sm border border-divider/50 bg-surface-200/35 px-3">
                        <FormLabel className="m-0 text-xs font-medium leading-none text-foreground">
                          {t("enableLiteLlmFallback")}
                        </FormLabel>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="model_discovery.auto_refresh_enabled"
                    render={({ field }) => (
                      <FormItem className="flex h-10 items-center justify-between gap-3 rounded-cf-sm border border-divider/50 bg-surface-200/35 px-3">
                        <FormLabel className="m-0 text-xs font-medium leading-none text-foreground">
                          {t("modelDiscoveryAutoRefresh")}
                        </FormLabel>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormItem>
                    )}
                  />
                </div>

                {watchedModelDiscovery?.mode === "custom" && (
                  <FormField
                    control={form.control}
                    name="model_discovery.custom_endpoint"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("customDiscoveryEndpoint")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("customDiscoveryEndpointPlaceholder")}
                            value={field.value ?? ""}
                            onChange={(event) => field.onChange(event.target.value)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="space-y-3 border-t border-divider/70 pt-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    {t("modelDiscoveryPreviewTitle")}
                  </div>
                  {!discoveryPreview ? (
                    <p className="text-sm text-muted-foreground">
                      {t("modelDiscoveryPreviewEmpty")}
                    </p>
                  ) : (
                    <div className="min-w-0 space-y-2 text-xs">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {t(`modelDiscoveryAuthProfile_${discoveryPreview.authProfile}`)}
                        </Badge>
                        <span className="text-muted-foreground">
                          {t("modelDiscoveryPreviewApiRoot")}
                        </span>
                        <code className="inline-block max-w-full overflow-x-auto whitespace-nowrap rounded-cf-sm bg-surface-200/75 px-2 py-1 font-mono text-[11px] text-foreground ring-1 ring-divider/50">
                          {discoveryPreview.apiRoot}
                        </code>
                      </div>
                      <div className="max-w-full overflow-x-auto whitespace-nowrap rounded-cf-sm bg-surface-200/75 px-3 py-2 font-mono text-[11px] text-foreground ring-1 ring-divider/50">
                        {discoveryPreview.requestUrl ?? t("customDiscoveryEndpointRequired")}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className="flex min-h-0 flex-1 flex-col gap-3 border-t border-divider/70 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-foreground">
                      {t("modelRulesSectionTitle")}
                    </h3>
                    <Badge variant="outline">{currentRuleCount}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {modelRuleFields.length > 0 ? (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                          checked={modelRuleHeaderSelectionState}
                          onCheckedChange={(value) =>
                            handleSelectAllModelRules(value === true || value === "indeterminate")
                          }
                          aria-label={t("modelRulesSelectAll")}
                        />
                        <span>{t("modelRulesSelectAll")}</span>
                      </label>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => appendModelRule(createEmptyModelRule())}
                    >
                      <Plus className="h-4 w-4" />
                      {t("addModelRule")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2 text-status-error hover:bg-status-error-muted"
                      onClick={handleRemoveSelectedModelRules}
                      disabled={selectedModelRuleCount === 0}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("deleteSelectedModelRules")}
                    </Button>
                  </div>
                </div>

                {modelRuleFields.length === 0 ? (
                  <div className="flex min-h-[180px] flex-1 items-center rounded-cf-sm border border-dashed border-divider bg-card/15 px-4 text-sm text-muted-foreground">
                    {t("modelRulesEmpty")}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {modelRuleFields.map((ruleField, index) => {
                      const currentRule = watchedModelRules?.[index] ?? ruleField;
                      const isAliasRule = currentRule.type === "alias";
                      const valueLabel =
                        currentRule.type === "regex"
                          ? t("modelRuleRegexPattern")
                          : currentRule.type === "alias"
                            ? t("sourceModel")
                            : t("modelRuleValue");
                      const valuePlaceholder =
                        currentRule.type === "regex"
                          ? t("modelRuleRegexPlaceholder")
                          : currentRule.type === "alias"
                            ? t("modelRuleAliasPlaceholder")
                            : t("modelRuleExactPlaceholder");

                      return (
                        <div
                          key={ruleField.id}
                          className="rounded-cf-sm border border-divider/70 bg-card/20 p-3"
                        >
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Checkbox
                                checked={selectedModelRuleIdSet.has(ruleField.id)}
                                onCheckedChange={(value) =>
                                  toggleModelRuleSelection(ruleField.id, value === true)
                                }
                                aria-label={`${t("selectModelRule")} ${index + 1}`}
                              />
                              <Badge variant={getRuleSourceBadgeVariant(currentRule.source)}>
                                {t(`modelRuleSource_${currentRule.source}`)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {currentRule.display_label ||
                                  t(`modelRuleTypeLabel_${currentRule.type}`)}
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-status-error hover:bg-status-error-muted"
                              onClick={() => handleRemoveModelRule(index)}
                              aria-label={t("removeModelRule")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div
                            className={cn(
                              "grid gap-3",
                              isAliasRule
                                ? "md:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)]"
                                : "md:grid-cols-[150px_minmax(0,1fr)]"
                            )}
                          >
                            <FormField
                              control={form.control}
                              name={`model_rules.${index}.type`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>{t("modelRuleType")}</FormLabel>
                                  <Select
                                    value={field.value}
                                    onValueChange={(value: UpstreamModelRuleType) => {
                                      field.onChange(value);
                                      updateRuleAtIndex(
                                        index,
                                        {
                                          type: value,
                                          target_model:
                                            value === "alias"
                                              ? (currentRule.target_model ?? "")
                                              : null,
                                          display_label: null,
                                        },
                                        { forceManualSource: true }
                                      );
                                    }}
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {MODEL_RULE_TYPE_VALUES.map((type) => (
                                        <SelectItem key={type} value={type}>
                                          {t(`modelRuleTypeLabel_${type}`)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`model_rules.${index}.value`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>{valueLabel}</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder={valuePlaceholder}
                                      value={field.value}
                                      onChange={(event) => {
                                        field.onChange(event.target.value);
                                        updateRuleAtIndex(
                                          index,
                                          { value: event.target.value },
                                          { forceManualSource: true }
                                        );
                                      }}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {isAliasRule ? (
                              <FormField
                                control={form.control}
                                name={`model_rules.${index}.target_model`}
                                render={({ field, fieldState }) => (
                                  <FormItem>
                                    <FormLabel>{t("targetModel")}</FormLabel>
                                    <FormControl>
                                      <Input
                                        placeholder={t("modelRuleTargetPlaceholder")}
                                        value={field.value ?? ""}
                                        onChange={(event) => {
                                          field.onChange(event.target.value);
                                          updateRuleAtIndex(
                                            index,
                                            { target_model: event.target.value },
                                            { forceManualSource: true }
                                          );
                                        }}
                                      />
                                    </FormControl>
                                    {fieldState.error?.message ? (
                                      <p className="type-body-small text-status-error">
                                        {fieldState.error.message ===
                                        MODEL_RULE_ALIAS_TARGET_REQUIRED_MESSAGE
                                          ? t("modelRuleAliasTargetRequired")
                                          : fieldState.error.message}
                                      </p>
                                    ) : null}
                                  </FormItem>
                                )}
                              />
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            <div className="flex min-h-0 flex-col xl:pl-5">
              <section className="flex min-h-0 flex-1 flex-col space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-foreground">
                      {t("catalogSectionTitle")}
                    </h3>
                  </div>
                  <Badge variant="outline">
                    {t("catalogSelectedSummary", { count: selectedCatalogModels.length })}
                  </Badge>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_136px]">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">
                      {t("catalogSearchLabel")}
                    </label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-9"
                        placeholder={t("catalogSearchPlaceholder")}
                        value={catalogSearchQuery}
                        onChange={(event) => setCatalogSearchQuery(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">
                      {t("catalogSourceFilterLabel")}
                    </label>
                    <Select
                      value={catalogSourceFilter}
                      onValueChange={(value: CatalogSourceFilter) => setCatalogSourceFilter(value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("catalogSourceFilterAll")}</SelectItem>
                        <SelectItem value="native">{t("modelRuleSource_native")}</SelectItem>
                        <SelectItem value="inferred">{t("modelRuleSource_inferred")}</SelectItem>
                        <SelectItem value="litellm">{t("modelRuleSource_litellm")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {catalogState.modelCatalogLastStatus === "failed" && (
                  <div
                    className={cn("rounded-cf-sm border px-3 py-3 text-xs", statusTone("error"))}
                  >
                    <div className="font-medium">{t("catalogFailureTitle")}</div>
                    <div className="mt-1">
                      {catalogState.modelCatalogLastError || t("catalogFailureUnknown")}
                    </div>
                    {catalogFailedAtLabel && (
                      <div className="mt-1 text-status-error/85">
                        {t("catalogFailedAtLabel", { time: catalogFailedAtLabel })}
                      </div>
                    )}
                  </div>
                )}

                {catalogIsRefreshing ? (
                  <div className="flex min-h-[180px] items-center justify-center gap-2 rounded-cf-sm bg-card/15 px-3 py-4 text-sm text-muted-foreground ring-1 ring-divider/50">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("catalogLoading")}
                  </div>
                ) : !catalogHasEntries ? (
                  <div className="flex min-h-[180px] items-center rounded-cf-sm border border-dashed border-divider bg-card/15 p-4 text-sm text-muted-foreground">
                    {t("catalogEmptyState")}
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {t("catalogFilteredSummary", {
                          visible: filteredCatalogEntries.length,
                          total: catalogState.modelCatalog.length,
                        })}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={handleSelectFilteredCatalogEntries}
                          disabled={filteredCatalogEntries.length === 0}
                        >
                          {t("catalogSelectVisible")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={handleClearCatalogSelection}
                          disabled={selectedCatalogModels.length === 0}
                        >
                          {t("catalogClearSelection")}
                        </Button>
                      </div>
                    </div>

                    {filteredCatalogEntries.length === 0 ? (
                      <div className="min-h-0 flex-1 rounded-cf-sm border border-divider/70 bg-card/15 p-4 text-sm text-muted-foreground">
                        {t("catalogNoMatchingModels")}
                      </div>
                    ) : (
                      <VirtualCatalogEntryList
                        entries={filteredCatalogEntries}
                        selectedModels={selectedCatalogModelSet}
                        onToggle={toggleCatalogModelSelection}
                      />
                    )}

                    <div className="flex flex-col gap-3 border-t border-divider/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-xs text-muted-foreground">
                        {t("catalogSelectionFeedback", {
                          selected: selectedCatalogModels.length,
                          visible: selectedVisibleCatalogCount,
                        })}
                      </span>
                      <Button
                        type="button"
                        className="gap-2 self-start sm:self-auto"
                        onClick={handleImportCatalog}
                        disabled={selectedCatalogModels.length === 0}
                      >
                        <ArrowDownToLine className="h-4 w-4" />
                        {t("catalogImportScope", { count: selectedCatalogModels.length })}
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </SectionForm>
    </Form>
  );
}
