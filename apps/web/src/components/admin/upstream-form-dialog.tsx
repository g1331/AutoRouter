"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
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
import type { Upstream } from "@/types/api";

interface UpstreamFormDialogProps {
  upstream?: Upstream | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
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
  const createMutation = useCreateUpstream();
  const updateMutation = useUpdateUpstream();
  const t = useTranslations("upstreams");
  const tCommon = useTranslations("common");

  const upstreamFormSchema = z.object({
    name: z.string().min(1, t("upstreamNameRequired")).max(100),
    provider: z.string().min(1, t("providerRequired")),
    base_url: z.string().url(t("baseUrlRequired")),
    api_key: z.string().min(1, t("apiKeyRequired")),
    description: z.string().max(500).optional(),
  });

  type UpstreamForm = z.infer<typeof upstreamFormSchema>;

  const form = useForm<UpstreamForm>({
    resolver: zodResolver(upstreamFormSchema),
    defaultValues: {
      name: "",
      provider: "openai",
      base_url: "",
      api_key: "",
      description: "",
    },
  });

  useEffect(() => {
    if (upstream && open) {
      form.reset({
        name: upstream.name,
        provider: upstream.provider,
        base_url: upstream.base_url,
        api_key: "",
        description: upstream.description || "",
      });
    } else if (!open) {
      form.reset({
        name: "",
        provider: "openai",
        base_url: "",
        api_key: "",
        description: "",
      });
    }
  }, [upstream, open, form]);

  const onSubmit = async (data: UpstreamForm) => {
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: upstream.id,
          data: {
            name: data.name,
            provider: data.provider,
            base_url: data.base_url,
            api_key: data.api_key,
            description: data.description || null,
          },
        });
      } else {
        await createMutation.mutateAsync({
          name: data.name,
          provider: data.provider,
          base_url: data.base_url,
          api_key: data.api_key,
          description: data.description || null,
        });
      }

      onOpenChange(false);
      form.reset();
    } catch {
      // Error already handled by mutation onError
    }
  };

  const dialogContent = (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>
          {isEdit ? t("editUpstreamTitle") : t("createUpstreamTitle")}
        </DialogTitle>
        <DialogDescription>
          {t("createUpstreamDesc")}
        </DialogDescription>
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
                    <SelectItem value="azure">Azure OpenAI</SelectItem>
                    <SelectItem value="gemini">Google Gemini</SelectItem>
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
                  <Input
                    type="url"
                    placeholder={t("baseUrlPlaceholder")}
                    {...field}
                  />
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
                  <Input
                    type="password"
                    placeholder={t("apiKeyPlaceholder")}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {isEdit ? t("apiKeyEditHint") : undefined}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("upstreamDescription")}</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={t("upstreamDescriptionPlaceholder")}
                    rows={3}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
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
  const t = useTranslations("upstreams");

  return (
    <UpstreamFormDialog
      open={false}
      onOpenChange={() => {}}
      trigger={
        <Button variant="tonal">
          <Plus className="h-4 w-4 mr-2" />
          {t("addUpstream")}
        </Button>
      }
    />
  );
}
