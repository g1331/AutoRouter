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
import { priorityWeightDefaults } from "../form-values";
import { buildPriorityWeightPayload } from "../section-payloads";
import { upstreamSectionSchemas } from "../section-schemas";

const schema = upstreamSectionSchemas["priority-weight"];
type Values = z.input<typeof schema>;

export function PriorityWeightSection({ upstream }: { upstream: Upstream }) {
  const t = useTranslations("upstreams");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: priorityWeightDefaults(upstream),
  });
  const mutation = useUpdateUpstreamSection();

  const onSave = form.handleSubmit(() => {
    const parsed = schema.parse(form.getValues());
    mutation.mutate(
      { id: upstream.id, payload: buildPriorityWeightPayload(parsed) },
      { onSuccess: () => form.reset(form.getValues()) }
    );
  });

  return (
    <Form {...form}>
      <SectionForm
        title={t("priorityAndWeight")}
        isDirty={form.formState.isDirty}
        isSaving={mutation.isPending}
        onSave={onSave}
        onReset={() => form.reset()}
      >
        <FormField
          control={form.control}
          name="priority"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("priority")}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder={t("priorityPlaceholder")}
                  name={field.name}
                  ref={field.ref}
                  value={getNumericInputValue(field.value)}
                  onBlur={field.onBlur}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </FormControl>
              <FormDescription>{t("priorityDescription")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="weight"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("weight")}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  placeholder={t("weightPlaceholder")}
                  name={field.name}
                  ref={field.ref}
                  value={getNumericInputValue(field.value)}
                  onBlur={field.onBlur}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </FormControl>
              <FormDescription>{t("weightDescription")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </SectionForm>
    </Form>
  );
}
