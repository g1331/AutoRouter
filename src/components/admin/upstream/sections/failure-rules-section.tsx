"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import type { z } from "zod";

import { SectionForm } from "@/components/admin/section-form";
import { UpstreamFailureRulesEditor } from "@/components/admin/upstream-failure-rules-editor";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { useUpdateUpstreamSection } from "@/hooks/use-upstreams";
import type { Upstream } from "@/types/api";

import { failureRulesDefaults } from "../form-values";
import { buildFailureRulesPayload } from "../section-payloads";
import { upstreamSectionSchemas } from "../section-schemas";

const schema = upstreamSectionSchemas["failure-rules"];
type Values = z.input<typeof schema>;

export function FailureRulesSection({ upstream }: { upstream: Upstream }) {
  const t = useTranslations("upstreams");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: failureRulesDefaults(upstream),
  });
  const mutation = useUpdateUpstreamSection();

  const onSave = form.handleSubmit(() => {
    const parsed = schema.parse(form.getValues());
    mutation.mutate(
      { id: upstream.id, payload: buildFailureRulesPayload(parsed) },
      { onSuccess: () => form.reset(form.getValues()) }
    );
  });

  return (
    <div className="space-y-4">
      <Form {...form}>
        <SectionForm
          title={t("failureRulesConfig")}
          isDirty={form.formState.isDirty}
          isSaving={mutation.isPending}
          onSave={onSave}
          onReset={() => form.reset()}
        >
          <FormField
            control={form.control}
            name="failure_rule_config.use_global_rules"
            render={({ field }) => (
              <FormItem className="rounded-cf-sm border border-divider/50 bg-surface-200/35 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <FormLabel className="m-0 text-sm font-medium text-foreground">
                      {t("useGlobalFailureRules")}
                    </FormLabel>
                    <FormDescription className="m-0 text-xs">
                      {t("useGlobalFailureRulesDesc")}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      aria-label={t("useGlobalFailureRules")}
                      checked={field.value ?? true}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </SectionForm>
      </Form>

      <UpstreamFailureRulesEditor upstreamId={upstream.id} />
    </div>
  );
}
