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
import {
  useCreatePortalKey,
  usePortalUpstreamOptions,
  useUpdatePortalKey,
} from "@/hooks/use-portal-keys";
import type { APIKey, APIKeyCreateResponse, APIKeySpendingRule } from "@/types/api";

interface SpendingRuleDraft {
  period_type: "daily" | "monthly" | "rolling";
  limit: string;
  period_hours: string;
}

interface PortalKeyDialogProps {
  mode: "create" | "edit";
  apiKey?: APIKey | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
export function PortalKeyDialog({ mode, apiKey, open, onOpenChange }: PortalKeyDialogProps) {
  const [createdKey, setCreatedKey] = useState<APIKeyCreateResponse | null>(null);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[calc(100vh-2rem)] max-w-xl flex-col overflow-hidden p-0">
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

  const keyFormSchema = z.object({
    name: z.string().min(1, t("keyNameRequired")).max(100),
    description: z.string().max(500).optional(),
    upstream_ids: z.array(z.string()).min(1, t("selectUpstreamsRequired")),
  });

  type KeyForm = z.infer<typeof keyFormSchema>;

  const form = useForm<KeyForm>({
    resolver: zodResolver(keyFormSchema),
    defaultValues:
      mode === "edit" && apiKey
        ? {
            name: apiKey.name,
            description: apiKey.description ?? "",
            upstream_ids: apiKey.upstream_ids,
          }
        : { name: "", description: "", upstream_ids: [] },
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
    if (mode !== "edit" || !upstreamOptions) {
      return;
    }
    const allowedIds = new Set(upstreamOptions.items.map((item) => item.id));
    const current = form.getValues("upstream_ids");
    const reconciled = current.filter((id) => allowedIds.has(id));
    if (reconciled.length !== current.length) {
      form.setValue("upstream_ids", reconciled);
    }
  }, [upstreamOptions, mode, form]);

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

  const onSubmit = async (data: KeyForm) => {
    const rules = parseSpendingRules();
    if (rules === undefined) {
      return;
    }

    try {
      if (mode === "create") {
        const result = await createMutation.mutateAsync({
          name: data.name,
          upstream_ids: data.upstream_ids,
          description: data.description || null,
          spending_rules: rules,
        });
        onCreated(result);
      } else if (apiKey) {
        await updateMutation.mutateAsync({
          id: apiKey.id,
          data: {
            name: data.name,
            description: data.description || null,
            upstream_ids: data.upstream_ids,
            spending_rules: rules,
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

            <FormField
              control={form.control}
              name="upstream_ids"
              render={() => (
                <FormItem>
                  <FormLabel>{t("selectUpstreams")} *</FormLabel>
                  <FormDescription>{tPortal("keys.upstreamsDesc")}</FormDescription>
                  <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-[var(--shape-corner-medium)] border border-[rgb(var(--md-sys-color-outline-variant))] bg-[rgb(var(--md-sys-color-surface-container-low))] p-3">
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
                            <FormItem className="flex items-center space-x-3 space-y-0 rounded-[var(--shape-corner-small)] p-2 transition-colors hover:bg-[rgb(var(--md-sys-color-on-surface)_/_0.08)]">
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

            <div className="space-y-3 rounded-[var(--shape-corner-medium)] border border-[rgb(var(--md-sys-color-outline-variant))] bg-[rgb(var(--md-sys-color-surface-container-low))] p-4">
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
                      className="space-y-3 rounded-[var(--shape-corner-small)] border border-[rgb(var(--md-sys-color-outline-variant))] bg-background/70 p-3"
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
