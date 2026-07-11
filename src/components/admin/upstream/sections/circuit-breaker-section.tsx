"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import type { z } from "zod";

import { SectionForm } from "@/components/admin/section-form";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { DEFAULT_CIRCUIT_BREAKER_CONFIG } from "@/lib/circuit-breaker-defaults";
import { useUpdateUpstreamSection } from "@/hooks/use-upstreams";
import type { Upstream } from "@/types/api";

import { circuitBreakerDefaults } from "../form-values";
import { buildCircuitBreakerPayload } from "../section-payloads";
import { upstreamSectionSchemas } from "../section-schemas";

const schema = upstreamSectionSchemas["circuit-breaker"];
type Values = z.input<typeof schema>;

const CIRCUIT_BREAKER_PLACEHOLDER_DEFAULTS = {
  failureThreshold: DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold,
  successThreshold: DEFAULT_CIRCUIT_BREAKER_CONFIG.successThreshold,
  openDuration: Math.round(DEFAULT_CIRCUIT_BREAKER_CONFIG.openDuration / 1000),
  probeInterval: Math.round(DEFAULT_CIRCUIT_BREAKER_CONFIG.probeInterval / 1000),
  firstByteTimeout: Math.round(DEFAULT_CIRCUIT_BREAKER_CONFIG.firstByteTimeout / 1000),
  streamIdleTimeout: Math.round(DEFAULT_CIRCUIT_BREAKER_CONFIG.streamIdleTimeout / 1000),
};

export function CircuitBreakerSection({ upstream }: { upstream: Upstream }) {
  const t = useTranslations("upstreams");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: circuitBreakerDefaults(upstream),
  });
  const mutation = useUpdateUpstreamSection();

  const circuitBreakerConfig = useWatch({ control: form.control, name: "circuit_breaker_config" });

  const updateField = (
    key:
      | "failure_threshold"
      | "success_threshold"
      | "open_duration"
      | "probe_interval"
      | "first_byte_timeout"
      | "stream_idle_timeout",
    rawValue: string
  ) => {
    const val = rawValue ? parseInt(rawValue, 10) : undefined;
    const currentConfig = form.getValues("circuit_breaker_config") || {};
    form.setValue(
      "circuit_breaker_config",
      val !== undefined ? { ...currentConfig, [key]: val } : null,
      {
        shouldValidate: true,
        shouldDirty: true,
      }
    );
  };

  const onSave = form.handleSubmit(() => {
    const parsed = schema.parse(form.getValues());
    mutation.mutate(
      { id: upstream.id, payload: buildCircuitBreakerPayload(parsed) },
      { onSuccess: () => form.reset(form.getValues()) }
    );
  });

  return (
    <Form {...form}>
      <SectionForm
        title={t("circuitBreakerConfig")}
        isDirty={form.formState.isDirty}
        isSaving={mutation.isPending}
        onSave={onSave}
        onReset={() => form.reset()}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("failureThreshold")}</label>
            <Input
              type="number"
              min={1}
              max={100}
              placeholder={t("circuitBreakerUseDefaultPlaceholder", {
                value: CIRCUIT_BREAKER_PLACEHOLDER_DEFAULTS.failureThreshold,
              })}
              value={circuitBreakerConfig?.failure_threshold ?? ""}
              onChange={(e) => updateField("failure_threshold", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("failureThresholdDesc")}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t("successThreshold")}</label>
            <Input
              type="number"
              min={1}
              max={100}
              placeholder={t("circuitBreakerUseDefaultPlaceholder", {
                value: CIRCUIT_BREAKER_PLACEHOLDER_DEFAULTS.successThreshold,
              })}
              value={circuitBreakerConfig?.success_threshold ?? ""}
              onChange={(e) => updateField("success_threshold", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("successThresholdDesc")}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t("openDuration")}</label>
            <Input
              type="number"
              min={1}
              max={300}
              step={1}
              placeholder={t("circuitBreakerUseDefaultPlaceholder", {
                value: CIRCUIT_BREAKER_PLACEHOLDER_DEFAULTS.openDuration,
              })}
              value={circuitBreakerConfig?.open_duration ?? ""}
              onChange={(e) => updateField("open_duration", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("openDurationDesc")}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t("probeInterval")}</label>
            <Input
              type="number"
              min={1}
              max={60}
              step={1}
              placeholder={t("circuitBreakerUseDefaultPlaceholder", {
                value: CIRCUIT_BREAKER_PLACEHOLDER_DEFAULTS.probeInterval,
              })}
              value={circuitBreakerConfig?.probe_interval ?? ""}
              onChange={(e) => updateField("probe_interval", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("probeIntervalDesc")}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t("firstByteTimeout")}</label>
            <Input
              type="number"
              min={1}
              max={300}
              step={1}
              placeholder={t("circuitBreakerUseDefaultPlaceholder", {
                value: CIRCUIT_BREAKER_PLACEHOLDER_DEFAULTS.firstByteTimeout,
              })}
              value={circuitBreakerConfig?.first_byte_timeout ?? ""}
              onChange={(e) => updateField("first_byte_timeout", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("firstByteTimeoutDesc")}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t("streamIdleTimeout")}</label>
            <Input
              type="number"
              min={1}
              max={300}
              step={1}
              placeholder={t("circuitBreakerUseDefaultPlaceholder", {
                value: CIRCUIT_BREAKER_PLACEHOLDER_DEFAULTS.streamIdleTimeout,
              })}
              value={circuitBreakerConfig?.stream_idle_timeout ?? ""}
              onChange={(e) => updateField("stream_idle_timeout", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("streamIdleTimeoutDesc")}</p>
          </div>
        </div>
      </SectionForm>
    </Form>
  );
}
