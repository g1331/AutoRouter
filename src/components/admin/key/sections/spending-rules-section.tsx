"use client";

import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { z } from "zod";

import { SectionForm } from "@/components/admin/section-form";
import { getNumericInputValue } from "@/components/admin/upstream/coerce";
import { Button } from "@/components/ui/button";
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
import { useUpdateApiKeySection } from "@/hooks/use-api-keys";
import type { APIKeyResponse } from "@/types/api";

import { spendingRulesDefaults } from "../form-values";
import { buildSpendingRulesPayload } from "../section-payloads";
import { KEY_ROLLING_DEFAULT_PERIOD_HOURS, apiKeySectionSchemas } from "../section-schemas";

const schema = apiKeySectionSchemas["spending-rules"];
type Values = z.input<typeof schema>;

export function SpendingRulesSection({ apiKey }: { apiKey: APIKeyResponse }) {
  const t = useTranslations("keys");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: spendingRulesDefaults(apiKey),
  });
  const mutation = useUpdateApiKeySection();

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "spending_rules",
  });
  const spendingRules = useWatch({ control: form.control, name: "spending_rules" });

  const onSave = form.handleSubmit(
    () => {
      const parsed = schema.parse(form.getValues());
      // An empty rule set persists `spending_rules: []` (explicit clear); this is
      // the only UI path to remove all rules.
      mutation.mutate(
        { id: apiKey.id, payload: buildSpendingRulesPayload(parsed) },
        { onSuccess: () => form.reset(form.getValues()) }
      );
    },
    () => {
      // Cleared numeric fields fail the zod coercion first, so re-apply localized
      // field errors here (mirrors the former edit-key dialog behavior).
      const rules = form.getValues("spending_rules") ?? [];
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
    }
  );

  return (
    <Form {...form}>
      <SectionForm
        title={t("spendingRules")}
        description={t("spendingRulesDesc")}
        isDirty={form.formState.isDirty}
        isSaving={mutation.isPending}
        onSave={onSave}
        onReset={() => form.reset()}
      >
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => append({ period_type: "daily", limit: 0, period_hours: null })}
          >
            <Plus className="h-3 w-3" />
            {t("addSpendingRule")}
          </Button>
        </div>

        {fields.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("spendingRulesEmpty")}</p>
        )}

        <div className="space-y-3">
          {fields.map((ruleField, index) => {
            const periodType = spendingRules?.[index]?.period_type ?? ruleField.period_type;
            return (
              <div
                key={ruleField.id}
                className="grid grid-cols-[1fr_1fr_auto] items-start gap-2 rounded-cf-sm border border-divider bg-surface-300/30 p-3"
              >
                <FormField
                  control={form.control}
                  name={`spending_rules.${index}.period_type`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{t("quotaPeriodType")}</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          field.onChange(v);
                          if (v === "rolling") {
                            const currentHours = form.getValues(
                              `spending_rules.${index}.period_hours`
                            );
                            if (currentHours == null) {
                              form.setValue(
                                `spending_rules.${index}.period_hours`,
                                KEY_ROLLING_DEFAULT_PERIOD_HOURS,
                                { shouldValidate: true, shouldDirty: true }
                              );
                            }
                          } else {
                            form.setValue(`spending_rules.${index}.period_hours`, null);
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="daily">{t("quotaPeriodType_daily")}</SelectItem>
                          <SelectItem value="monthly">{t("quotaPeriodType_monthly")}</SelectItem>
                          <SelectItem value="rolling">{t("quotaPeriodType_rolling")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <FormField
                    control={form.control}
                    name={`spending_rules.${index}.limit`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">{t("quotaLimitUsd")}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            inputMode="decimal"
                            className="h-8 text-xs"
                            placeholder={t("quotaLimitPlaceholder")}
                            {...field}
                            value={getNumericInputValue(field.value)}
                            onChange={(e) => field.onChange(e.target.value)}
                            onBlur={(e) => {
                              field.onBlur();
                              const raw = e.target.value.trim();
                              if (raw.startsWith(".")) {
                                field.onChange(`0${raw}`);
                              }
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {periodType === "rolling" && (
                    <FormField
                      control={form.control}
                      name={`spending_rules.${index}.period_hours`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">{t("quotaPeriodHours")}</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={8760}
                              step={1}
                              inputMode="numeric"
                              className="h-8 text-xs"
                              placeholder={String(KEY_ROLLING_DEFAULT_PERIOD_HOURS)}
                              value={field.value ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                field.onChange(v === "" ? null : Number(v));
                              }}
                              onBlur={field.onBlur}
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            {t("quotaPeriodHoursPlaceholder")}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-6 h-8 w-8 text-status-error hover:bg-status-error-muted"
                  onClick={() => remove(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </SectionForm>
    </Form>
  );
}
