"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import type { z } from "zod";

import { SectionForm } from "@/components/admin/section-form";
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
import { Textarea } from "@/components/ui/textarea";
import { useUpdateApiKeySection } from "@/hooks/use-api-keys";
import type { APIKeyResponse } from "@/types/api";

import { basicDefaults } from "../form-values";
import { buildBasicPayload } from "../section-payloads";
import { apiKeySectionSchemas } from "../section-schemas";

const schema = apiKeySectionSchemas["basic"];
type Values = z.input<typeof schema>;

export function BasicSection({ apiKey }: { apiKey: APIKeyResponse }) {
  const t = useTranslations("keys");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: basicDefaults(apiKey),
  });
  const mutation = useUpdateApiKeySection();

  const onSave = form.handleSubmit(() => {
    const parsed = schema.parse(form.getValues());
    mutation.mutate(
      { id: apiKey.id, payload: buildBasicPayload(parsed) },
      { onSuccess: () => form.reset(form.getValues()) }
    );
  });

  return (
    <Form {...form}>
      <SectionForm
        title={t("sectionBasicTitle")}
        description={t("sectionBasicDesc")}
        isDirty={form.formState.isDirty}
        isSaving={mutation.isPending}
        onSave={onSave}
        onReset={() => form.reset()}
      >
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
                <Textarea placeholder={t("keyDescriptionPlaceholder")} rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="is_active"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-cf-sm border border-divider p-4">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="space-y-0.5">
                <FormLabel>{t("keyActive")}</FormLabel>
                <FormDescription>{t("keyActiveDesc")}</FormDescription>
              </div>
            </FormItem>
          )}
        />
      </SectionForm>
    </Form>
  );
}
