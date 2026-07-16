"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarIcon } from "lucide-react";
import { addDays, addYears, format, max, min, startOfDay } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import type { z } from "zod";

import { SectionForm } from "@/components/admin/section-form";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUpdateApiKeySection } from "@/hooks/use-api-keys";
import { getDateLocale } from "@/lib/date-locale";
import { cn } from "@/lib/utils";
import type { APIKeyResponse } from "@/types/api";

import { expiryDefaults } from "../form-values";
import { buildExpiryPayload } from "../section-payloads";
import { apiKeySectionSchemas } from "../section-schemas";

const schema = apiKeySectionSchemas["expiry"];
type Values = z.input<typeof schema>;

export function ExpirySection({ apiKey }: { apiKey: APIKeyResponse }) {
  const t = useTranslations("keys");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: expiryDefaults(apiKey),
  });
  const mutation = useUpdateApiKeySection();
  const today = startOfDay(new Date());

  const onSave = form.handleSubmit(() => {
    const parsed = schema.parse(form.getValues());
    mutation.mutate(
      { id: apiKey.id, payload: buildExpiryPayload(parsed) },
      { onSuccess: () => form.reset(form.getValues()) }
    );
  });

  return (
    <Form {...form}>
      <SectionForm
        title={t("expirationDate")}
        description={t("expirationDateDesc")}
        isDirty={form.formState.isDirty}
        isSaving={mutation.isPending}
        onSave={onSave}
        onReset={() => form.reset()}
      >
        <FormField
          control={form.control}
          name="expires_at"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              {/* 本区仅此一个字段，SectionForm 标题已可见呈现同一文案；FormLabel
                  保留以给日期选择控件可访问名，视觉上隐藏避免与标题重复。 */}
              <FormLabel className="sr-only">{t("expirationDate")}</FormLabel>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "h-11 flex-1 justify-between rounded-cf-sm border-border bg-surface-200 px-3 text-left font-normal hover:bg-surface-300",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? (
                          format(field.value, "PPP", { locale: dateLocale })
                        ) : (
                          <span>{t("selectDate")}</span>
                        )}
                        <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      locale={dateLocale}
                      mode="single"
                      selected={field.value ?? undefined}
                      onSelect={(date) => field.onChange(date ?? null)}
                      defaultMonth={field.value ?? undefined}
                      disabled={{ before: today }}
                      // 边界向已存储的过期时间扩展，保证过期/超远期的现值仍可在日历中查看
                      startMonth={field.value ? min([today, field.value]) : today}
                      endMonth={
                        field.value ? max([addYears(today, 10), field.value]) : addYears(today, 10)
                      }
                      autoFocus
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
                    {tCommon("clear")}
                  </Button>
                )}
              </div>
              <div className="flex gap-1.5">
                {([30, 90, 365] as const).map((days) => (
                  <Button
                    key={days}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-border bg-surface-200 hover:bg-surface-300"
                    onClick={() => field.onChange(addDays(today, days))}
                  >
                    {t(`expiryPresets.${days}`)}
                  </Button>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </SectionForm>
    </Form>
  );
}
