"use client";

import { useEffect, useState } from "react";
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
import { useAllUpstreamGroups } from "@/hooks/use-upstream-groups";
import type { Upstream, Provider } from "@/types/api";

interface UpstreamFormDialogProps {
  upstream?: Upstream | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
}

// Schema for create mode - api_key is required
const createUpstreamFormSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(["openai", "anthropic"]),
  base_url: z.string().url(),
  api_key: z.string().min(1),
  description: z.string().max(500),
  group_id: z.string().nullable(),
  weight: z.number().int().min(1).max(100),
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
    },
  });

  // Watch group_id to conditionally show weight field
  const selectedGroupId = form.watch("group_id");

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
        } = {
          name: data.name,
          provider: data.provider,
          base_url: data.base_url,
          description: data.description || null,
          group_id: data.group_id || null,
          weight: data.weight,
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
