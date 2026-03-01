"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateUpstream, useUpdateUpstream } from "@/hooks/use-upstreams";
import type { RouteCapability, Upstream } from "@/types/api";
import { TagInput } from "@/components/ui/tag-input";
import { KeyValueInput } from "@/components/ui/key-value-input";
import { Switch } from "@/components/ui/switch";
import { ROUTE_CAPABILITY_VALUES, areSingleProviderCapabilities } from "@/lib/route-capabilities";
import { RouteCapabilityMultiSelect } from "@/components/admin/route-capability-badges";

interface UpstreamFormDialogProps {
  upstream?: Upstream | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
}

// Circuit breaker config schema
const circuitBreakerConfigSchema = z
  .object({
    failure_threshold: z.number().int().min(1).max(100).optional(),
    success_threshold: z.number().int().min(1).max(100).optional(),
    open_duration: z.number().int().min(1).max(300).optional(),
    probe_interval: z.number().int().min(1).max(60).optional(),
  })
  .nullable();

// Affinity migration config schema
const affinityMigrationConfigSchema = z
  .object({
    enabled: z.boolean(),
    metric: z.enum(["tokens", "length"]),
    threshold: z.number().int().min(1).max(10000000),
  })
  .nullable();

const spendingRuleSchema = z.object({
  period_type: z.enum(["daily", "monthly", "rolling"]),
  limit: z.coerce.number().positive(),
  period_hours: z.number().int().min(1).max(8760).nullable(),
});

// Schema for create mode - api_key is required
const createUpstreamFormSchema = z
  .object({
    name: z.string().min(1).max(100),
    base_url: z.string().url(),
    api_key: z.string().min(1),
    description: z.string().max(500),
    priority: z.number().int().min(0).max(100),
    weight: z.number().int().min(1).max(100),
    billing_input_multiplier: z.number().min(0).max(100),
    billing_output_multiplier: z.number().min(0).max(100),
    spending_rules: z.array(spendingRuleSchema),
    route_capabilities: z.array(z.enum(ROUTE_CAPABILITY_VALUES)),
    allowed_models: z.array(z.string()).nullable(),
    model_redirects: z.record(z.string(), z.string()).nullable(),
    circuit_breaker_config: circuitBreakerConfigSchema,
    affinity_migration: affinityMigrationConfigSchema,
  })
  .refine((data) => areSingleProviderCapabilities(data.route_capabilities), {
    message: "All route capabilities must belong to the same provider",
    path: ["route_capabilities"],
  });

// Schema for edit mode - api_key is optional (leave empty to keep unchanged)
const editUpstreamFormSchema = z
  .object({
    name: z.string().min(1).max(100),
    base_url: z.string().url(),
    api_key: z.string(),
    description: z.string().max(500),
    priority: z.number().int().min(0).max(100),
    weight: z.number().int().min(1).max(100),
    billing_input_multiplier: z.number().min(0).max(100),
    billing_output_multiplier: z.number().min(0).max(100),
    spending_rules: z.array(spendingRuleSchema),
    route_capabilities: z.array(z.enum(ROUTE_CAPABILITY_VALUES)),
    allowed_models: z.array(z.string()).nullable(),
    model_redirects: z.record(z.string(), z.string()).nullable(),
    circuit_breaker_config: circuitBreakerConfigSchema,
    affinity_migration: affinityMigrationConfigSchema,
  })
  .refine((data) => areSingleProviderCapabilities(data.route_capabilities), {
    message: "All route capabilities must belong to the same provider",
    path: ["route_capabilities"],
  });

type UpstreamFormValues = z.input<typeof editUpstreamFormSchema>;
type UpstreamFormData = z.output<typeof editUpstreamFormSchema>;

function spendingRulesToApi(
  rules: UpstreamFormData["spending_rules"]
): { period_type: "daily" | "monthly" | "rolling"; limit: number; period_hours?: number }[] | null {
  if (!rules || rules.length === 0) return null;
  return rules.map((r) => ({
    period_type: r.period_type,
    limit: r.limit,
    ...(r.period_type === "rolling" && r.period_hours ? { period_hours: r.period_hours } : {}),
  }));
}

/**
 * M3 Upstream Form Dialog (Create/Edit)
 */
