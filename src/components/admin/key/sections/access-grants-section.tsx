"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import type { z } from "zod";

import { SectionForm } from "@/components/admin/section-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useUpdateApiKeySection } from "@/hooks/use-api-keys";
import { useAllUpstreams } from "@/hooks/use-upstreams";
import { cn } from "@/lib/utils";
import type { APIKeyResponse } from "@/types/api";

import { accessGrantsDefaults } from "../form-values";
import { buildAccessGrantsPayload } from "../section-payloads";
import { apiKeySectionSchemas } from "../section-schemas";

const schema = apiKeySectionSchemas["access-grants"];
type Values = z.input<typeof schema>;

const EMPTY_UPSTREAM_IDS: string[] = [];

export function AccessGrantsSection({ apiKey }: { apiKey: APIKeyResponse }) {
  const t = useTranslations("keys");
  const tCommon = useTranslations("common");
  const [upstreamSearchQuery, setUpstreamSearchQuery] = useState("");

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: accessGrantsDefaults(apiKey),
  });
  const mutation = useUpdateApiKeySection();

  const { data: upstreams, isLoading: upstreamsLoading } = useAllUpstreams();

  const accessMode = useWatch({ control: form.control, name: "access_mode" });
  const watchedUpstreamIds = useWatch({ control: form.control, name: "upstream_ids" });
  const selectedUpstreamIds = watchedUpstreamIds ?? EMPTY_UPSTREAM_IDS;

  const normalizedUpstreamSearchQuery = upstreamSearchQuery.trim().toLowerCase();
  const filteredUpstreams = (upstreams ?? []).filter((upstream) => {
    if (!normalizedUpstreamSearchQuery) {
      return true;
    }
    const searchableText = [upstream.name, upstream.description ?? ""].join(" ").toLowerCase();
    return searchableText.includes(normalizedUpstreamSearchQuery);
  });
  const filteredUpstreamIds = filteredUpstreams.map((upstream) => upstream.id);
  const selectedFilteredCount = filteredUpstreamIds.filter((id) =>
    selectedUpstreamIds.includes(id)
  ).length;
  const allFilteredUpstreamsSelected =
    filteredUpstreamIds.length > 0 && selectedFilteredCount === filteredUpstreamIds.length;

  const onSave = form.handleSubmit(
    () => {
      const parsed = schema.parse(form.getValues());
      mutation.mutate(
        { id: apiKey.id, payload: buildAccessGrantsPayload(parsed) },
        { onSuccess: () => form.reset(form.getValues()) }
      );
    },
    () => {
      // Replace the schema's plain-English refine text with the localized message.
      const values = form.getValues();
      if (values.access_mode === "restricted" && (values.upstream_ids ?? []).length === 0) {
        form.setError("upstream_ids", {
          type: "manual",
          message: t("selectUpstreamsRequired"),
        });
      }
    }
  );

  return (
    <Form {...form}>
      <SectionForm
        title={t("sectionAccessTitle")}
        description={t("sectionAccessDesc")}
        isDirty={form.formState.isDirty}
        isSaving={mutation.isPending}
        onSave={onSave}
        onReset={() => {
          form.reset();
          setUpstreamSearchQuery("");
        }}
      >
        <FormField
          control={form.control}
          name="access_mode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("upstreamAccessMode")}</FormLabel>
              <FormDescription>{t("upstreamAccessModeDesc")}</FormDescription>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className={cn(
                    "rounded-cf-md border p-4 text-left transition-colors",
                    field.value === "unrestricted"
                      ? "border-primary bg-primary/5"
                      : "border-divider-subtle bg-surface-200"
                  )}
                  onClick={() => field.onChange("unrestricted")}
                >
                  <div className="type-body-medium text-foreground">{t("unrestrictedAccess")}</div>
                  <p className="mt-1 type-body-small text-muted-foreground">
                    {t("unrestrictedAccessDesc")}
                  </p>
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-cf-md border p-4 text-left transition-colors",
                    field.value === "restricted"
                      ? "border-primary bg-primary/5"
                      : "border-divider-subtle bg-surface-200"
                  )}
                  onClick={() => field.onChange("restricted")}
                >
                  <div className="type-body-medium text-foreground">{t("restrictedAccess")}</div>
                  <p className="mt-1 type-body-small text-muted-foreground">
                    {t("restrictedAccessDesc")}
                  </p>
                </button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-out",
            accessMode === "restricted" ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          <div className="overflow-hidden">
            <FormField
              control={form.control}
              name="upstream_ids"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("selectUpstreams")} *</FormLabel>
                  <FormDescription>{t("selectUpstreamsDesc")}</FormDescription>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={upstreamSearchQuery}
                        onChange={(event) => setUpstreamSearchQuery(event.target.value)}
                        placeholder={t("searchUpstreams")}
                        aria-label={t("searchUpstreams")}
                        className="border-surface-400/70 bg-surface-200/70 pl-9 transition-colors duration-cf-fast hover:border-surface-400 focus-visible:border-amber-400/45 focus-visible:ring-amber-400/20"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={filteredUpstreamIds.length === 0}
                      onClick={() => {
                        if (allFilteredUpstreamsSelected) {
                          field.onChange(
                            (field.value ?? []).filter((id) => !filteredUpstreamIds.includes(id))
                          );
                          return;
                        }
                        field.onChange(
                          Array.from(new Set([...(field.value ?? []), ...filteredUpstreamIds]))
                        );
                      }}
                    >
                      {t(
                        allFilteredUpstreamsSelected
                          ? "deselectFilteredUpstreams"
                          : "selectFilteredUpstreams"
                      )}
                    </Button>
                  </div>
                  {!upstreamsLoading && !!upstreams?.length && (
                    <p className="mt-2 type-body-small text-muted-foreground">
                      {t("filteredUpstreamsSelected", {
                        selected: selectedFilteredCount,
                        total: filteredUpstreamIds.length,
                      })}
                    </p>
                  )}
                  <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-cf-md border border-divider-subtle bg-surface-200 p-3">
                    {upstreamsLoading ? (
                      <div className="py-4 text-center type-body-medium text-muted-foreground">
                        {tCommon("loading")}
                      </div>
                    ) : !upstreams || upstreams.length === 0 ? (
                      <div className="py-4 text-center type-body-medium text-muted-foreground">
                        {tCommon("noData")}
                      </div>
                    ) : filteredUpstreams.length === 0 ? (
                      <div className="py-4 text-center type-body-medium text-muted-foreground">
                        {t("noMatchingUpstreams")}
                      </div>
                    ) : (
                      filteredUpstreams.map((upstream) => (
                        <FormItem
                          key={upstream.id}
                          className="flex items-start gap-3 space-y-0 rounded-cf-md p-2 transition-colors hover:bg-foreground/10"
                        >
                          <FormControl>
                            <Checkbox
                              // The visible name sits in an unassociated sibling
                              // label, so name the checkbox directly (Radix renders
                              // it as an empty <button role="checkbox">).
                              aria-label={upstream.name}
                              checked={field.value?.includes(upstream.id)}
                              onCheckedChange={(checked) => {
                                const updated = checked
                                  ? [...(field.value || []), upstream.id]
                                  : field.value?.filter((id) => id !== upstream.id);
                                field.onChange(updated);
                              }}
                            />
                          </FormControl>
                          <div className="flex-1 space-y-1 leading-none">
                            <label className="cursor-pointer type-body-medium text-foreground">
                              {upstream.name}
                            </label>
                            {upstream.description && (
                              <p className="type-body-small text-muted-foreground">
                                {upstream.description}
                              </p>
                            )}
                          </div>
                        </FormItem>
                      ))
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      </SectionForm>
    </Form>
  );
}
