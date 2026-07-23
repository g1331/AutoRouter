"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { ShowKeyDialog } from "@/components/admin/show-key-dialog";
import { coerceNumericInput, getNumericInputValue } from "@/components/admin/upstream/coerce";
import {
  useCreatePortalKey,
  usePortalUpstreamOptions,
  useUpdatePortalKey,
} from "@/hooks/use-portal-keys";
import { MAX_API_KEY_RATE_LIMIT } from "@/lib/services/api-key-rate-limits";
import type { APIKey, APIKeyCreateResponse, APIKeySpendingRule } from "@/types/api";

interface SpendingRuleDraft {
  period_type: "daily" | "monthly" | "rolling";
  limit: string;
  period_hours: string;
}

// Empty fields mean no limit. Keep them as null rather than using z.coerce.number(),
// which would turn an empty string into 0 and corrupt an unlimited setting.
const portalRateLimitSchema = z.preprocess(
  (value) => coerceNumericInput(value, null),
  z.number().int().min(1).max(MAX_API_KEY_RATE_LIMIT).nullable()
);

interface PortalKeyDialogProps {
  mode: "create" | "edit";
  apiKey?: APIKey | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 启用容器变形动画（View Transition）。 */
  morph?: boolean;
  /** 容器变形使用的 view-transition-name，须与 CSS 具名过渡对应。 */
  morphName?: string;
}

function toSpendingRuleDrafts(rules: APIKeySpendingRule[] | null | undefined): SpendingRuleDraft[] {
  return (rules ?? []).map((rule) => ({
    period_type: rule.period_type,
    limit: String(rule.limit),
    period_hours: rule.period_hours != null ? String(rule.period_hours) : "",
  }));
}

/**
 * Self-service key create/edit dialog. Ownership and the restricted access
 * mode are forced server-side; the selectable upstreams are the caller's
 * admin-granted set, and spending rules can only be tightened (the server
 * rejects any relaxation).
 */
