"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useUpdateAPIKey } from "@/hooks/use-api-keys";
import { useAllUpstreams } from "@/hooks/use-upstreams";
import type { APIKeyResponse } from "@/types/api";
import { getDateLocale } from "@/lib/date-locale";

interface EditKeyDialogProps {
  apiKey: APIKeyResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Edit API Key Dialog
 */
export function EditKeyDialog({ apiKey, open, onOpenChange }: EditKeyDialogProps) {
  const updateMutation = useUpdateAPIKey();
  const t = useTranslations("keys");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);

  const { data: upstreams, isLoading: upstreamsLoading } = useAllUpstreams();

  const editKeySchema = z.object({
    name: z.string().min(1, t("keyNameRequired")).max(100),
    description: z.string().max(500).optional(),
    is_active: z.boolean(),
    upstream_ids: z.array(z.string()).min(1, t("selectUpstreamsRequired")),
    expires_at: z.date().nullable().optional(),
  });

  type EditKeyForm = z.infer<typeof editKeySchema>;

  const form = useForm<EditKeyForm>({
    resolver: zodResolver(editKeySchema),
    defaultValues: {
      name: apiKey.name,
      description: apiKey.description || "",
      is_active: apiKey.is_active,
      upstream_ids: apiKey.upstream_ids,
      expires_at: apiKey.expires_at ? new Date(apiKey.expires_at) : null,
    },
  });

  // Reset form when apiKey changes
  useEffect(() => {
    form.reset({
      name: apiKey.name,
      description: apiKey.description || "",
      is_active: apiKey.is_active,
      upstream_ids: apiKey.upstream_ids,
      expires_at: apiKey.expires_at ? new Date(apiKey.expires_at) : null,
    });
  }, [apiKey, form]);

  const onSubmit = async (data: EditKeyForm) => {
    try {
      await updateMutation.mutateAsync({
        id: apiKey.id,
        data: {
          name: data.name,
          description: data.description || null,
          is_active: data.is_active,
          upstream_ids: data.upstream_ids,
          expires_at: data.expires_at ? data.expires_at.toISOString() : null,
        },
      });

      onOpenChange(false);
    } catch {
      // Error already handled by mutation onError
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("editKeyTitle")}</DialogTitle>
          <DialogDescription>{t("editKeyDesc")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("keyName")} *</FormLabel>
                  <FormControl>
                    <Input placeholder={t("keyNamePlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("keyDescription")}</FormLabel>
                  <FormControl>
                    <Textarea placeholder={t("keyDescriptionPlaceholder")} rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-lg border p-4">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">{t("keyActive")}</FormLabel>
                    <FormDescription>{t("keyActiveDesc")}</FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="upstream_ids"
              render={() => (
                <FormItem>
                  <FormLabel>{t("selectUpstreams")} *</FormLabel>
                  <FormDescription>{t("selectUpstreamsDesc")}</FormDescription>
                  <div className="space-y-2 mt-2 max-h-48 overflow-y-auto bg-[rgb(var(--md-sys-color-surface-container-low))] rounded-[var(--shape-corner-medium)] p-3 border border-[rgb(var(--md-sys-color-outline-variant))]">
                    {upstreamsLoading ? (
                      <div className="type-body-medium text-[rgb(var(--md-sys-color-on-surface-variant))] text-center py-4">
                        {tCommon("loading")}
                      </div>
                    ) : !upstreams || upstreams.length === 0 ? (
                      <div className="type-body-medium text-[rgb(var(--md-sys-color-on-surface-variant))] text-center py-4">
                        {tCommon("noData")}
                      </div>
                    ) : (
                      upstreams.map((upstream) => (
                        <FormField
                          key={upstream.id}
                          control={form.control}
                          name="upstream_ids"
                          render={({ field }) => (
                            <FormItem className="flex items-start space-x-3 space-y-0 p-2 rounded-[var(--shape-corner-small)] hover:bg-[rgb(var(--md-sys-color-on-surface)_/_0.08)] transition-colors">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(upstream.id)}
                                  onCheckedChange={(checked) => {
                                    const updated = checked
                                      ? [...(field.value || []), upstream.id]
                                      : field.value?.filter((id) => id !== upstream.id);
                                    field.onChange(updated);
                                  }}
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none flex-1">
                                <label className="type-body-medium text-[rgb(var(--md-sys-color-on-surface))] cursor-pointer">
                                  {upstream.name}
                                </label>
                                {upstream.description && (
                                  <p className="type-body-small text-[rgb(var(--md-sys-color-on-surface-variant))]">
                                    {upstream.description}
                                  </p>
                                )}
                              </div>
                            </FormItem>
                          )}
                        />
                      ))
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="expires_at"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>{t("expirationDate")}</FormLabel>
                  <FormDescription>{t("expirationDateDesc")}</FormDescription>
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal justify-start flex-1",
                              !field.value && "text-[rgb(var(--md-sys-color-on-surface-variant))]"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: dateLocale })
                            ) : (
                              <span>{t("selectDate")}</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {field.value && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => field.onChange(null)}
                      >
                        {tCommon("cancel")}
                      </Button>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t("updating") : tCommon("save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
