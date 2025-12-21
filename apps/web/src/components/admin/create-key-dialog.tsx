"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, CalendarIcon } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useCreateAPIKey } from "@/hooks/use-api-keys";
import { useAllUpstreams } from "@/hooks/use-upstreams";
import type { APIKeyCreateResponse } from "@/types/api";
import { ShowKeyDialog } from "./show-key-dialog";
import { getDateLocale } from "@/lib/date-locale";

/**
 * M3 Create API Key Dialog
 */
export function CreateKeyDialog() {
  const [open, setOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<APIKeyCreateResponse | null>(null);
  const createMutation = useCreateAPIKey();
  const t = useTranslations("keys");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);

  const { data: upstreams, isLoading: upstreamsLoading } = useAllUpstreams();

  const createKeySchema = z.object({
    name: z.string().min(1, t("keyNameRequired")).max(100),
    description: z.string().max(500).optional(),
    upstream_ids: z.array(z.string()).min(1, t("selectUpstreamsRequired")),
    expires_at: z.date().optional(),
  });

  type CreateKeyForm = z.infer<typeof createKeySchema>;

  const form = useForm<CreateKeyForm>({
    resolver: zodResolver(createKeySchema),
    defaultValues: {
      name: "",
      description: "",
      upstream_ids: [],
      expires_at: undefined,
    },
  });

  const onSubmit = async (data: CreateKeyForm) => {
    try {
      const result = await createMutation.mutateAsync({
        name: data.name,
        description: data.description || null,
        upstream_ids: data.upstream_ids,
        expires_at: data.expires_at ? data.expires_at.toISOString() : null,
      });

      setCreatedKey(result);
      setOpen(false);
      form.reset();
    } catch {
      // Error already handled by mutation onError
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            {t("createKey")}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("createKeyTitle")}</DialogTitle>
            <DialogDescription>{t("createKeyDesc")}</DialogDescription>
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
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal justify-start",
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
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  {tCommon("cancel")}
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t("creating") : tCommon("create")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {createdKey && (
        <ShowKeyDialog
          apiKey={createdKey}
          open={!!createdKey}
          onClose={() => setCreatedKey(null)}
        />
      )}
    </>
  );
}
