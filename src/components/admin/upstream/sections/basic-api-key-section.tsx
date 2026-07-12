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
import { PasswordInput } from "@/components/ui/password-input";
import { useUpdateUpstreamSection } from "@/hooks/use-upstreams";
import type { Upstream } from "@/types/api";

import { apiKeyDefaults } from "../form-values";
import { buildApiKeyPayload } from "../section-payloads";
import { upstreamSectionSchemas } from "../section-schemas";

const schema = upstreamSectionSchemas["basic-api-key"];
type Values = z.input<typeof schema>;

/**
 * Write-only API key. The field starts empty and an empty value keeps the
 * current key (the payload omits `api_key` entirely). Only a non-empty value is
 * sent; after a successful save the field is cleared back to empty.
 */
export function BasicApiKeySection({ upstream }: { upstream: Upstream }) {
  const t = useTranslations("upstreams");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: apiKeyDefaults(),
  });
  const mutation = useUpdateUpstreamSection();

  const onSave = form.handleSubmit(() => {
    const parsed = schema.parse(form.getValues());
    const payload = buildApiKeyPayload(parsed);
    if (payload.api_key === undefined) {
      return;
    }
    mutation.mutate(
      { id: upstream.id, payload },
      { onSuccess: () => form.reset(apiKeyDefaults()) }
    );
  });

  return (
    <Form {...form}>
      <SectionForm
        title={t("apiKey")}
        isDirty={form.formState.isDirty}
        isSaving={mutation.isPending}
        onSave={onSave}
        onReset={() => form.reset(apiKeyDefaults())}
      >
        <FormField
          control={form.control}
          name="api_key"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("apiKey")}</FormLabel>
              <FormControl>
                <PasswordInput
                  {...field}
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  data-1p-ignore="true"
                  data-lpignore="true"
                  placeholder={t("apiKeyKeepPlaceholder")}
                />
              </FormControl>
              <FormDescription>{t("apiKeyEditHint")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </SectionForm>
    </Form>
  );
}
