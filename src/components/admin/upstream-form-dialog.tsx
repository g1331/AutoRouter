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
import { useAllUpstreamGroups } from "@/hooks/use-upstream-groups";
import type { Upstream, Provider, ProviderType } from "@/types/api";
import { TagInput } from "@/components/ui/tag-input";
import { KeyValueInput } from "@/components/ui/key-value-input";

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
    open_duration: z.number().int().min(1000).max(300000).optional(),
    probe_interval: z.number().int().min(1000).max(60000).optional(),
  })
  .nullable();

// Schema for create mode - api_key is required
const createUpstreamFormSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(["openai", "anthropic"]),
  base_url: z.string().url(),
  api_key: z.string().min(1),
  description: z.string().max(500),
  group_id: z.string().nullable(),
  weight: z.number().int().min(1).max(100),
  provider_type: z.enum(["anthropic", "openai", "google", "custom"]).nullable(),
  allowed_models: z.array(z.string()).nullable(),
  model_redirects: z.record(z.string(), z.string()).nullable(),
  circuit_breaker_config: circuitBreakerConfigSchema,
});

// Schema for edit mode - api_key is optional (leave empty to keep unchanged)
const editUpstreamFormSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(["openai", "anthropic"]),
  base_url: z.string().url(),
  api_key: z.string(),
  description: z.string().max(500),
  group_id: z.string().nullable(),
  weight: z.number().int().min(1).max(100),
  provider_type: z.enum(["anthropic", "openai", "google", "custom"]).nullable(),
  allowed_models: z.array(z.string()).nullable(),
  model_redirects: z.record(z.string(), z.string()).nullable(),
  circuit_breaker_config: circuitBreakerConfigSchema,
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
  const { data: upstreamGroups = [], isLoading: groupsLoading } = useAllUpstreamGroups();
  const t = useTranslations("upstreams");
  const tCommon = useTranslations("common");

  const form = useForm<UpstreamFormData>({
    resolver: zodResolver(isEdit ? editUpstreamFormSchema : createUpstreamFormSchema),
    defaultValues: {
      name: "",
      provider: "openai",
      base_url: "",
      api_key: "",
      description: "",
      group_id: null,
      weight: 1,
      provider_type: null,
      allowed_models: null,
      model_redirects: null,
      circuit_breaker_config: null,
    },
  });

  // Watch group_id to conditionally show weight field
  const selectedGroupId = useWatch({
    control: form.control,
    name: "group_id",
  });

  // Watch circuit_breaker_config for controlled inputs
  const circuitBreakerConfig = useWatch({
    control: form.control,
    name: "circuit_breaker_config",
  });

  useEffect(() => {
    if (upstream && open) {
      form.reset({
        name: upstream.name,
        provider: upstream.provider,
        base_url: upstream.base_url,
        api_key: "",
        description: upstream.description || "",
        group_id: upstream.group_id || null,
        weight: upstream.weight ?? 1,
        provider_type: upstream.provider_type || null,
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
      });
    } else if (!open) {
      form.reset({
        name: "",
        provider: "openai",
        base_url: "",
        api_key: "",
        description: "",
        group_id: null,
        weight: 1,
        provider_type: null,
        allowed_models: null,
        model_redirects: null,
        circuit_breaker_config: null,
      });
    }
  }, [upstream, open, form]);

  const onSubmit = async (data: UpstreamFormData) => {
    try {
      if (isEdit) {
        // 只有填写了 api_key 才更新
        const updateData: {
          name: string;
          provider: Provider;
          base_url: string;
          api_key?: string;
          description: string | null;
          group_id?: string | null;
          weight?: number;
          provider_type?: ProviderType | null;
          allowed_models?: string[] | null;
          model_redirects?: Record<string, string> | null;
          circuit_breaker_config?: {
            failure_threshold?: number;
            success_threshold?: number;
            open_duration?: number;
            probe_interval?: number;
          } | null;
        } = {
          name: data.name,
          provider: data.provider,
          base_url: data.base_url,
          description: data.description || null,
          group_id: data.group_id || null,
          weight: data.weight,
          provider_type: data.provider_type,
          allowed_models: data.allowed_models,
          model_redirects: data.model_redirects,
          circuit_breaker_config: data.circuit_breaker_config,
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
          provider: data.provider,
          base_url: data.base_url,
          api_key: data.api_key!,
          description: data.description || null,
          group_id: data.group_id || null,
          weight: data.weight,
          provider_type: data.provider_type,
          allowed_models: data.allowed_models,
          model_redirects: data.model_redirects,
          circuit_breaker_config: data.circuit_breaker_config,
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
            name="provider"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("provider")} *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t("providerPlaceholder")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                  </SelectContent>
                </Select>
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
            name="group_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("group")}</FormLabel>
                <Select
                  onValueChange={(value) => field.onChange(value === "__none__" ? null : value)}
                  value={field.value || "__none__"}
                  disabled={groupsLoading}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t("groupPlaceholder")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__none__">{t("noGroup")}</SelectItem>
                    {upstreamGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>{t("groupDescription")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {selectedGroupId && (
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
          )}

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
              name="provider_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("providerType")}</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(value === "__none__" ? null : value)}
                    value={field.value || "__none__"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("providerTypePlaceholder")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">{t("noProviderType")}</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="google">Google</SelectItem>
                      <SelectItem value="custom">{t("custom")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>{t("providerTypeDescription")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                  min={1000}
                  max={300000}
                  step={1000}
                  placeholder="30000"
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
                  min={1000}
                  max={60000}
                  step={1000}
                  placeholder="10000"
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
