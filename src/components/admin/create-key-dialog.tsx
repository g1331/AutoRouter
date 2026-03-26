"use client";

import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, CalendarIcon, Search } from "lucide-react";
import { format } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useCreateAPIKey } from "@/hooks/use-api-keys";
import { useAllUpstreams } from "@/hooks/use-upstreams";
import type { APIKeyCreateResponse } from "@/types/api";
import { ShowKeyDialog } from "./show-key-dialog";
import { getDateLocale } from "@/lib/date-locale";

function getSpendingRuleDraftKey(ruleId: string, fieldName: "limit" | "period_hours") {
  return `${ruleId}:${fieldName}`;
}

function getSpendingRuleInputValue(
  drafts: Record<string, string>,
  draftKey: string,
  fieldValue: number | undefined
) {
  if (drafts[draftKey] !== undefined) {
    return drafts[draftKey];
  }

  if (typeof fieldValue === "number") {
    return fieldValue === 0 ? "" : String(fieldValue);
  }

  return "";
}

/**
 * M3 Create API Key Dialog
 */
export function CreateKeyDialog() {
  const [open, setOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<APIKeyCreateResponse | null>(null);
  const [upstreamSearchQuery, setUpstreamSearchQuery] = useState("");
  const [spendingRuleDrafts, setSpendingRuleDrafts] = useState<Record<string, string>>({});
  const createMutation = useCreateAPIKey();
  const t = useTranslations("keys");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);

  const { data: upstreams, isLoading: upstreamsLoading } = useAllUpstreams();

  const createKeySchema = z
    .object({
      name: z.string().min(1, t("keyNameRequired")).max(100),
      description: z.string().max(500).optional(),
      access_mode: z.enum(["unrestricted", "restricted"]),
      upstream_ids: z.array(z.string()),
      expires_at: z.date().optional(),
      spending_rules: z.array(
        z
          .object({
            period_type: z.enum(["daily", "monthly", "rolling"]),
            limit: z.number().positive(t("quotaLimitPositive")),
            period_hours: z.number().int().min(1).max(8760).optional(),
          })
          .superRefine((rule, ctx) => {
            if (rule.period_type === "rolling" && rule.period_hours == null) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["period_hours"],
                message: t("quotaPeriodHoursRequired"),
              });
            }
          })
      ),
    })
    .superRefine((data, ctx) => {
      if (data.access_mode === "restricted" && data.upstream_ids.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["upstream_ids"],
          message: t("selectUpstreamsRequired"),
        });
      }
    });

  type CreateKeyForm = z.infer<typeof createKeySchema>;

  const form = useForm<CreateKeyForm>({
    resolver: zodResolver(createKeySchema),
    defaultValues: {
      name: "",
      description: "",
      access_mode: "unrestricted",
      upstream_ids: [],
      expires_at: undefined,
      spending_rules: [],
    },
  });
  const spendingRulesFieldArray = useFieldArray({
    control: form.control,
    name: "spending_rules",
  });
  const spendingRules = useWatch({
    control: form.control,
    name: "spending_rules",
  });
  const accessMode = useWatch({
    control: form.control,
    name: "access_mode",
  });
  const selectedUpstreamIds =
    useWatch({
      control: form.control,
      name: "upstream_ids",
    }) ?? [];
  const normalizedUpstreamSearchQuery = upstreamSearchQuery.trim().toLowerCase();
  const filteredUpstreams = (upstreams ?? []).filter((upstream) => {
    if (!normalizedUpstreamSearchQuery) {
      return true;
    }

    const searchableText = [upstream.name, upstream.description ?? ""].join(" ").toLowerCase();

    return searchableText.includes(normalizedUpstreamSearchQuery);
  });
  const filteredUpstreamIds = filteredUpstreams.map((upstream) => upstream.id);
  const selectedFilteredCount = filteredUpstreamIds.filter((id) =>
    selectedUpstreamIds.includes(id)
  ).length;
  const allFilteredUpstreamsSelected =
    filteredUpstreamIds.length > 0 && selectedFilteredCount === filteredUpstreamIds.length;

  const syncSpendingRuleDraftsToForm = () => {
    // Keep raw text editable until submit, then sync the final numeric value into RHF.
    spendingRulesFieldArray.fields.forEach((ruleField, index) => {
      const limitDraftKey = getSpendingRuleDraftKey(ruleField.id, "limit");
      if (Object.prototype.hasOwnProperty.call(spendingRuleDrafts, limitDraftKey)) {
        const rawValue = spendingRuleDrafts[limitDraftKey];
        form.setValue(
          `spending_rules.${index}.limit`,
          (rawValue === "" ? undefined : Number(rawValue)) as never,
          { shouldDirty: true }
        );
      }

      const periodHoursDraftKey = getSpendingRuleDraftKey(ruleField.id, "period_hours");
      if (Object.prototype.hasOwnProperty.call(spendingRuleDrafts, periodHoursDraftKey)) {
        const rawValue = spendingRuleDrafts[periodHoursDraftKey];
        form.setValue(
          `spending_rules.${index}.period_hours`,
          (rawValue === "" ? undefined : Number(rawValue)) as never,
          { shouldDirty: true }
        );
      }
    });
  };

  const onSubmit = async (data: CreateKeyForm) => {
    try {
      const result = await createMutation.mutateAsync({
        name: data.name,
        description: data.description || null,
        access_mode: data.access_mode,
        upstream_ids: data.access_mode === "restricted" ? data.upstream_ids : [],
        expires_at: data.expires_at ? data.expires_at.toISOString() : null,
        spending_rules: data.spending_rules.length > 0 ? data.spending_rules : null,
      });

      setCreatedKey(result);
      setOpen(false);
      setUpstreamSearchQuery("");
      setSpendingRuleDrafts({});
      form.reset();
    } catch {
      // Error already handled by mutation onError
    }
  };

  const onInvalidSubmit = () => {
    const rules = form.getValues("spending_rules") ?? [];

    // Cleared numeric fields fail `z.number()` first, so re-apply localized field errors here.
    rules.forEach((rule, index) => {
      if (rule.limit == null || Number(rule.limit) <= 0) {
        form.setError(`spending_rules.${index}.limit`, {
          type: "manual",
          message: t("quotaLimitPositive"),
        });
      }

      if (
        rule.period_type === "rolling" &&
        (rule.period_hours == null || Number(rule.period_hours) < 1)
      ) {
        form.setError(`spending_rules.${index}.period_hours`, {
          type: "manual",
          message: t("quotaPeriodHoursRequired"),
        });
      }
    });

    toast.error(t("formValidationFailed"));
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (!nextOpen) {
      setUpstreamSearchQuery("");
      setSpendingRuleDrafts({});
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            {t("createKey")}
          </Button>
        </DialogTrigger>
        <DialogContent className="flex max-h-[calc(100vh-2rem)] max-w-2xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 px-6 pb-0 pr-12 pt-6">
            <DialogTitle>{t("createKeyTitle")}</DialogTitle>
            <DialogDescription>{t("createKeyDesc")}</DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={(event) => {
                syncSpendingRuleDraftsToForm();
                void form.handleSubmit(onSubmit, onInvalidSubmit)(event);
              }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("keyName")} *</FormLabel>
                      <FormControl>
                        <Input placeholder={t("keyNamePlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("keyDescription")}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t("keyDescriptionPlaceholder")}
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="access_mode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("upstreamAccessMode")}</FormLabel>
                      <FormDescription>{t("upstreamAccessModeDesc")}</FormDescription>
                      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          className={cn(
                            "rounded-[var(--shape-corner-medium)] border p-4 text-left transition-colors",
                            field.value === "unrestricted"
                              ? "border-primary bg-primary/5"
                              : "border-[rgb(var(--md-sys-color-outline-variant))] bg-[rgb(var(--md-sys-color-surface-container-low))]"
                          )}
                          onClick={() => field.onChange("unrestricted")}
                        >
                          <div className="type-body-medium text-[rgb(var(--md-sys-color-on-surface))]">
                            {t("unrestrictedAccess")}
                          </div>
                          <p className="mt-1 type-body-small text-[rgb(var(--md-sys-color-on-surface-variant))]">
                            {t("unrestrictedAccessDesc")}
                          </p>
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "rounded-[var(--shape-corner-medium)] border p-4 text-left transition-colors",
                            field.value === "restricted"
                              ? "border-primary bg-primary/5"
                              : "border-[rgb(var(--md-sys-color-outline-variant))] bg-[rgb(var(--md-sys-color-surface-container-low))]"
                          )}
                          onClick={() => field.onChange("restricted")}
                        >
                          <div className="type-body-medium text-[rgb(var(--md-sys-color-on-surface))]">
                            {t("restrictedAccess")}
                          </div>
                          <p className="mt-1 type-body-small text-[rgb(var(--md-sys-color-on-surface-variant))]">
                            {t("restrictedAccessDesc")}
                          </p>
                        </button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {accessMode === "restricted" && (
                  <FormField
                    control={form.control}
                    name="upstream_ids"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("selectUpstreams")} *</FormLabel>
                        <FormDescription>{t("selectUpstreamsDesc")}</FormDescription>
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                          <div className="relative flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              value={upstreamSearchQuery}
                              onChange={(event) => setUpstreamSearchQuery(event.target.value)}
                              placeholder={t("searchUpstreams")}
                              aria-label={t("searchUpstreams")}
                              className="border-surface-400/70 bg-surface-200/70 pl-9 transition-colors duration-cf-fast hover:border-surface-400 focus-visible:border-amber-400/45 focus-visible:ring-amber-400/20"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            disabled={filteredUpstreamIds.length === 0}
                            onClick={() => {
                              if (allFilteredUpstreamsSelected) {
                                field.onChange(
                                  (field.value ?? []).filter(
                                    (id) => !filteredUpstreamIds.includes(id)
                                  )
                                );
                                return;
                              }

                              field.onChange(
                                Array.from(
                                  new Set([...(field.value ?? []), ...filteredUpstreamIds])
                                )
                              );
                            }}
                          >
                            {t(
                              allFilteredUpstreamsSelected
                                ? "deselectFilteredUpstreams"
                                : "selectFilteredUpstreams"
                            )}
                          </Button>
                        </div>
                        {!upstreamsLoading && !!upstreams?.length && (
                          <p className="mt-2 type-body-small text-muted-foreground">
                            {t("filteredUpstreamsSelected", {
                              selected: selectedFilteredCount,
                              total: filteredUpstreamIds.length,
                            })}
                          </p>
                        )}
                        <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-[var(--shape-corner-medium)] border border-[rgb(var(--md-sys-color-outline-variant))] bg-[rgb(var(--md-sys-color-surface-container-low))] p-3">
                          {upstreamsLoading ? (
                            <div className="py-4 text-center type-body-medium text-[rgb(var(--md-sys-color-on-surface-variant))]">
                              {tCommon("loading")}
                            </div>
                          ) : !upstreams || upstreams.length === 0 ? (
                            <div className="py-4 text-center type-body-medium text-[rgb(var(--md-sys-color-on-surface-variant))]">
                              {tCommon("noData")}
                            </div>
                          ) : filteredUpstreams.length === 0 ? (
                            <div className="py-4 text-center type-body-medium text-[rgb(var(--md-sys-color-on-surface-variant))]">
                              {t("noMatchingUpstreams")}
                            </div>
                          ) : (
                            filteredUpstreams.map((upstream) => (
                              <FormField
                                key={upstream.id}
                                control={form.control}
                                name="upstream_ids"
                                render={({ field }) => (
                                  <FormItem className="flex items-start space-x-3 space-y-0 rounded-[var(--shape-corner-small)] p-2 transition-colors hover:bg-[rgb(var(--md-sys-color-on-surface)_/_0.08)]">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(upstream.id)}
                                        onCheckedChange={(checked) => {
                                          const updated = checked
                                            ? [...(field.value || []), upstream.id]
                                            : field.value?.filter((id) => id !== upstream.id);
                                          field.onChange(updated);
                                        }}
                                      />
                                    </FormControl>
                                    <div className="flex-1 space-y-1 leading-none">
                                      <label className="cursor-pointer type-body-medium text-[rgb(var(--md-sys-color-on-surface))]">
                                        {upstream.name}
                                      </label>
                                      {upstream.description && (
                                        <p className="type-body-small text-[rgb(var(--md-sys-color-on-surface-variant))]">
                                          {upstream.description}
                                        </p>
                                      )}
                                    </div>
                                  </FormItem>
                                )}
                              />
                            ))
                          )}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="space-y-3 rounded-[var(--shape-corner-medium)] border border-[rgb(var(--md-sys-color-outline-variant))] bg-[rgb(var(--md-sys-color-surface-container-low))] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="type-body-medium text-[rgb(var(--md-sys-color-on-surface))]">
                        {t("spendingRules")}
                      </p>
                      <p className="mt-1 type-body-small text-[rgb(var(--md-sys-color-on-surface-variant))]">
                        {t("spendingRulesDesc")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() =>
                        spendingRulesFieldArray.append({
                          period_type: "daily",
                          limit: 0,
                        })
                      }
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {t("addSpendingRule")}
                    </Button>
                  </div>

                  {spendingRulesFieldArray.fields.length === 0 ? (
                    <p className="type-body-small text-[rgb(var(--md-sys-color-on-surface-variant))]">
                      {t("spendingRulesEmpty")}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {spendingRulesFieldArray.fields.map((ruleField, index) => {
                        const rulePeriodType = spendingRules?.[index]?.period_type;
                        return (
                          <div
                            key={ruleField.id}
                            className="space-y-3 rounded-[var(--shape-corner-small)] border border-[rgb(var(--md-sys-color-outline-variant))] bg-background/70 p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="type-body-medium text-foreground">
                                {t("spendingRuleLabel", { index: index + 1 })}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSpendingRuleDrafts((currentDrafts) => {
                                    const nextDrafts = { ...currentDrafts };
                                    delete nextDrafts[
                                      getSpendingRuleDraftKey(ruleField.id, "limit")
                                    ];
                                    delete nextDrafts[
                                      getSpendingRuleDraftKey(ruleField.id, "period_hours")
                                    ];
                                    return nextDrafts;
                                  });
                                  spendingRulesFieldArray.remove(index);
                                }}
                              >
                                {tCommon("delete")}
                              </Button>
                            </div>

                            <FormField
                              control={form.control}
                              name={`spending_rules.${index}.period_type`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>{t("quotaPeriodType")}</FormLabel>
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                    {(["daily", "monthly", "rolling"] as const).map((value) => (
                                      <Button
                                        key={value}
                                        type="button"
                                        variant={field.value === value ? "default" : "outline"}
                                        className="justify-start"
                                        onClick={() => {
                                          field.onChange(value);
                                          if (value !== "rolling") {
                                            setSpendingRuleDrafts((currentDrafts) => {
                                              const nextDrafts = { ...currentDrafts };
                                              delete nextDrafts[
                                                getSpendingRuleDraftKey(
                                                  ruleField.id,
                                                  "period_hours"
                                                )
                                              ];
                                              return nextDrafts;
                                            });
                                            form.setValue(
                                              `spending_rules.${index}.period_hours`,
                                              undefined
                                            );
                                          }
                                        }}
                                      >
                                        {t(`quotaPeriodType_${value}`)}
                                      </Button>
                                    ))}
                                  </div>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <FormField
                                control={form.control}
                                name={`spending_rules.${index}.limit`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>{t("quotaLimitUsd")}</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={getSpendingRuleInputValue(
                                          spendingRuleDrafts,
                                          getSpendingRuleDraftKey(ruleField.id, "limit"),
                                          field.value
                                        )}
                                        onChange={(event) => {
                                          const rawValue = event.target.value;
                                          setSpendingRuleDrafts((currentDrafts) => ({
                                            ...currentDrafts,
                                            [getSpendingRuleDraftKey(ruleField.id, "limit")]:
                                              rawValue,
                                          }));
                                          field.onChange(
                                            rawValue === "" ? undefined : Number(rawValue)
                                          );
                                        }}
                                        placeholder={t("quotaLimitPlaceholder")}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              {rulePeriodType === "rolling" && (
                                <FormField
                                  control={form.control}
                                  name={`spending_rules.${index}.period_hours`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>{t("quotaPeriodHours")}</FormLabel>
                                      <FormControl>
                                        <Input
                                          type="number"
                                          min="1"
                                          max="8760"
                                          step="1"
                                          value={getSpendingRuleInputValue(
                                            spendingRuleDrafts,
                                            getSpendingRuleDraftKey(ruleField.id, "period_hours"),
                                            field.value
                                          )}
                                          onChange={(event) => {
                                            const rawValue = event.target.value;
                                            setSpendingRuleDrafts((currentDrafts) => ({
                                              ...currentDrafts,
                                              [getSpendingRuleDraftKey(
                                                ruleField.id,
                                                "period_hours"
                                              )]: rawValue,
                                            }));
                                            field.onChange(
                                              rawValue === "" ? undefined : Number(rawValue)
                                            );
                                          }}
                                          placeholder={t("quotaPeriodHoursPlaceholder")}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="expires_at"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>{t("expirationDate")}</FormLabel>
                      <FormDescription>{t("expirationDateDesc")}</FormDescription>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "h-11 w-full justify-between rounded-cf-sm border-border bg-surface-200 px-3 text-left font-normal hover:bg-surface-300",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP", { locale: dateLocale })
                              ) : (
                                <span>{t("selectDate")}</span>
                              )}
                              <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            locale={dateLocale}
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter className="shrink-0 border-t border-divider px-6 py-4">
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  {tCommon("cancel")}
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t("creating") : tCommon("create")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {createdKey && (
        <ShowKeyDialog
          apiKey={createdKey}
          open={!!createdKey}
          onClose={() => setCreatedKey(null)}
        />
      )}
    </>
  );
}
