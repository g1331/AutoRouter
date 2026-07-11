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

import { basicProfileDefaults } from "../form-values";
import { buildBasicProfilePayload } from "../section-payloads";
import { upstreamSectionSchemas } from "../section-schemas";

const schema = upstreamSectionSchemas["basic-profile"];
type Values = z.input<typeof schema>;

/**
 * Profile section — renders and submits ONLY `official_website_url`. The former
 * `description` field is a confirmed dead field (no DB column; the create/update
 * schemas silently strip it), so it is intentionally absent here.
 */
export function BasicProfileSection({ upstream }: { upstream: Upstream }) {
  const t = useTranslations("upstreams");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: basicProfileDefaults(upstream),
  });
  const mutation = useUpdateUpstreamSection();

  const onSave = form.handleSubmit(() => {
    const parsed = schema.parse(form.getValues());
    mutation.mutate(
      { id: upstream.id, payload: buildBasicProfilePayload(parsed) },
      { onSuccess: () => form.reset(form.getValues()) }
    );
  });

  return (
    <Form {...form}>
      <SectionForm
        title={t("officialWebsiteUrl")}
        isDirty={form.formState.isDirty}
        isSaving={mutation.isPending}
        onSave={onSave}
        onReset={() => form.reset()}
      >
        <FormField
          control={form.control}
          name="official_website_url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("officialWebsiteUrl")}</FormLabel>
              <FormControl>
                <Input
                  type="url"
                  placeholder={t("officialWebsiteUrlPlaceholder")}
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormDescription>{t("officialWebsiteUrlDesc")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </SectionForm>
    </Form>
  );
}