export function UpstreamFormDialog({
  upstream,
  open,
  onOpenChange,
  trigger,
}: UpstreamFormDialogProps) {
  const isEdit = !!upstream;
  const activeSchema = isEdit ? editUpstreamFormSchema : createUpstreamFormSchema;
  const createMutation = useCreateUpstream();
  const updateMutation = useUpdateUpstream();
  const t = useTranslations("upstreams");
  const tCommon = useTranslations("common");

  const form = useForm<UpstreamFormValues>({
    resolver: zodResolver(activeSchema),
    defaultValues: {
      name: "",
      base_url: "",
      api_key: "",
      description: "",
      priority: 0,
      weight: 1,
      billing_input_multiplier: 1,
      billing_output_multiplier: 1,
      spending_rules: [],
      route_capabilities: [],
      allowed_models: null,
      model_redirects: null,
      circuit_breaker_config: null,
      affinity_migration: null,
    },
  });

  // Watch circuit_breaker_config for controlled inputs
  const circuitBreakerConfig = useWatch({
    control: form.control,
    name: "circuit_breaker_config",
  });

  // Watch affinity_migration for controlled inputs
  const affinityMigration = useWatch({
    control: form.control,
    name: "affinity_migration",
  });

  // Field array for spending rules
  const {
    fields: spendingRuleFields,
    append: appendSpendingRule,
    remove: removeSpendingRule,
  } = useFieldArray({
    control: form.control,
    name: "spending_rules",
  });

  useEffect(() => {
    if (upstream && open) {
      form.reset({
        name: upstream.name,
        base_url: upstream.base_url,
        api_key: "",
        description: upstream.description || "",
        priority: upstream.priority ?? 0,
        weight: upstream.weight ?? 1,
        billing_input_multiplier: upstream.billing_input_multiplier ?? 1,
        billing_output_multiplier: upstream.billing_output_multiplier ?? 1,
        spending_rules: (upstream.spending_rules ?? []).map((r) => ({
          period_type: r.period_type as "daily" | "monthly" | "rolling",
          limit: r.limit,
          period_hours: r.period_hours ?? null,
        })),
        route_capabilities: upstream.route_capabilities || [],
        allowed_models: upstream.allowed_models || null,
        model_redirects: upstream.model_redirects || null,
        circuit_breaker_config: upstream.circuit_breaker?.config
          ? {
              failure_threshold: upstream.circuit_breaker.config.failure_threshold,
              success_threshold: upstream.circuit_breaker.config.success_threshold,
              open_duration: upstream.circuit_breaker.config.open_duration,
              probe_interval: upstream.circuit_breaker.config.probe_interval,
            }
          : null,
        affinity_migration: upstream.affinity_migration,
      });
    } else if (!open) {
      form.reset({
        name: "",
        base_url: "",
        api_key: "",
        description: "",
        priority: 0,
        weight: 1,
        billing_input_multiplier: 1,
        billing_output_multiplier: 1,
        spending_rules: [],
        route_capabilities: [],
        allowed_models: null,
        model_redirects: null,
        circuit_breaker_config: null,
        affinity_migration: null,
      });
    }
  }, [upstream, open, form]);

  const onSubmit = async (values: UpstreamFormValues) => {
    try {
      const data = activeSchema.parse(values) as UpstreamFormData;
      if (isEdit) {
        // 只有填写了 api_key 才更新
        const updateData: {
          name: string;
          base_url: string;
          api_key?: string;
          description: string | null;
          priority?: number;
          weight?: number;
          billing_input_multiplier?: number;
          billing_output_multiplier?: number;
          spending_rules?:
            | {
                period_type: "daily" | "monthly" | "rolling";
                limit: number;
                period_hours?: number;
              }[]
            | null;
          route_capabilities?: RouteCapability[] | null;
          allowed_models?: string[] | null;
          model_redirects?: Record<string, string> | null;
          circuit_breaker_config?: {
            failure_threshold?: number;
            success_threshold?: number;
            open_duration?: number;
            probe_interval?: number;
          } | null;
          affinity_migration?: {
            enabled: boolean;
            metric: "tokens" | "length";
            threshold: number;
          } | null;
        } = {
          name: data.name,
          base_url: data.base_url,
          description: data.description || null,
          priority: data.priority,
          weight: data.weight,
          billing_input_multiplier: data.billing_input_multiplier,
          billing_output_multiplier: data.billing_output_multiplier,
          spending_rules: spendingRulesToApi(data.spending_rules),
          route_capabilities: data.route_capabilities,
          allowed_models: data.allowed_models,
          model_redirects: data.model_redirects,
          circuit_breaker_config: data.circuit_breaker_config,
          affinity_migration: data.affinity_migration,
        };
        if (data.api_key) {
          updateData.api_key = data.api_key;
        }
        await updateMutation.mutateAsync({
          id: upstream.id,
          data: updateData,
        });
      } else {
        await createMutation.mutateAsync({
          name: data.name,
          base_url: data.base_url,
          api_key: data.api_key!,
          description: data.description || null,
          priority: data.priority,
          weight: data.weight,
          billing_input_multiplier: data.billing_input_multiplier,
          billing_output_multiplier: data.billing_output_multiplier,
          spending_rules: spendingRulesToApi(data.spending_rules),
          route_capabilities: data.route_capabilities,
          allowed_models: data.allowed_models,
          model_redirects: data.model_redirects,
          circuit_breaker_config: data.circuit_breaker_config,
          affinity_migration: data.affinity_migration,
        });
      }

      onOpenChange(false);
      form.reset();
    } catch {
      // Error already handled by mutation onError
    }
  };

  const dialogContent = (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{isEdit ? t("editUpstreamTitle") : t("createUpstreamTitle")}</DialogTitle>
        <DialogDescription>{t("createUpstreamDesc")}</DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("upstreamName")} *</FormLabel>
                <FormControl>
                  <Input placeholder={t("upstreamNamePlaceholder")} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

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

          <FormField
            control={form.control}
            name="api_key"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("apiKey")} *</FormLabel>
                <FormControl>
                  <Input type="password" placeholder={t("apiKeyPlaceholder")} {...field} />
                </FormControl>
                <FormDescription>{isEdit ? t("apiKeyEditHint") : undefined}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

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
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
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
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 1)}
                  />
                </FormControl>
                <FormDescription>{t("weightDescription")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="border-t pt-6 mt-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              {t("billingMultipliers")}
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="billing_input_multiplier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("billingInputMultiplier")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        inputMode="decimal"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormDescription>{t("billingInputMultiplierDesc")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="billing_output_multiplier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("billingOutputMultiplier")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        inputMode="decimal"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormDescription>{t("billingOutputMultiplierDesc")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Spending Quota Section */}
          <div className="border-t pt-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t("spendingQuota")}</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() =>
                  appendSpendingRule({ period_type: "daily", limit: 0, period_hours: null })
                }
              >
                <Plus className="h-3 w-3" />
                {t("addSpendingRule")}
              </Button>
            </div>

            {spendingRuleFields.length === 0 && (
              <p className="text-xs text-muted-foreground">{t("noSpendingRules")}</p>
            )}

            <div className="space-y-3">
              {spendingRuleFields.map((ruleField, index) => {
                const periodType = form.watch(`spending_rules.${index}.period_type`);
                return (
                  <div
                    key={ruleField.id}
                    className="grid grid-cols-[1fr_1fr_auto] items-start gap-2 rounded-cf-sm border border-divider bg-surface-300/30 p-3"
                  >
                    <FormField
                      control={form.control}
                      name={`spending_rules.${index}.period_type`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">{t("spendingPeriodType")}</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={(v) => {
                              field.onChange(v);
                              if (v !== "rolling") {
                                form.setValue(`spending_rules.${index}.period_hours`, null);
                              }
                            }}
                          >
                            <FormControl>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="daily">{t("spendingPeriodDaily")}</SelectItem>
                              <SelectItem value="monthly">{t("spendingPeriodMonthly")}</SelectItem>
                              <SelectItem value="rolling">{t("spendingPeriodRolling")}</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-2">
                      <FormField
                        control={form.control}
                        name={`spending_rules.${index}.limit`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">{t("spendingLimit")}</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                step={0.01}
                                inputMode="decimal"
                                className="h-8 text-xs"
                                placeholder={t("spendingLimitPlaceholder")}
                                {...field}
                                value={
                                  field.value === 0
                                    ? ""
                                    : typeof field.value === "number" ||
                                        typeof field.value === "string"
                                      ? field.value
                                      : ""
                                }
                                onChange={(e) => field.onChange(e.target.value)}
                                onBlur={(e) => {
                                  field.onBlur();
                                  const raw = e.target.value.trim();
                                  if (raw.startsWith(".")) {
                                    field.onChange(`0${raw}`);
                                  }
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {periodType === "rolling" && (
                        <FormField
                          control={form.control}
                          name={`spending_rules.${index}.period_hours`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">{t("spendingPeriodHours")}</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={1}
                                  max={8760}
                                  step={1}
                                  inputMode="numeric"
                                  className="h-8 text-xs"
                                  placeholder="24"
                                  value={field.value ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    field.onChange(v === "" ? null : Number(v));
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-6 h-8 w-8 text-status-error hover:bg-status-error-muted"
                      onClick={() => removeSpendingRule(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("upstreamDescription")}</FormLabel>
                <FormControl>
                  <Textarea placeholder={t("upstreamDescriptionPlaceholder")} rows={3} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Model-based Routing Section */}
          <div className="border-t pt-6 mt-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              {t("modelBasedRouting")}
            </h3>

            <FormField
              control={form.control}
              name="allowed_models"
              render={({ field }) => (
                <FormItem className="mt-4">
                  <FormLabel>{t("allowedModels")}</FormLabel>
                  <FormControl>
                    <TagInput
                      placeholder={t("allowedModelsPlaceholder")}
                      tags={field.value || []}
                      onTagsChange={(tags) => field.onChange(tags.length > 0 ? tags : null)}
                    />
                  </FormControl>
                  <FormDescription>{t("allowedModelsDescription")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="model_redirects"
              render={({ field }) => (
                <FormItem className="mt-4">
                  <FormLabel>{t("modelRedirects")}</FormLabel>
                  <FormControl>
                    <KeyValueInput
                      placeholder={t("modelRedirectsPlaceholder")}
                      entries={field.value || {}}
                      onEntriesChange={(entries) =>
                        field.onChange(Object.keys(entries).length > 0 ? entries : null)
                      }
                      keyLabel={t("sourceModel")}
                      valueLabel={t("targetModel")}
                    />
                  </FormControl>
                  <FormDescription>{t("modelRedirectsDescription")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Circuit Breaker Configuration Section */}
          <div className="border-t pt-6 mt-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              {t("circuitBreakerConfig")}
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("failureThreshold")}</label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  placeholder="5"
                  value={circuitBreakerConfig?.failure_threshold ?? ""}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                    const currentConfig = form.getValues("circuit_breaker_config") || {};
                    form.setValue(
                      "circuit_breaker_config",
                      val !== undefined ? { ...currentConfig, failure_threshold: val } : null,
                      { shouldValidate: true }
                    );
                  }}
                />
                <p className="text-xs text-muted-foreground">{t("failureThresholdDesc")}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t("successThreshold")}</label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  placeholder="2"
                  value={circuitBreakerConfig?.success_threshold ?? ""}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                    const currentConfig = form.getValues("circuit_breaker_config") || {};
                    form.setValue(
                      "circuit_breaker_config",
                      val !== undefined ? { ...currentConfig, success_threshold: val } : null,
                      { shouldValidate: true }
                    );
                  }}
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
                  placeholder="300"
                  value={circuitBreakerConfig?.open_duration ?? ""}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                    const currentConfig = form.getValues("circuit_breaker_config") || {};
                    form.setValue(
                      "circuit_breaker_config",
                      val !== undefined ? { ...currentConfig, open_duration: val } : null,
                      { shouldValidate: true }
                    );
                  }}
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
                  placeholder="30"
                  value={circuitBreakerConfig?.probe_interval ?? ""}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                    const currentConfig = form.getValues("circuit_breaker_config") || {};
                    form.setValue(
                      "circuit_breaker_config",
                      val !== undefined ? { ...currentConfig, probe_interval: val } : null,
                      { shouldValidate: true }
                    );
                  }}
                />
                <p className="text-xs text-muted-foreground">{t("probeIntervalDesc")}</p>
              </div>
            </div>
          </div>

          {/* Session Affinity Migration Configuration Section */}
          <div className="border-t pt-6 mt-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              {t("affinityMigrationConfig")}
            </h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">{t("affinityMigrationEnabled")}</label>
                  <p className="text-xs text-muted-foreground">
                    {t("affinityMigrationEnabledDesc")}
                  </p>
                </div>
                <Switch
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
                      { shouldValidate: true }
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
                          { shouldValidate: true }
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
                    <p className="text-xs text-muted-foreground">
                      {t("affinityMigrationMetricDesc")}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("affinityMigrationThreshold")}</label>
                    <Input
                      type="number"
                      min={1}
                      max={10000000}
                      step={1}
                      placeholder="50000"
                      value={affinityMigration.threshold}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 50000;
                        form.setValue(
                          "affinity_migration",
                          {
                            ...affinityMigration,
                            threshold: val,
                          },
                          { shouldValidate: true }
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
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending
                ? isEdit
                  ? t("updating")
                  : t("creating")
                : isEdit
                  ? tCommon("save")
                  : tCommon("create")}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  );

  if (trigger) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        {dialogContent}
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {dialogContent}
    </Dialog>
  );
}

/**
 * M3 Create Upstream Button with Dialog
 */
export function CreateUpstreamButton() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("upstreams");

  return (
    <UpstreamFormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="tonal">
          <Plus className="h-4 w-4 mr-2" />
          {t("addUpstream")}
        </Button>
      }
    />
  );
}
