"use client";

import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { z } from "zod";

import { RouteCapabilityMultiSelect } from "@/components/admin/route-capability-badges";
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
import { statusTone } from "@/lib/status-tone";
import { cn } from "@/lib/utils";
import type { Upstream } from "@/types/api";

import { resolveEndpointPreview } from "../endpoint-preview";
import { routeEndpointDefaults } from "../form-values";
import { buildRouteEndpointPayload } from "../section-payloads";
import { upstreamSectionSchemas } from "../section-schemas";

const schema = upstreamSectionSchemas["basic-route-endpoint"];
type Values = z.input<typeof schema>;

export function BasicRouteEndpointSection({ upstream }: { upstream: Upstream }) {
  const t = useTranslations("upstreams");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: routeEndpointDefaults(upstream),
  });
  const mutation = useUpdateUpstreamSection();

  const watchedBaseUrl = useWatch({ control: form.control, name: "base_url" });
  const watchedRouteCapabilities = useWatch({ control: form.control, name: "route_capabilities" });
  const endpointPreview = useMemo(
    () => resolveEndpointPreview(watchedBaseUrl ?? "", watchedRouteCapabilities),
    [watchedBaseUrl, watchedRouteCapabilities]
  );

  const onSave = form.handleSubmit(() => {
    const parsed = schema.parse(form.getValues());
    mutation.mutate(
      { id: upstream.id, payload: buildRouteEndpointPayload(parsed) },
      { onSuccess: () => form.reset(form.getValues()) }
    );
  });

  return (
    <Form {...form}>
      <SectionForm
        title={t("baseUrl")}
        isDirty={form.formState.isDirty}
        isSaving={mutation.isPending}
        onSave={onSave}
        onReset={() => form.reset()}
      >
        <FormField
          control={form.control}
          name="route_capabilities"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("routeCapabilities")}</FormLabel>
              <FormControl>
                <RouteCapabilityMultiSelect
                  selected={field.value ?? []}
                  onChange={(next) => field.onChange(next)}
                />
              </FormControl>
              <FormDescription>{t("routeCapabilitiesDescription")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="base_url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("baseUrl")} *</FormLabel>
              <FormControl>
                <Input type="url" placeholder={t("baseUrlPlaceholder")} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {endpointPreview?.autoAppendV1Applied && (
          <p className={cn("rounded-cf-sm border px-3 py-2 text-xs", statusTone("info"))}>
            {t("baseUrlAutoAppendV1Hint")}
          </p>
        )}
        {endpointPreview?.duplicateV1Warning && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-cf-sm border px-3 py-2 text-xs",
              statusTone("warning")
            )}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{t("baseUrlDuplicateV1Warning")}</span>
          </div>
        )}
        <div className="rounded-cf-sm border border-divider bg-surface-200/45 px-3 py-2.5">
          <div className="text-xs font-medium text-muted-foreground">
            {t("finalRequestPreview")}
          </div>
          <code className="mt-1 block break-all rounded-cf-sm border border-divider bg-surface-300/65 px-2 py-1 font-mono text-[11px] text-foreground">
            {endpointPreview?.previewUrl ?? t("finalRequestPreviewEmpty")}
          </code>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {endpointPreview
              ? `${t("finalRequestPreviewPath")}: /${endpointPreview.previewPath}`
              : t("finalRequestPreviewHint")}
          </p>
        </div>
      </SectionForm>
    </Form>
  );
}
