"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
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

type UpstreamFormData = z.infer<typeof createUpstreamFormSchema>;

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
  const createMutation = useCreateUpstream();
  const updateMutation = useUpdateUpstream();
  const t = useTranslations("upstreams");
  const tCommon = useTranslations("common");

  const form = useForm<UpstreamFormData>({
    resolver: zodResolver(isEdit ? editUpstreamFormSchema : createUpstreamFormSchema),
    defaultValues: {
      name: "",
      base_url: "",
      api_key: "",
      description: "",
      priority: 0,
      weight: 1,
      billing_input_multiplier: 1,
      billing_output_multiplier: 1,
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
        route_capabilities: [],
        allowed_models: null,
        model_redirects: null,
        circuit_breaker_config: null,
        affinity_migration: null,
      });
    }
  }, [upstream, open, form]);

  const onSubmit = async (data: UpstreamFormData) => {
    try {
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
        // 创建模式: api_key 必填，schema 已验证非空
        await createMutation.mutateAsync({
          name: data.name,
          base_url: data.base_url,
          api_key: data.api_key!,
          description: data.description || null,
          priority: data.priority,
          weight: data.weight,
          billing_input_multiplier: data.billing_input_multiplier,
          billing_output_multiplier: data.billing_output_multiplier,
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
