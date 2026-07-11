"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import type { z } from "zod";

import { SectionForm } from "@/components/admin/section-form";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { useUpdateUpstreamSection } from "@/hooks/use-upstreams";
import type { Upstream } from "@/types/api";

import { getNumericInputValue } from "../coerce";
import { capacityControlDefaults } from "../form-values";
import { buildCapacityControlPayload } from "../section-payloads";
import { DEFAULT_QUEUE_POLICY_TIMEOUT_MS, upstreamSectionSchemas } from "../section-schemas";

const schema = upstreamSectionSchemas["capacity-control"];
type Values = z.input<typeof schema>;

export function CapacityControlSection({ upstream }: { upstream: Upstream }) {
  const t = useTranslations("upstreams");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: capacityControlDefaults(upstream),
  });
  const mutation = useUpdateUpstreamSection();

  const queuePolicy = useWatch({ control: form.control, name: "queue_policy" });
  const queuePolicyTimeoutMs =
    typeof queuePolicy?.timeout_ms === "number"
      ? queuePolicy.timeout_ms
      : DEFAULT_QUEUE_POLICY_TIMEOUT_MS;
  const queuePolicyMaxQueueLength =
    typeof queuePolicy?.max_queue_length === "number" ? queuePolicy.max_queue_length : null;

  const onSave = form.handleSubmit(() => {
    const parsed = schema.parse(form.getValues());
    mutation.mutate(
      { id: upstream.id, payload: buildCapacityControlPayload(parsed) },
      { onSuccess: () => form.reset(form.getValues()) }
    );
  });

  return (
    <Form {...form}>
      <SectionForm
        title={t("capacityAndQueue")}
        isDirty={form.formState.isDirty}
        isSaving={mutation.isPending}
        onSave={onSave}
        onReset={() => form.reset()}
      >
        <FormField
          control={form.control}
          name="max_concurrency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("maxConcurrency")}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  placeholder={t("maxConcurrencyPlaceholder")}
                  value={field.value ?? ""}
                  onChange={(e) => {
                    const rawValue = e.target.value.trim();
                    field.onChange(rawValue === "" ? null : Number(rawValue));
                  }}
                />
              </FormControl>
              <FormDescription>{t("maxConcurrencyDesc")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="queue_policy.enabled"
          render={({ field }) => (
            <FormItem className="rounded-cf-sm border border-divider/50 bg-surface-200/35 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <FormLabel className="m-0 text-sm font-medium text-foreground">
                    {t("queuePolicyEnabled")}
                  </FormLabel>
                  <FormDescription className="m-0 text-xs">
                    {t("queuePolicyEnabledDesc")}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    aria-label={t("queuePolicyEnabled")}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className={
                    field.value
                      ? "border-status-warning/45 text-status-warning"
                      : "border-divider text-muted-foreground"
                  }
                >
                  {field.value ? t("queuePolicyEnabledBadge") : t("queuePolicyDisabled")}
                </Badge>
                <Badge variant="outline" className="border-divider text-muted-foreground">
                  {t("queuePolicySummaryTimeout", { timeoutMs: queuePolicyTimeoutMs })}
                </Badge>
                <Badge variant="outline" className="border-divider text-muted-foreground">
                  {queuePolicyMaxQueueLength == null
                    ? t("queuePolicySummaryLengthUnlimited")
                    : t("queuePolicySummaryLength", { maxQueueLength: queuePolicyMaxQueueLength })}
                </Badge>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {queuePolicy?.enabled && (
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="queue_policy.timeout_ms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("queuePolicyTimeout")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      placeholder={t("queuePolicyTimeoutPlaceholder")}
                      value={getNumericInputValue(field.value)}
                      onChange={(e) => {
                        const rawValue = e.target.value.trim();
                        field.onChange(rawValue === "" ? "" : Number(rawValue));
                      }}
                    />
                  </FormControl>
                  <FormDescription>{t("queuePolicyTimeoutDesc")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="queue_policy.max_queue_length"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("queuePolicyMaxQueueLength")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      placeholder={t("queuePolicyMaxQueueLengthPlaceholder")}
                      value={getNumericInputValue(field.value)}
                      onChange={(e) => {
                        const rawValue = e.target.value.trim();
                        field.onChange(rawValue === "" ? null : Number(rawValue));
                      }}
                    />
                  </FormControl>
                  <FormDescription>{t("queuePolicyMaxQueueLengthDesc")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}
      </SectionForm>
    </Form>
  );
}
