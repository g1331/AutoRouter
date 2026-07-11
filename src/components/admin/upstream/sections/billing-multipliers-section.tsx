"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import type { z } from "zod";

import { SectionForm } from "@/components/admin/section-form";
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
import { useUpdateUpstreamSection } from "@/hooks/use-upstreams";
import type { Upstream } from "@/types/api";

import { getNumericInputValue } from "../coerce";
import { billingMultipliersDefaults } from "../form-values";
import { buildBillingMultipliersPayload } from "../section-payloads";
import { upstreamSectionSchemas } from "../section-schemas";

const schema = upstreamSectionSchemas["billing-multipliers"];
type Values = z.input<typeof schema>;

export function BillingMultipliersSection({ upstream }: { upstream: Upstream }) {
  const t = useTranslations("upstreams");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: billingMultipliersDefaults(upstream),
  });
  const mutation = useUpdateUpstreamSection();

  const onSave = form.handleSubmit(() => {
    const parsed = schema.parse(form.getValues());
    mutation.mutate(
      { id: upstream.id, payload: buildBillingMultipliersPayload(parsed) },
      { onSuccess: () => form.reset(form.getValues()) }
    );
  });

  return (
    <Form {...form}>
      <SectionForm
        title={t("billingMultipliers")}
        isDirty={form.formState.isDirty}
        isSaving={mutation.isPending}
        onSave={onSave}
        onReset={() => form.reset()}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="billing_input_multiplier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("billingInputMultiplier")}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    inputMode="decimal"
                    name={field.name}
                    ref={field.ref}
                    value={getNumericInputValue(field.value)}
                    onBlur={field.onBlur}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </FormControl>
                <FormDescription>{t("billingInputMultiplierDesc")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="billing_output_multiplier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("billingOutputMultiplier")}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    inputMode="decimal"
                    name={field.name}
                    ref={field.ref}
                    value={getNumericInputValue(field.value)}
                    onBlur={field.onBlur}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </FormControl>
                <FormDescription>{t("billingOutputMultiplierDesc")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </SectionForm>
    </Form>
  );
}
