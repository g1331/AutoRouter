"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import type { z } from "zod";

import { SectionForm } from "@/components/admin/section-form";
import { getNumericInputValue } from "@/components/admin/upstream/coerce";
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
import { useUpdateApiKeySection } from "@/hooks/use-api-keys";
import { MAX_API_KEY_RATE_LIMIT } from "@/lib/services/api-key-rate-limits";
import type { APIKeyResponse } from "@/types/api";

import { rateLimitsDefaults } from "../form-values";
import { buildRateLimitsPayload } from "../section-payloads";
import { apiKeySectionSchemas } from "../section-schemas";

const schema = apiKeySectionSchemas["rate-limits"];
type Values = z.input<typeof schema>;

/** Independent RPM/TPM controls for the API Key detail page. */
export function RateLimitsSection({ apiKey }: { apiKey: APIKeyResponse }) {
  const t = useTranslations("keys");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: rateLimitsDefaults(apiKey),
  });
  const mutation = useUpdateApiKeySection();

  const onSave = form.handleSubmit(() => {
    const parsed = schema.parse(form.getValues());
    mutation.mutate(
      { id: apiKey.id, payload: buildRateLimitsPayload(parsed) },
      { onSuccess: () => form.reset(form.getValues()) }
    );
  });

  return (
    <Form {...form}>
      <SectionForm
        title={t("rateLimits")}
        description={t("rateLimitsDesc")}
        isDirty={form.formState.isDirty}
        isSaving={mutation.isPending}
        onSave={onSave}
        onReset={() => form.reset()}
      >
        <div className="grid gap-4 md:grid-cols-2">
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
                    max={MAX_API_KEY_RATE_LIMIT}
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
                    max={MAX_API_KEY_RATE_LIMIT}
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
      </SectionForm>
    </Form>
  );
}
