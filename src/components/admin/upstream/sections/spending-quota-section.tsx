"use client";

import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { z } from "zod";

import { SectionForm } from "@/components/admin/section-form";
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
import { useUpdateUpstreamSection } from "@/hooks/use-upstreams";
import type { Upstream } from "@/types/api";

import { getNumericInputValue } from "../coerce";
import { spendingQuotaDefaults } from "../form-values";
import { buildSpendingQuotaPayload } from "../section-payloads";
import { ROLLING_DEFAULT_PERIOD_HOURS, upstreamSectionSchemas } from "../section-schemas";

const schema = upstreamSectionSchemas["spending-quota"];
type Values = z.input<typeof schema>;

export function SpendingQuotaSection({ upstream }: { upstream: Upstream }) {
  const t = useTranslations("upstreams");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: spendingQuotaDefaults(upstream),
  });
  const mutation = useUpdateUpstreamSection();

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "spending_rules",
  });
  const spendingRules = useWatch({ control: form.control, name: "spending_rules" });

  const onSave = form.handleSubmit(() => {
    const parsed = schema.parse(form.getValues());
    mutation.mutate(
      { id: upstream.id, payload: buildSpendingQuotaPayload(parsed) },
      { onSuccess: () => form.reset(form.getValues()) }
    );
  });

  return (
    <Form {...form}>
      <SectionForm
        title={t("spendingQuota")}
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
          <p className="text-xs text-muted-foreground">{t("noSpendingRules")}</p>
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
                      <FormLabel className="text-xs">{t("spendingPeriodType")}</FormLabel>
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
                                ROLLING_DEFAULT_PERIOD_HOURS,
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
                          <SelectItem value="daily">{t("spendingPeriodDaily")}</SelectItem>
                          <SelectItem value="monthly">{t("spendingPeriodMonthly")}</SelectItem>
                          <SelectItem value="rolling">{t("spendingPeriodRolling")}</SelectItem>
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
                        <FormLabel className="text-xs">{t("spendingLimit")}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            inputMode="decimal"
                            className="h-8 text-xs"
                            placeholder={t("spendingLimitPlaceholder")}
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
                          <FormLabel className="text-xs">{t("spendingPeriodHours")}</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={8760}
                              step={1}
                              inputMode="numeric"
                              className="h-8 text-xs"
                              placeholder={String(ROLLING_DEFAULT_PERIOD_HOURS)}
                              value={field.value ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                field.onChange(v === "" ? null : Number(v));
                              }}
                              onBlur={field.onBlur}
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            {t("spendingPeriodHoursDesc")}
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
