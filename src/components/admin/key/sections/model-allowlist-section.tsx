"use client";

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import type { z } from "zod";

import { KeyModelAllowlistSection } from "@/components/admin/key-model-allowlist-section";
import { SectionForm } from "@/components/admin/section-form";
import { Form, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useUpdateApiKeySection } from "@/hooks/use-api-keys";
import { useAllUpstreams } from "@/hooks/use-upstreams";
import { collectApiKeyModelCandidates } from "@/lib/api-key-models";
import type { APIKeyResponse } from "@/types/api";

import { modelAllowlistDefaults } from "../form-values";
import { buildModelAllowlistPayload } from "../section-payloads";
import { apiKeySectionSchemas } from "../section-schemas";

const schema = apiKeySectionSchemas["model-allowlist"];
type Values = z.input<typeof schema>;

export function ModelAllowlistSection({ apiKey }: { apiKey: APIKeyResponse }) {
  const t = useTranslations("keys");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: modelAllowlistDefaults(apiKey),
  });
  const mutation = useUpdateApiKeySection();

  const { data: upstreams } = useAllUpstreams();
  // Candidates follow the persisted access mode / grants, not any unsaved edits
  // in the access-grants section — those refetch this component once saved.
  const modelCandidates = useMemo(
    () =>
      collectApiKeyModelCandidates({
        upstreams: upstreams ?? [],
        accessMode: apiKey.access_mode,
        upstreamIds: apiKey.upstream_ids ?? [],
      }),
    [apiKey.access_mode, apiKey.upstream_ids, upstreams]
  );

  const onSave = form.handleSubmit(() => {
    const parsed = schema.parse(form.getValues());
    mutation.mutate(
      { id: apiKey.id, payload: buildModelAllowlistPayload(parsed) },
      { onSuccess: () => form.reset(form.getValues()) }
    );
  });

  return (
    <Form {...form}>
      <SectionForm
        title={t("allowedModels")}
        description={t("allowedModelsDesc")}
        isDirty={form.formState.isDirty}
        isSaving={mutation.isPending}
        onSave={onSave}
        onReset={() => form.reset()}
      >
        <FormField
          control={form.control}
          name="allowed_models"
          render={({ field }) => (
            <FormItem>
              <KeyModelAllowlistSection
                value={field.value ?? []}
                candidates={modelCandidates}
                onChange={(models) => field.onChange(models)}
                hideHeader
              />
              <FormMessage />
            </FormItem>
          )}
        />
      </SectionForm>
    </Form>
  );
}
