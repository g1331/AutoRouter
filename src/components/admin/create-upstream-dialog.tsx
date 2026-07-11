"use client";

import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { RouteCapabilityMultiSelect } from "@/components/admin/route-capability-badges";
import { resolveEndpointPreview } from "@/components/admin/upstream/endpoint-preview";
import { useCreateUpstream } from "@/hooks/use-upstreams";
import { useRouter } from "@/i18n/navigation";
import { ROUTE_CAPABILITY_VALUES, areSingleProviderCapabilities } from "@/lib/route-capabilities";
import { statusTone } from "@/lib/status-tone";
import { cn } from "@/lib/utils";

interface CreateUpstreamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 启用容器变形动画（View Transition）。 */
  morph?: boolean;
  /** 容器变形使用的 view-transition-name，需与触发它的源元素一致。 */
  morphName?: string;
}

/**
 * Thin create dialog: captures only the required fields to register an upstream
 * (name, base URL, route capabilities, API key); the backend fills the rest with
 * defaults. On success it routes to the `/upstreams/[id]` detail page where every
 * other setting is edited per section. The full configuration surface lives on the
 * detail page, not here.
 */
export function CreateUpstreamDialog({
  open,
  onOpenChange,
  morph,
  morphName,
}: CreateUpstreamDialogProps) {
  const t = useTranslations("upstreams");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const createMutation = useCreateUpstream();

  const schema = useMemo(
    () =>
      z
        .object({
          name: z.string().min(1, t("upstreamNameRequired")).max(100),
          base_url: z.string().min(1, t("baseUrlRequired")).url(t("baseUrlInvalid")),
          route_capabilities: z
            .array(z.enum(ROUTE_CAPABILITY_VALUES))
            .min(1, t("routeCapabilitiesRequired")),
          api_key: z.string().min(1, t("apiKeyRequired")),
        })
        .refine((data) => areSingleProviderCapabilities(data.route_capabilities), {
          message: t("routeCapabilitiesSameProvider"),
          path: ["route_capabilities"],
        }),
    [t]
  );
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", base_url: "", route_capabilities: [], api_key: "" },
  });

  const watchedBaseUrl = useWatch({ control: form.control, name: "base_url" });
  const watchedCapabilities = useWatch({ control: form.control, name: "route_capabilities" });
  const endpointPreview = useMemo(
    () => resolveEndpointPreview(watchedBaseUrl ?? "", watchedCapabilities),
    [watchedBaseUrl, watchedCapabilities]
  );

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      form.reset();
    }
    onOpenChange(next);
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const normalizedBaseUrl =
        resolveEndpointPreview(values.base_url, values.route_capabilities)?.normalizedBaseUrl ??
        values.base_url.trim();
      const created = await createMutation.mutateAsync({
        name: values.name,
        base_url: normalizedBaseUrl,
        api_key: values.api_key,
        route_capabilities: values.route_capabilities,
      });
      form.reset();
      onOpenChange(false);
      router.push(`/upstreams/${created.id}`);
    } catch {
      // 错误已由 mutation onError 处理
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg" morph={morph} morphName={morphName}>
        <DialogHeader>
          <DialogTitle>{t("createUpstreamTitle")}</DialogTitle>
          <DialogDescription>{t("createUpstreamDesc")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("upstreamName")} *</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="off"
                      placeholder={t("upstreamNamePlaceholder")}
                      {...field}
                    />
                  </FormControl>
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
              name="route_capabilities"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("routeCapabilities")} *</FormLabel>
                  <FormControl>
                    <RouteCapabilityMultiSelect selected={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
            </div>

            <FormField
              control={form.control}
              name="api_key"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("apiKey")} *</FormLabel>
                  <FormControl>
                    <PasswordInput
                      autoComplete="new-password"
                      placeholder={t("apiKeyPlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? t("creating") : t("createUpstream")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
