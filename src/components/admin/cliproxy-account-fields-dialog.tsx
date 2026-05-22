"use client";

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
import { useUpdateCliproxyAuthAccountFields } from "@/hooks/use-cliproxy";
import type { CliproxyAuthAccount, CliproxyAuthAccountFieldsUpdate } from "@/types/cliproxy";

interface CliproxyAccountFieldsDialogProps {
  instanceId: string;
  account: CliproxyAuthAccount;
  open: boolean;
  onClose: () => void;
}

interface FieldsForm {
  prefix: string;
  proxy_url: string;
  priority: string;
  note: string;
}

/**
 * OAuth 账号字段编辑弹窗，可编辑前缀、出站代理、优先级与备注。
 *
 * 出站代理在账号列表响应中不回显，留空表示沿用现有代理配置。
 */
export function CliproxyAccountFieldsDialog({
  instanceId,
  account,
  open,
  onClose,
}: CliproxyAccountFieldsDialogProps) {
  const t = useTranslations("cliproxy");
  const tCommon = useTranslations("common");
  const updateMutation = useUpdateCliproxyAuthAccountFields();

  const schema = z.object({
    prefix: z.string().trim().max(128),
    proxy_url: z.string().trim().max(512),
    priority: z
      .string()
      .trim()
      .refine((value) => value === "" || Number.isInteger(Number(value)), {
        message: t("fieldPriority"),
      }),
    note: z.string().trim().max(512),
  });

  const form = useForm<FieldsForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      prefix: account.prefix ?? "",
      proxy_url: "",
      priority: account.priority != null ? String(account.priority) : "",
      note: account.note ?? "",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const data: CliproxyAuthAccountFieldsUpdate = {
      prefix: values.prefix.trim(),
      priority: values.priority.trim() === "" ? 0 : Number(values.priority),
      note: values.note.trim(),
    };
    if (values.proxy_url.trim()) {
      data.proxy_url = values.proxy_url.trim();
    }
    try {
      await updateMutation.mutateAsync({
        instanceId,
        accountName: account.auth_file_name,
        data,
      });
      onClose();
    } catch {
      // 错误已由 mutation 的 onError 提示
    }
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("editAccountFieldsTitle")}</DialogTitle>
          <DialogDescription>
            {t("accountFileLabel")}: {account.auth_file_name}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="prefix"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fieldPrefix")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("fieldPrefixPlaceholder")} {...field} />
                  </FormControl>
                  <FormDescription>{t("fieldPrefixHint")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="proxy_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fieldProxyUrl")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("fieldProxyUrlPlaceholder")} {...field} />
                  </FormControl>
                  <FormDescription>{t("fieldProxyUrlHint")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fieldPriority")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="1"
                      placeholder={t("fieldPriorityPlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fieldNote")}</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder={t("fieldNotePlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t("saving") : tCommon("save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