export function PortalKeyDialog({
  mode,
  apiKey,
  open,
  onOpenChange,
  morph = false,
  morphName = "morph-portal-key-form",
}: PortalKeyDialogProps) {
  const [createdKey, setCreatedKey] = useState<APIKeyCreateResponse | null>(null);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex max-h-[calc(100vh-2rem)] max-w-xl flex-col overflow-hidden p-0"
          morph={morph}
          morphName={morphName}
        >
          {/* Remounting the body per open/key resets the form without effects. */}
          {open && (
            <PortalKeyDialogBody
              key={mode === "edit" ? (apiKey?.id ?? "edit") : "create"}
              mode={mode}
              apiKey={apiKey}
              onClose={() => onOpenChange(false)}
              onCreated={setCreatedKey}
            />
          )}
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

interface PortalKeyDialogBodyProps {
  mode: "create" | "edit";
  apiKey?: APIKey | null;
  onClose: () => void;
  onCreated: (key: APIKeyCreateResponse) => void;
}

function PortalKeyDialogBody({ mode, apiKey, onClose, onCreated }: PortalKeyDialogBodyProps) {
  const t = useTranslations("keys");
  const tPortal = useTranslations("portal");
  const tCommon = useTranslations("common");
  const [spendingRules, setSpendingRules] = useState<SpendingRuleDraft[]>(() =>
    mode === "edit" ? toSpendingRuleDrafts(apiKey?.spending_rules) : []
  );
  const [spendingRulesError, setSpendingRulesError] = useState<string | null>(null);

  const createMutation = useCreatePortalKey();
  const updateMutation = useUpdatePortalKey();
  const { data: upstreamOptions, isLoading: upstreamsLoading } = usePortalUpstreamOptions();

  // While the options are still loading, assume upstreams are visible so the
  // required-field rule is never relaxed on a guess.
  const upstreamsVisible = upstreamOptions?.upstreams_visible ?? true;

  const keyFormSchema = z.object({
    name: z.string().min(1, t("keyNameRequired")).max(100),
    description: z.string().max(500).optional(),
    upstream_ids: upstreamsVisible
      ? z.array(z.string()).min(1, t("selectUpstreamsRequired"))
      : z.array(z.string()),
    rpm_limit: portalRateLimitSchema,
    tpm_limit: portalRateLimitSchema,
  });

  type KeyFormInput = z.input<typeof keyFormSchema>;
  type KeyForm = z.output<typeof keyFormSchema>;

  const form = useForm<KeyFormInput, unknown, KeyForm>({
    resolver: zodResolver(keyFormSchema),
    defaultValues:
      mode === "edit" && apiKey
        ? {
            name: apiKey.name,
            description: apiKey.description ?? "",
            upstream_ids: apiKey.upstream_ids,
            rpm_limit: apiKey.rpm_limit ?? null,
            tpm_limit: apiKey.tpm_limit ?? null,
          }
        : { name: "", description: "", upstream_ids: [], rpm_limit: null, tpm_limit: null },
  });

  // The granted upstream options load after this body mounts. A key may still
  // reference an upstream the member can no longer manage (an admin revoked the
  // grant or deleted the upstream). That id never shows up in the checkbox list,
  // yet it stays in the form value, so the member cannot uncheck it and every
  // save is rejected server-side by assertUpstreamsAllowed — the key becomes
  // uneditable. Once the options arrive, drop any id outside the granted set so
  // the form only carries upstreams the member can actually toggle and submit;
  // if all of them were stale, upstream_ids becomes empty and the required-field
  // validation correctly asks the member to pick from the visible options.
  useEffect(() => {
    if (mode !== "edit" || !upstreamOptions || !upstreamsVisible) {
      return;
    }
    const allowedIds = new Set(upstreamOptions.items.map((item) => item.id));
    const current = form.getValues("upstream_ids");
    const reconciled = current.filter((id) => allowedIds.has(id));
    if (reconciled.length !== current.length) {
      form.setValue("upstream_ids", reconciled);
    }
  }, [upstreamOptions, upstreamsVisible, mode, form]);

  const parseSpendingRules = (): APIKeySpendingRule[] | null | undefined => {
    const parsed: APIKeySpendingRule[] = [];
    for (const draft of spendingRules) {
      const limit = Number(draft.limit);
      if (!draft.limit || !Number.isFinite(limit) || limit <= 0) {
        setSpendingRulesError(t("quotaLimitPositive"));
        return undefined;
      }
      if (draft.period_type === "rolling") {
        const hours = Number(draft.period_hours);
        if (!draft.period_hours || !Number.isInteger(hours) || hours < 1 || hours > 8760) {
          setSpendingRulesError(t("quotaPeriodHoursRequired"));
          return undefined;
        }
        parsed.push({ period_type: "rolling", limit, period_hours: hours });
      } else {
        parsed.push({ period_type: draft.period_type, limit });
      }
    }
    setSpendingRulesError(null);
    return parsed.length > 0 ? parsed : null;
  };

  const assertRateLimitTightened = (
    field: "rpm_limit" | "tpm_limit",
    nextValue: number | null
  ): boolean => {
    const currentValue = apiKey?.[field] ?? null;
    if (mode !== "edit" || currentValue == null) {
      return true;
    }

    if (nextValue != null && nextValue <= currentValue) {
      return true;
    }

    form.setError(field, {
      type: "manual",
      message: tPortal("keys.rateLimitsTightenHint"),
    });
    return false;
  };

  const onSubmit = async (data: KeyForm) => {
    const rules = parseSpendingRules();
    if (rules === undefined) {
      return;
    }
    if (
      !assertRateLimitTightened("rpm_limit", data.rpm_limit) ||
      !assertRateLimitTightened("tpm_limit", data.tpm_limit)
    ) {
      return;
    }

    try {
      // While upstreams are hidden the member never picks a subset: omit the
      // field so the server binds (and keeps) the admin-granted set.
      const upstreamPayload = upstreamsVisible ? { upstream_ids: data.upstream_ids } : {};

      if (mode === "create") {
        const result = await createMutation.mutateAsync({
          name: data.name,
          ...upstreamPayload,
          description: data.description || null,
          spending_rules: rules,
          rpm_limit: data.rpm_limit,
          tpm_limit: data.tpm_limit,
        });
        onCreated(result);
      } else if (apiKey) {
        await updateMutation.mutateAsync({
          id: apiKey.id,
          data: {
            name: data.name,
            description: data.description || null,
            ...upstreamPayload,
            spending_rules: rules,
            rpm_limit: data.rpm_limit,
            tpm_limit: data.tpm_limit,
          },
        });
      }
      onClose();
    } catch {
      // Error already handled by mutation onError
    }
  };

  const updateRule = (index: number, patch: Partial<SpendingRuleDraft>) => {
    setSpendingRules((rules) =>
      rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule))
    );
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <DialogHeader className="shrink-0 px-6 pb-0 pr-12 pt-6">
        <DialogTitle>
          {mode === "create" ? tPortal("keys.createTitle") : tPortal("keys.editTitle")}
        </DialogTitle>
        <DialogDescription>{tPortal("keys.dialogDesc")}</DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6">
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
                    <Textarea placeholder={t("keyDescriptionPlaceholder")} rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!upstreamsVisible ? (
              <div className="space-y-1 rounded-cf-md border border-divider-subtle bg-surface-200 p-4">
                <p className="type-body-medium text-foreground">
                  {tPortal("keys.autoRoutedTitle")}
                </p>
                <p className="type-body-small text-muted-foreground">
                  {tPortal("keys.autoRoutedDesc")}
                </p>
              </div>
            ) : (
              <FormField
                control={form.control}
                name="upstream_ids"
                render={() => (
                  <FormItem>
                    <FormLabel>{t("selectUpstreams")} *</FormLabel>
                    <FormDescription>{tPortal("keys.upstreamsDesc")}</FormDescription>
                    <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-cf-md border border-divider-subtle bg-surface-200 p-3">
                      {upstreamsLoading ? (
                        <div className="py-4 text-center type-body-medium text-muted-foreground">
                          {tCommon("loading")}
                        </div>
                      ) : !upstreamOptions || upstreamOptions.items.length === 0 ? (
                        <div className="py-4 text-center type-body-medium text-muted-foreground">
                          {tPortal("keys.noGrantedUpstreams")}
                        </div>
                      ) : (
                        upstreamOptions.items.map((upstream) => (
                          <FormField
                            key={upstream.id}
                            control={form.control}
                            name="upstream_ids"
                            render={({ field }) => (
                              <FormItem className="flex items-center space-x-3 space-y-0 rounded-cf-md p-2 transition-colors hover:bg-foreground/10">
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
                                <label className="cursor-pointer type-body-medium text-foreground">
                                  {upstream.name}
                                </label>
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

            <div className="space-y-3 rounded-cf-md border border-divider-subtle bg-surface-200 p-4">
              <div>
                <p className="type-body-medium text-foreground">{t("rateLimits")}</p>
                <p className="mt-1 type-body-small text-muted-foreground">
                  {mode === "edit" ? tPortal("keys.rateLimitsTightenHint") : t("rateLimitsDesc")}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="rpm_limit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("rpmLimit")}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={mode === "edit" ? (apiKey?.rpm_limit ?? undefined) : undefined}
                          step={1}
                          inputMode="numeric"
                          placeholder={t("rateLimitUnlimited")}
                          value={getNumericInputValue(field.value)}
                          onChange={(event) => field.onChange(event.target.value)}
                          onBlur={field.onBlur}
                        />
                      </FormControl>
                      <FormDescription>{t("rpmLimitDesc")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tpm_limit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("tpmLimit")}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={mode === "edit" ? (apiKey?.tpm_limit ?? undefined) : undefined}
                          step={1}
                          inputMode="numeric"
                          placeholder={t("rateLimitUnlimited")}
                          value={getNumericInputValue(field.value)}
                          onChange={(event) => field.onChange(event.target.value)}
                          onBlur={field.onBlur}
                        />
                      </FormControl>
                      <FormDescription>{t("tpmLimitDesc")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-cf-md border border-divider-subtle bg-surface-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="type-body-medium text-foreground">{t("spendingRules")}</p>
                  <p className="mt-1 type-body-small text-muted-foreground">
                    {mode === "edit"
                      ? tPortal("keys.spendingRulesTightenHint")
                      : t("spendingRulesDesc")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() =>
                    setSpendingRules((rules) => [
                      ...rules,
                      { period_type: "daily", limit: "", period_hours: "" },
                    ])
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t("addSpendingRule")}
                </Button>
              </div>

              {spendingRules.length === 0 ? (
                <p className="type-body-small text-muted-foreground">{t("spendingRulesEmpty")}</p>
              ) : (
                <div className="space-y-3">
                  {spendingRules.map((rule, index) => (
                    <div
                      key={`portal-spending-rule-${index}`}
                      className="space-y-3 rounded-cf-md border border-divider-subtle bg-background/70 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="type-body-medium text-foreground">
                          {t("spendingRuleLabel", { index: index + 1 })}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setSpendingRules((rules) => rules.filter((_, i) => i !== index))
                          }
                        >
                          {tCommon("delete")}
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {(["daily", "monthly", "rolling"] as const).map((value) => (
                          <Button
                            key={value}
                            type="button"
                            variant={rule.period_type === value ? "default" : "outline"}
                            className="justify-start"
                            onClick={() =>
                              updateRule(index, {
                                period_type: value,
                                ...(value !== "rolling" ? { period_hours: "" } : {}),
                              })
                            }
                          >
                            {t(`quotaPeriodType_${value}`)}
                          </Button>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="type-label-medium text-foreground">
                            {t("quotaLimitUsd")}
                          </label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={rule.limit}
                            onChange={(event) => updateRule(index, { limit: event.target.value })}
                            placeholder={t("quotaLimitPlaceholder")}
                          />
                        </div>
                        {rule.period_type === "rolling" && (
                          <div>
                            <label className="type-label-medium text-foreground">
                              {t("quotaPeriodHours")}
                            </label>
                            <Input
                              type="number"
                              min="1"
                              max="8760"
                              step="1"
                              value={rule.period_hours}
                              onChange={(event) =>
                                updateRule(index, { period_hours: event.target.value })
                              }
                              placeholder={t("quotaPeriodHoursPlaceholder")}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {spendingRulesError && (
                <p className="type-body-small text-destructive" role="alert">
                  {spendingRulesError}
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-divider px-6 py-4">
            <Button type="button" variant="outline" onClick={onClose}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? mode === "create"
                  ? t("creating")
                  : tCommon("loading")
                : mode === "create"
                  ? tCommon("create")
                  : tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
