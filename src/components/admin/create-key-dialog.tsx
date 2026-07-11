"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateAPIKey } from "@/hooks/use-api-keys";
import { useRouter } from "@/i18n/navigation";
import type { APIKeyCreateResponse } from "@/types/api";
import { ShowKeyDialog } from "./show-key-dialog";

interface CreateKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 启用容器变形动画（View Transition）。 */
  morph?: boolean;
  /** 容器变形使用的 view-transition-name，需与触发它的源元素一致。 */
  morphName?: string;
}

/**
 * Thin create dialog: captures only the required field (name) plus an optional
 * description to register an API key; the backend fills the rest with defaults
 * (unrestricted access, no expiry). On success it shows the one-time key reveal
 * (the secret is only returned once), and once that closes it routes to the
 * `/keys/[id]` detail page where access, spending rules, the model allowlist,
 * and expiry are configured per section.
 *
 * Page-controlled (open / onOpenChange) so the trigger button can drive the
 * container-morph animation; the one-time reveal dialog is intentionally not
 * morphed.
 */
export function CreateKeyDialog({ open, onOpenChange, morph, morphName }: CreateKeyDialogProps) {
  const [createdKey, setCreatedKey] = useState<APIKeyCreateResponse | null>(null);
  const createMutation = useCreateAPIKey();
  const router = useRouter();
  const t = useTranslations("keys");
  const tCommon = useTranslations("common");

  const schema = z.object({
    name: z.string().min(1, t("keyNameRequired")).max(100),
    description: z.string().max(500).optional(),
  });
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "" },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const result = await createMutation.mutateAsync({
        name: values.name,
        description: values.description || null,
        upstream_ids: [],
      });
      setCreatedKey(result);
      onOpenChange(false);
      form.reset();
    } catch {
      // Error already handled by mutation onError
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      form.reset();
    }
    onOpenChange(nextOpen);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg" morph={morph} morphName={morphName}>
          <DialogHeader>
            <DialogTitle>{t("createKeyTitle")}</DialogTitle>
            <DialogDescription>{t("createKeyDesc")}</DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                    <FormDescription>{t("createKeyConfigureHint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
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
          onClose={() => {
            const createdId = createdKey.id;
            setCreatedKey(null);
            // Continue configuration (access, spending, models, expiry) on the
            // detail page now that the one-time secret has been shown.
            router.push(`/keys/${createdId}`);
          }}
        />
      )}
    </>
  );
}
