"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import type { z } from "zod";

import { SectionForm } from "@/components/admin/section-form";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useUpdateUpstreamSection } from "@/hooks/use-upstreams";
import type { Upstream } from "@/types/api";

import { getNumericInputValue } from "../coerce";
import { affinityMigrationDefaults } from "../form-values";
import { buildAffinityMigrationPayload } from "../section-payloads";
import { upstreamSectionSchemas } from "../section-schemas";

const schema = upstreamSectionSchemas["affinity-migration"];
type Values = z.input<typeof schema>;

export function AffinityMigrationSection({ upstream }: { upstream: Upstream }) {
  const t = useTranslations("upstreams");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: affinityMigrationDefaults(upstream),
  });
  const mutation = useUpdateUpstreamSection();

  const affinityMigration = useWatch({ control: form.control, name: "affinity_migration" });

  const onSave = form.handleSubmit(() => {
    const parsed = schema.parse(form.getValues());
    mutation.mutate(
      { id: upstream.id, payload: buildAffinityMigrationPayload(parsed) },
      { onSuccess: () => form.reset(form.getValues()) }
    );
  });

  return (
    <Form {...form}>
      <SectionForm
        title={t("affinityMigrationConfig")}
        isDirty={form.formState.isDirty}
        isSaving={mutation.isPending}
        onSave={onSave}
        onReset={() => form.reset()}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">{t("affinityMigrationEnabled")}</label>
              <p className="text-xs text-muted-foreground">{t("affinityMigrationEnabledDesc")}</p>
            </div>
            <Switch
              aria-label={t("affinityMigrationEnabled")}
              checked={affinityMigration?.enabled ?? false}
              onCheckedChange={(checked) => {
                const currentConfig = form.getValues("affinity_migration");
                form.setValue(
                  "affinity_migration",
                  checked
                    ? {
                        enabled: true,
                        metric: currentConfig?.metric ?? "tokens",
                        threshold: currentConfig?.threshold ?? 50000,
                      }
                    : null,
                  { shouldValidate: true, shouldDirty: true }
                );
              }}
            />
          </div>

          {affinityMigration?.enabled && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("affinityMigrationMetric")}</label>
                <Select
                  value={affinityMigration.metric}
                  onValueChange={(value: "tokens" | "length") => {
                    form.setValue(
                      "affinity_migration",
                      {
                        ...affinityMigration,
                        metric: value,
                      },
                      { shouldValidate: true, shouldDirty: true }
                    );
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tokens">{t("metricTokens")}</SelectItem>
                    <SelectItem value="length">{t("metricLength")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t("affinityMigrationMetricDesc")}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t("affinityMigrationThreshold")}</label>
                <Input
                  type="number"
                  min={1}
                  max={10000000}
                  step={1}
                  placeholder="50000"
                  value={getNumericInputValue(affinityMigration.threshold)}
                  onChange={(e) => {
                    form.setValue(
                      "affinity_migration",
                      {
                        ...affinityMigration,
                        threshold: e.target.value,
                      },
                      { shouldValidate: true, shouldDirty: true }
                    );
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {affinityMigration.metric === "tokens"
                    ? t("affinityMigrationThresholdTokensDesc")
                    : t("affinityMigrationThresholdLengthDesc")}
                </p>
              </div>
            </>
          )}
        </div>
      </SectionForm>
    </Form>
  );
}
